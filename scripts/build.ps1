# build.ps1 - Full local release build for Mimir (Windows)
# -----------------------------------------------------------------------
# Orchestrates the three-stage build pipeline:
#
#   Stage 1: Bundle Python backend with PyInstaller
#   Stage 2: Zip _internal to work around NSIS 1000-file-per-folder cap
#   Stage 3: Build the Tauri NSIS installer
#
# Usage:
#   .\scripts\build.ps1              # full build
#   .\scripts\build.ps1 -SkipBackend # skip PyInstaller (use existing dist/)
#   .\scripts\build.ps1 -Check       # dry-run: only validate spec imports
#   .\scripts\build.ps1 -Debug       # Tauri debug build (no minification)
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
    [switch]$Debug,
    [switch]$Check   # validate all PyInstaller hidden imports without building
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$repo = Get-Location

function Banner([string]$text) {
    Write-Host ""
    Write-Host ("-" * 60) -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host ("-" * 60) -ForegroundColor Cyan
}

# -- Stage 0: Read version -------------------------------------
$conf    = Get-Content (Join-Path $repo "src-tauri\tauri.conf.json") | ConvertFrom-Json
$version = $conf.version

# -- -Check: validate hidden imports --------------------------
if ($Check) {
    Banner "Mimir v$version - Spec Import Validation"

    # Parse hidden imports from mimir-backend.spec
    $specPath = Join-Path $repo "backend\mimir-backend.spec"
    $imports  = Select-String -Path $specPath -Pattern '"([a-zA-Z_][a-zA-Z0-9_.]+)"' |
        ForEach-Object { $_.Matches } |
        ForEach-Object { $_.Groups[1].Value } |
        Where-Object { $_ -match '\.' } |  # only dotted module names
        Sort-Object -Unique

    Write-Host "Found $($imports.Count) hidden imports to check" -ForegroundColor Yellow
    Write-Host ""

    $backendDir = Join-Path $repo "backend"
    $python = Join-Path $backendDir ".venv\Scripts\python.exe"
    if (-not (Test-Path $python)) { $python = "python" }

    $failed  = @()
    $passed  = 0

    foreach ($mod in $imports) {
        $result = & $python -c "import $mod" 2>&1
        if ($LASTEXITCODE -eq 0) {
            $passed++
        } else {
            $failed += $mod
            Write-Host "  MISSING  $mod" -ForegroundColor Red
        }
    }

    Write-Host ""
    if ($failed.Count -eq 0) {
        Write-Host "All $passed imports OK" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "$($failed.Count) import(s) missing - fix the spec or install the packages:" -ForegroundColor Red
        $failed | ForEach-Object { Write-Host "  pip install $_" -ForegroundColor Yellow }
        exit 1
    }
}

Banner "Mimir v$version - Release Build"

# -- Stage 1: PyInstaller backend -----------------------------
if (-not $SkipBackend) {
    Banner "Stage 1 / 3 - PyInstaller backend"
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
    Banner "Stage 1 / 3 - Skipped (using existing dist/)"
}

# -- Stage 2: Zip _internal -----------------------------------
Banner "Stage 2 / 3 - Packing _internal.zip"
& (Join-Path $repo "scripts\zip-backend.ps1")

# -- Stage 3: Tauri build -------------------------------------
Banner "Stage 3 / 3 - Tauri build"
Set-Location (Join-Path $repo "frontend")
npm install
Set-Location $repo

$tauriArgs = @("--target", "x86_64-pc-windows-msvc")
if ($Debug) { $tauriArgs += "--debug" }

cargo tauri build @tauriArgs

$nsisDir = Join-Path $repo "src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis"
Banner "Build complete"
Write-Host "Installer: $nsisDir\Mimir_${version}_x64-setup.exe" -ForegroundColor Green
