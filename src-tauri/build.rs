fn main() {
    // Embed the absolute backend path at compile time so the installed .exe
    // knows where to find it without any manual configuration.
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let backend = std::path::Path::new(&manifest_dir)
        .parent()
        .unwrap()
        .join("backend");
    // Forward-slash normalisation keeps the string clean on Windows too.
    println!(
        "cargo:rustc-env=MIMIR_BACKEND_PATH={}",
        backend.display()
    );

    tauri_build::build()
}
