#!/usr/bin/env python3
"""zip-backend.py — cross-platform replacement for zip-backend.ps1.

Packs the contents of src-tauri/binaries/mimir-backend/_internal into
src-tauri/resources/backend-internal.zip, stripping the _internal/ prefix
so that main.rs can extract files directly into <install>/mimir-backend/_internal/.

Usage (from repo root or CI):
    python scripts/zip-backend.py

Works on Windows, macOS, and Linux.
"""

import sys
import zipfile
from pathlib import Path

REPO_ROOT  = Path(__file__).resolve().parent.parent
SOURCE_DIR = REPO_ROOT / "src-tauri" / "binaries" / "mimir-backend" / "_internal"
OUTPUT_DIR = REPO_ROOT / "src-tauri" / "resources"
OUTPUT_ZIP = OUTPUT_DIR / "backend-internal.zip"


def main() -> None:
    if not SOURCE_DIR.exists():
        print(f"[zip-backend] ERROR: source dir not found: {SOURCE_DIR}", file=sys.stderr)
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if OUTPUT_ZIP.exists():
        OUTPUT_ZIP.unlink()
        print(f"[zip-backend] Removed existing {OUTPUT_ZIP.name}")

    all_files = [p for p in SOURCE_DIR.rglob("*") if p.is_file()]
    print(f"[zip-backend] Compressing {len(all_files)} files …")

    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as zf:
        for path in all_files:
            arcname = path.relative_to(SOURCE_DIR)
            zf.write(path, arcname)

    size_mb = OUTPUT_ZIP.stat().st_size / 1_048_576
    print(f"[zip-backend] Done: {OUTPUT_ZIP} ({size_mb:.1f} MB)")
    print("[zip-backend] Next step: cargo tauri build --config src-tauri/tauri.<platform>.conf.json")


if __name__ == "__main__":
    main()
