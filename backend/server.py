"""
Mimir — Standalone server entry point for PyInstaller.

Starts uvicorn programmatically so the frozen executable can boot the API.
Using a string-based import (``"main:app"``) does not work in PyInstaller
bundles because the module importer is synthetic; we import the ``app``
object directly instead.
"""

import uvicorn
from main import app  # direct import — uvicorn string-import fails in frozen bundles

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="error")
