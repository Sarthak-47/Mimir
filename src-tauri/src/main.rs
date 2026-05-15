// Prevents a console window appearing in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

// Absolute backend path baked in at compile time by build.rs.
// Override at runtime with the MIMIR_BACKEND environment variable.
const BUILTIN_BACKEND: &str = env!("MIMIR_BACKEND_PATH");

// ── Managed state ─────────────────────────────────────────────
struct Processes(Mutex<Vec<Child>>);

// ── Backend discovery ─────────────────────────────────────────

/// In production: find the PyInstaller-bundled mimir-backend.exe
/// that Tauri copied into the install directory as a resource.
fn find_bundled_backend() -> Option<PathBuf> {
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let candidate = exe_dir.join("mimir-backend").join("mimir-backend.exe");
    if candidate.exists() { Some(candidate) } else { None }
}

/// In dev mode: find the Python backend source directory.
/// Tries (in order): MIMIR_BACKEND env var → baked compile-time path → relative to exe.
fn find_backend() -> Option<PathBuf> {
    let candidates: Vec<PathBuf> = [
        std::env::var("MIMIR_BACKEND").ok().map(PathBuf::from),
        Some(PathBuf::from(BUILTIN_BACKEND)),
        std::env::current_exe().ok().and_then(|exe| {
            let p = exe.parent()?.parent()?.parent()?.parent()?.join("backend");
            Some(p)
        }),
    ]
    .into_iter()
    .flatten()
    .collect();

    candidates.into_iter().find(|p| p.join("main.py").exists())
}

/// Prefer the project's own venv interpreter; fall back to system Python.
fn find_python(backend: &PathBuf) -> String {
    let venv = backend
        .join(".venv")
        .join("Scripts")
        .join("python.exe");
    if venv.exists() {
        return venv.to_string_lossy().into_owned();
    }
    "python".to_string()
}

/// Spawn a command with no visible console window on Windows.
fn spawn_hidden(cmd: &mut Command) -> Option<Child> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn().ok()
}

// ── Entry point ───────────────────────────────────────────────
fn main() {
    let mut procs: Vec<Child> = Vec::new();

    // 1. FastAPI backend ───────────────────────────────────────
    // Production: use the PyInstaller bundle copied in by Tauri.
    // Dev mode: fall back to spawning Python directly.
    if let Some(backend_exe) = find_bundled_backend() {
        if let Some(child) = spawn_hidden(&mut Command::new(&backend_exe)) {
            procs.push(child);
        }
    } else if let Some(backend_dir) = find_backend() {
        let python = find_python(&backend_dir);
        if let Some(child) = spawn_hidden(
            Command::new(&python)
                .args([
                    "-m", "uvicorn", "main:app",
                    "--host", "127.0.0.1",
                    "--port", "8000",
                    "--log-level", "error",
                ])
                .current_dir(&backend_dir),
        ) {
            procs.push(child);
        }
    }

    // 2. Ollama ───────────────────────────────────────────────
    // `ollama serve` is idempotent — if it's already running it
    // exits immediately with an error, which we safely ignore.
    if let Some(child) = spawn_hidden(Command::new("ollama").arg("serve")) {
        procs.push(child);
    }

    // 3. Tauri window — kill children on app exit ─────────────
    tauri::Builder::default()
        .manage(Processes(Mutex::new(procs)))
        .build(tauri::generate_context!())
        .expect("error building Mimir")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Ok(mut guard) = app.state::<Processes>().0.lock() {
                    for child in guard.iter_mut() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
