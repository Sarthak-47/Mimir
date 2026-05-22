# build.ps1 — Full local release build for Mimir (Windows)
# -----------------------------------------------------------------------
# Orchestrates the three-stage build pipeline:
#
#   Stage 1: Bundle Python backend with PyInstaller
#   Stage 2: Zip _internal to work around NSIS 1000-file-per-folder cap
#   Stage 3: Build the Tauri NSIS installer
#
# Usage:
#   .\scripts\build.ps1             # full build
#   .\scripts\build.ps1 -SkipBackend # skip PyInstaller (use existing dist/)
#
# Prerequisites:
#   - Rust stable toolchain  (rustup)
#   - Node.js 20+            (node / npm)
#   - Python 3.11+           (python)
#   - PyInstaller installed  (pip install pyinstaller)
#   - Tauri CLI              (cargo install tauri-cli --version "^2")
# -----------------------------------------------------------------------

param(
    [switch]$SkipBackend,
    [switch]$Debug
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$repo = Get-Location

function Banner([string]$text) {
    Write-Host ""
    Write-Host ("─" * 60) -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host ("─" * 60) -ForegroundColor Cyan
}

# ── Stage 0: Read version ─────────────────────────────────────
$conf    = Get-Content (Join-Path $repo "src-tauri\tauri.conf.json") | ConvertFrom-Json
$version = $conf.version
Banner "Mimir v$version — Release Build"

# ── Stage 1: PyInstaller backend ─────────────────────────────
if (-not $SkipBackend) {
    Banner "Stage 1 / 3 — PyInstaller backend"
    Set-Location (Join-Path $repo "backend")

    # Ensure PyInstaller is available
    $pi = python -c "import PyInstaller; print('ok')" 2>$null
    if ($pi -ne "ok") {
        Write-Host "Installing PyInstaller..." -ForegroundColor Yellow
        pip install pyinstaller | Out-Null
    }

    Write-Host "Running pyinstaller mimir-backend.spec ..."
    python -m PyInstaller mimir-backend.spec --noconfirm

    # Stage backend exe for Tauri
    $binDir = Join-Path $repo "src-tauri\binaries\mimir-backend"
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    Copy-Item -Force "dist\mimir-backend\mimir-backend.exe" (Join-Path $binDir "mimir-backend.exe")
    Write-Host "Backend staged to $binDir" -ForegroundColor Green

    Set-Location $repo
} else {
    Banner "Stage 1 / 3 — Skipped (using existing dist/)"
}

# ── Stage 2: Zip _internal ───────────────────────────────────
Banner "Stage 2 / 3 — Packing _internal.zip"
& (Join-Path $repo "scripts\zip-backend.ps1")

# ── Stage 3: Tauri build ─────────────────────────────────────
Banner "Stage 3 / 3 — Tauri build"
Set-Location (Join-Path $repo "frontend")
npm ci
Set-Location $repo

$tauriArgs = @("--target", "x86_64-pc-windows-msvc")
if ($Debug) { $tauriArgs += "--debug" }

cargo tauri build @tauriArgs

$nsisDir = Join-Path $repo "src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis"
Banner "Build complete"
Write-Host "Installer: $nsisDir\Mimir_${version}_x64-setup.exe" -ForegroundColor Green
