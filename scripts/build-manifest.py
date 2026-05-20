#!/usr/bin/env python3
"""
build-manifest.py — Generate latest.json for the Tauri updater.

Reads the version from src-tauri/tauri.conf.json and the release artefact
signature produced by `tauri signer sign`, then writes `latest.json` at the
repo root so the GitHub Release action can upload it.

Usage (called from the release workflow):
    python scripts/build-manifest.py \\
        --version "0.3.0" \\
        --sig-path "Mimir_0.3.0_x64-setup.nsis.zip.sig" \\
        --out latest.json

Environment:
    The script expects the .sig file to already exist on disk (placed there
    by `tauri build` with signing enabled via TAURI_SIGNING_PRIVATE_KEY).
"""
import argparse
import json
import pathlib
import datetime
import sys


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate latest.json for Tauri updater")
    ap.add_argument("--version",  required=True, help="Release version string, e.g. 0.3.0")
    ap.add_argument("--sig-path", required=True, help="Path to the .sig file from tauri signer")
    ap.add_argument("--out",      default="latest.json", help="Output file path")
    args = ap.parse_args()

    sig_file = pathlib.Path(args.sig_path)
    if not sig_file.exists():
        print(f"[manifest] ERROR: signature file not found: {sig_file}", file=sys.stderr)
        sys.exit(1)

    signature = sig_file.read_text(encoding="utf-8").strip()
    version   = args.version.lstrip("v")

    # Base download URL for the GitHub Release assets
    repo = "Sarthak-47/mimir"
    base = f"https://github.com/{repo}/releases/download/v{version}"
    nsis = f"Mimir_{version}_x64-setup.nsis.zip"

    manifest = {
        "version": version,
        "notes":   f"Mimir v{version} — see release notes on GitHub.",
        "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": {
            "windows-x86_64": {
                "url":       f"{base}/{nsis}",
                "signature": signature,
            }
        },
    }

    out = pathlib.Path(args.out)
    out.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"[manifest] Written → {out}  (v{version})")


if __name__ == "__main__":
    main()
