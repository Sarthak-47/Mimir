//! Mimir — Tauri host process.
//!
//! Spawns the FastAPI backend (either as a PyInstaller bundle or via the
//! Python dev server) and starts `ollama serve` before opening the Tauri
//! window. On application exit all spawned child processes are killed.
//!
//! Backend discovery order (production):
//!   1. `<resource_dir>/mimir-backend/mimir-backend[.exe]`  (PyInstaller bundle)
//! Backend discovery order (dev):
//!   2. `MIMIR_BACKEND` environment variable
//!   3. Compile-time `MIMIR_BACKEND_PATH` constant baked in by `build.rs`
//!   4. `../../../../backend` relative to the executable (workspace layout)

// Prevents a console window appearing in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager,
};
use zip::ZipArchive;

// Absolute backend path baked in at compile time by build.rs.
// Override at runtime with the MIMIR_BACKEND environment variable.
const BUILTIN_BACKEND: &str = env!("MIMIR_BACKEND_PATH");

// ── Managed state ─────────────────────────────────────────────
struct Processes(Mutex<Vec<Child>>);

// ── Backend discovery ─────────────────────────────────────────

/// Locate the PyInstaller-bundled backend binary inside the Tauri resource dir.
///
/// `resource_dir` is resolved by Tauri's path API and is platform-correct:
/// - Windows:  `<install_dir>/`
/// - macOS:    `<App>.app/Contents/Resources/`
/// - Linux:    varies by package format (AppImage, deb, etc.)
///
/// Returns `None` if the bundle does not exist (dev mode).
fn find_bundled_backend(resource_dir: &PathBuf) -> Option<PathBuf> {
    #[cfg(windows)]
    let name = "mimir-backend.exe";
    #[cfg(not(windows))]
    let name = "mimir-backend";

    let candidate = resource_dir.join("mimir-backend").join(name);
    if candidate.exists() { Some(candidate) } else { None }
}

/// Ensure the `_internal` directory is present next to the backend binary.
///
/// On first launch the installer only drops the binary and
/// `backend-internal.zip` into the resource directory.
/// This function detects a missing `_internal` tree via a sentinel file and
/// extracts the zip in-place before we try to launch the binary.
///
/// Idempotent — if the sentinel file already exists the function returns
/// immediately without touching the filesystem.
fn ensure_internal_dir(resource_dir: &PathBuf) {
    let sentinel = resource_dir
        .join("mimir-backend")
        .join("_internal")
        .join("pydantic_core")
        .join("__init__.py");

    let zip_path = resource_dir.join("backend-internal.zip");

    // Re-extract if _internal is missing OR if the zip is newer than the sentinel
    // (the latter handles upgrades where NSIS replaces the zip but leaves _internal intact).
    if sentinel.exists() {
        let stale = zip_path.metadata().ok()
            .and_then(|zm| zm.modified().ok())
            .zip(sentinel.metadata().ok().and_then(|sm| sm.modified().ok()))
            .map(|(zip_mt, sentinel_mt)| zip_mt > sentinel_mt)
            .unwrap_or(false);

        if !stale {
            return; // Already extracted and up to date.
        }

        // Zip is newer — remove old _internal so we extract a clean copy.
        let internal_dir = resource_dir.join("mimir-backend").join("_internal");
        if let Err(e) = fs::remove_dir_all(&internal_dir) {
            eprintln!("[mimir] warn: could not remove stale _internal: {e}");
        }
    }

    if !zip_path.exists() {
        return; // Dev mode or unexpected layout — skip silently.
    }

    let dest_dir = resource_dir.join("mimir-backend").join("_internal");

    let zip_file = match fs::File::open(&zip_path) {
        Ok(f) => f,
        Err(e) => { eprintln!("[mimir] warn: cannot open backend-internal.zip: {e}"); return; }
    };
    let mut archive = match ZipArchive::new(zip_file) {
        Ok(a) => a,
        Err(e) => { eprintln!("[mimir] warn: invalid backend-internal.zip: {e}"); return; }
    };

    let total = archive.len();
    let mut extracted = 0usize;

    for i in 0..total {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(e) => { eprintln!("[mimir] warn: zip entry {i} error: {e}"); continue; }
        };

        if entry.is_dir() {
            continue;
        }

        // Normalise path separators: Compress-Archive writes '\' on Windows but
        // the zip spec requires '/'. Replace so enclosed_name() works correctly.
        let raw_name = entry.name().replace('\\', "/");

        // Safety: skip absolute paths and directory-traversal components.
        if raw_name.is_empty() || raw_name.starts_with('/') || raw_name.contains("../") {
            continue;
        }

        let out_path = dest_dir.join(PathBuf::from(&raw_name));

        if let Some(parent) = out_path.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                eprintln!("[mimir] warn: mkdir {}: {e}", parent.display());
                continue;
            }
        }

        let mut out_file = match fs::File::create(&out_path) {
            Ok(f) => f,
            Err(e) => { eprintln!("[mimir] warn: create {}: {e}", out_path.display()); continue; }
        };

        if let Err(e) = io::copy(&mut entry, &mut out_file) {
            eprintln!("[mimir] warn: copy {}: {e}", out_path.display());
            continue;
        }

        // Preserve executable bit on Unix (needed for shared libraries).
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Some(mode) = entry.unix_mode() {
                let _ = fs::set_permissions(&out_path, fs::Permissions::from_mode(mode));
            }
        }

        extracted += 1;
    }

    eprintln!("[mimir] extracted {extracted}/{total} entries from backend-internal.zip");
}

/// Locate the Python backend source directory in dev mode.
///
/// Tries three candidates in order:
/// 1. `MIMIR_BACKEND` environment variable.
/// 2. Compile-time `MIMIR_BACKEND_PATH` constant baked in by `build.rs`.
/// 3. `../../../../backend` relative to the current executable.
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

/// Resolve the Python interpreter for dev mode.
///
/// Prefers the virtualenv interpreter so the correct packages are loaded.
/// Platform-aware: Windows uses `Scripts\python.exe`, Unix uses `bin/python3`.
fn find_python(backend: &PathBuf) -> String {
    #[cfg(windows)]
    let venv = backend.join(".venv").join("Scripts").join("python.exe");
    #[cfg(not(windows))]
    let venv = backend.join(".venv").join("bin").join("python3");

    if venv.exists() {
        return venv.to_string_lossy().into_owned();
    }

    #[cfg(windows)]
    return "python".to_string();
    #[cfg(not(windows))]
    return "python3".to_string();
}

/// Spawn `cmd` without a visible console window on Windows.
///
/// Uses `CREATE_NO_WINDOW` on Windows; plain `spawn()` on other platforms.
fn spawn_hidden(cmd: &mut Command) -> Option<Child> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn().ok()
}

// ── Startup logger (writes to %LOCALAPPDATA%\Mimir\startup.log) ──────────
fn log(msg: &str) {
    let path = std::env::var("LOCALAPPDATA")
        .map(|d| PathBuf::from(d).join("Mimir").join("startup.log"))
        .unwrap_or_else(|_| PathBuf::from("startup.log"));
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{msg}");
    }
}

// ── Entry point ───────────────────────────────────────────────
fn main() {
    log("=== Mimir starting ===");
    log("plugins: notification");
    log("plugins: process");
    log("plugins: global-shortcut");
    log("manage: processes");
    log("setup: registering closure");
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        // updater removed — requires signing keys configured in tauri.conf.json
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(Processes(Mutex::new(Vec::new())))
        .setup(|app| {
            // ── Resolve resource directory (platform-correct) ──────
            // Falls back to exe directory if Tauri can't resolve it
            // (shouldn't happen in production).
            let resource_dir: PathBuf = app
                .path()
                .resource_dir()
                .unwrap_or_else(|_| {
                    std::env::current_exe()
                        .ok()
                        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
                        .unwrap_or_default()
                });
            log(&format!("resource_dir: {}", resource_dir.display()));

            // ── 1. FastAPI backend ─────────────────────────────────
            ensure_internal_dir(&resource_dir);

            let mut procs: Vec<Child> = Vec::new();

            if let Some(backend_exe) = find_bundled_backend(&resource_dir) {
                log(&format!("spawning backend: {}", backend_exe.display()));
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
            } else {
                log("warn: no backend found");
            }

            // ── 2. Ollama ──────────────────────────────────────────
            // `ollama serve` is idempotent — exits immediately if already running.
            if let Some(child) = spawn_hidden(Command::new("ollama").arg("serve")) {
                procs.push(child);
            }

            // Store process handles so they can be killed on exit.
            *app.state::<Processes>().0.lock().unwrap() = procs;
            log("processes spawned");

            // ── 3. System tray ─────────────────────────────────────
            // All tray operations are non-fatal — log and continue if they fail.
            log("building tray...");
            match (
                MenuItem::with_id(app, "show", "Show Mimir", true, None::<&str>),
                MenuItem::with_id(app, "quit", "Quit",       true, None::<&str>),
            ) {
                (Ok(show_item), Ok(quit_item)) => {
                    match Menu::with_items(app, &[&show_item, &quit_item]) {
                        Ok(menu) => {
                            let tray = TrayIconBuilder::new()
                                .menu(&menu)
                                .tooltip("Mimir")
                                .on_menu_event(|app, event| match event.id.as_ref() {
                                    "show" => {
                                        if let Some(win) = app.get_webview_window("main") {
                                            let _ = win.show();
                                            let _ = win.set_focus();
                                        }
                                    }
                                    "quit" => app.exit(0),
                                    _ => {}
                                })
                                .on_tray_icon_event(|tray, event| {
                                    if let TrayIconEvent::Click { .. } = event {
                                        let app = tray.app_handle();
                                        if let Some(win) = app.get_webview_window("main") {
                                            let _ = win.show();
                                            let _ = win.set_focus();
                                        }
                                    }
                                })
                                .build(app);
                            match tray {
                                Ok(_)  => log("tray built ok"),
                                Err(e) => log(&format!("warn: tray build failed: {e}")),
                            }
                        }
                        Err(e) => log(&format!("warn: menu build failed: {e}")),
                    }
                }
                _ => log("warn: menu item creation failed"),
            }

            // ── 4. Global shortcut: Ctrl+Shift+M → show/hide ───────
            // Non-fatal: the shortcut may already be taken by another app.
            use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, ShortcutState};
            if let Err(e) = app.global_shortcut().on_shortcut(
                tauri_plugin_global_shortcut::Shortcut::new(
                    Some(Modifiers::CONTROL | Modifiers::SHIFT),
                    Code::KeyM,
                ),
                |app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(win) = app.get_webview_window("main") {
                            let visible = win.is_visible().unwrap_or(false);
                            if visible {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                },
            ) {
                log(&format!("warn: could not register Ctrl+Shift+M: {e}"));
            }

            log("setup complete");
            Ok(())
        });

    log("build: calling .build()");
    let app = match builder.build(tauri::generate_context!()) {
        Ok(a)  => { log("build: SUCCESS"); a }
        Err(e) => { log(&format!("build: FAILED — {e:?}")); return; }
    };
    log("run: entering event loop");
    app.run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Ok(mut guard) = app.state::<Processes>().0.lock() {
                    for child in guard.iter_mut() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
