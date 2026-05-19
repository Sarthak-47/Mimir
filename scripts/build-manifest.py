#!/usr/bin/env python3
"""
build-manifest.py — Generate the Tauri auto-update manifest (latest.json).

Usage (run from repo root after cargo tauri build has completed):

    python scripts/build-manifest.py --version 0.3.0

This script:
  1. Reads the .sig file produced by the Tauri signer
  2. Emits a latest.json compatible with tauri-plugin-updater
  3. latest.json is uploaded as an asset to the GitHub release alongside
     the installer, where it is served at the configured endpoint URL.

Requirements:
  - TAURI_SIGNING_PRIVATE_KEY env var (GitHub Secret in CI)
  - The .nsis.zip.sig file produced by `cargo tauri build`

The public key counterpart must be set in src-tauri/tauri.conf.json under
plugins.updater.pubkey. Generate a key pair with:

    cargo tauri signer generate -w ~/.tauri/mimir.key

Then copy the PUBLIC KEY into tauri.conf.json and add the PRIVATE KEY
(the full key file content or the TAURI_SIGNING_PRIVATE_KEY env var format)
as the GitHub Actions secret TAURI_SIGNING_PRIVATE_KEY.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


GITHUB_REPO = "Sarthak-47/Mimir"
BASE_DOWNLOAD = f"https://github.com/{GITHUB_REPO}/releases/download"

# Map platform identifier → installer filename template
PLATFORM_FILES = {
    "windows-x86_64": "Mimir_{version}_x64-setup.nsis.zip",
}


def find_sig_file(version: str) -> Path | None:
    """Locate the .sig file produced by cargo tauri build."""
    candidates = [
        Path("src-tauri/target/release/bundle/nsis") / f"Mimir_{version}_x64-setup.nsis.zip.sig",
        Path(f"Mimir_{version}_x64-setup.nsis.zip.sig"),
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def main():
    parser = argparse.ArgumentParser(description="Generate Tauri update manifest")
    parser.add_argument("--version", required=True, help="Release version, e.g. 0.3.0")
    parser.add_argument("--notes", default="", help="Release notes (first line shown in UI)")
    parser.add_argument("--out", default="latest.json", help="Output file path")
    args = parser.parse_args()

    version = args.version.lstrip("v")
    tag     = f"v{version}"

    platforms: dict = {}

    for platform_id, filename_tmpl in PLATFORM_FILES.items():
        filename = filename_tmpl.format(version=version)

        # Look for the .sig file
        sig_path = find_sig_file(version)
        if sig_path is None:
            print(f"WARNING: .sig file not found for {platform_id} — skipping platform", file=sys.stderr)
            continue

        signature = sig_path.read_text(encoding="utf-8").strip()
        download_url = f"{BASE_DOWNLOAD}/{tag}/{filename}"

        platforms[platform_id] = {
            "signature": signature,
            "url":       download_url,
        }

    if not platforms:
        print("ERROR: No platforms found — cannot generate manifest", file=sys.stderr)
        sys.exit(1)

    manifest = {
        "version":  version,
        "notes":    args.notes or f"Mimir {version}",
        "pub_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": platforms,
    }

    out_path = Path(args.out)
    out_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"✓ Manifest written to {out_path}")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
