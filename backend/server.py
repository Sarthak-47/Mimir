"""
Mimir — Standalone server entry point for PyInstaller.
Starts uvicorn programmatically so the frozen executable can boot the API.
"""

import uvicorn
from main import app  # direct import — uvicorn string-import fails in frozen bundles

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="error")
