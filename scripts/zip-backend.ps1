# zip-backend.ps1
# -----------------------------------------------------------------------
# Packs the PyInstaller _internal directory into a single zip file that
# Tauri can bundle reliably (avoiding the NSIS 1000-file-per-folder cap).
#
# Run this once before `cargo tauri build`:
#   .\scripts\zip-backend.ps1
#
# The resulting zip is placed at:
#   src-tauri/resources/backend-internal.zip
#
# Inside the zip, paths are relative to _internal/ so they extract to:
#   <install dir>/mimir-backend/_internal/<file>
# -----------------------------------------------------------------------

$ErrorActionPreference = "Stop"

$repoRoot   = Split-Path -Parent $PSScriptRoot
$sourceDir  = Join-Path $repoRoot "src-tauri\binaries\mimir-backend\_internal"
$outputDir  = Join-Path $repoRoot "src-tauri\resources"
$outputZip  = Join-Path $outputDir "backend-internal.zip"

if (-not (Test-Path $sourceDir)) {
    Write-Error "Source directory not found: $sourceDir"
    exit 1
}

# Ensure the output directory exists.
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

# Remove a stale zip so Compress-Archive doesn't append to it.
if (Test-Path $outputZip) {
    Remove-Item $outputZip -Force
    Write-Host "Removed existing $outputZip"
}

# Try 7-Zip first (much faster for large trees); fall back to Compress-Archive.
$sevenZip = Get-Command "7z" -ErrorAction SilentlyContinue

if ($sevenZip) {
    Write-Host "Using 7-Zip to compress $sourceDir ..."
    # 'a' = add, '-tzip' = zip format, '-mx=1' = fastest compression
    & 7z a -tzip -mx=1 $outputZip "$sourceDir\*" | Out-Null
} else {
    Write-Host "7-Zip not found — falling back to Compress-Archive (may be slow for ~2000 files) ..."
    Compress-Archive -Path "$sourceDir\*" -DestinationPath $outputZip -CompressionLevel Fastest
}

$sizeMB = [math]::Round((Get-Item $outputZip).Length / 1MB, 1)
Write-Host "Done. Created $outputZip ($sizeMB MB)"
Write-Host ""
Write-Host "Next step: cargo tauri build"
