# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for the Mimir backend.
Produces a one-directory bundle: dist/mimir-backend/mimir-backend.exe
"""

from PyInstaller.utils.hooks import collect_all, collect_submodules

# ── Collect packages with dynamic imports ──────────────────────
chroma_d,   chroma_b,   chroma_h   = collect_all("chromadb")
uvicorn_d,  uvicorn_b,  uvicorn_h  = collect_all("uvicorn")
fastapi_d,  fastapi_b,  fastapi_h  = collect_all("fastapi")
onnx_d,     onnx_b,     onnx_h     = collect_all("onnxruntime")
anyio_d,    anyio_b,    anyio_h    = collect_all("anyio")

hidden = (
    chroma_h + uvicorn_h + fastapi_h + onnx_h + anyio_h
    + collect_submodules("sqlalchemy")
    + collect_submodules("apscheduler")
    + [
        # auth
        "passlib.handlers.bcrypt",
        "jose", "jose.backends",
        # async db
        "aiosqlite",
        "sqlalchemy.dialects.sqlite",
        "sqlalchemy.dialects.sqlite.aiosqlite",
        # multipart / file upload
        "multipart",
        "python_multipart",
        # pydantic
        "pydantic_settings",
        # app routers & modules
        "routers.chat",
        "routers.users",
        "routers.files",
        "routers.quiz",
        "routers.progress",
        "routers.chronicle",
        "memory.database",
        "memory.vector",
        "agent.loop",
        "agent.tools",
        "agent.prompts",
        "scheduler",
        "ws_manager",
        "config",
    ]
)

datas = chroma_d + uvicorn_d + fastapi_d + onnx_d + anyio_d

a = Analysis(
    ["server.py"],
    pathex=["."],
    binaries=chroma_b + uvicorn_b + fastapi_b + onnx_b + anyio_b,
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "test", "unittest"],
    noarchive=False,
    optimize=1,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="mimir-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,      # keep console=True so uvicorn logs are visible for debugging
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="mimir-backend",
)
