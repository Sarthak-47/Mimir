# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for the Mimir backend.
Produces a one-directory bundle: dist/mimir-backend/mimir-backend.exe
"""

from PyInstaller.utils.hooks import collect_all, collect_submodules, copy_metadata

# ── Collect packages with dynamic imports ──────────────────────
chroma_d,   chroma_b,   chroma_h   = collect_all("chromadb")
uvicorn_d,  uvicorn_b,  uvicorn_h  = collect_all("uvicorn")
fastapi_d,  fastapi_b,  fastapi_h  = collect_all("fastapi")
onnx_d,     onnx_b,     onnx_h     = collect_all("onnxruntime")
anyio_d,    anyio_b,    anyio_h    = collect_all("anyio")
pydantic_d, pydantic_b, pydantic_h = collect_all("pydantic")
pydcore_d,  pydcore_b,  pydcore_h  = collect_all("pydantic_core")
starlette_d, starlette_b, starlette_h = collect_all("starlette")
# kokoro_onnx package data (config.json + voice assets)
kokoro_d,   kokoro_b,   kokoro_h   = collect_all("kokoro_onnx")
# Voice stack — language_tags ships JSON data files that kokoro_onnx requires
langtag_d,  langtag_b,  langtag_h  = collect_all("language_tags")
# faster-whisper / CTranslate2 STT backend
fwhisper_d, fwhisper_b, fwhisper_h = collect_all("faster_whisper")
ctrans_d,   ctrans_b,   ctrans_h   = collect_all("ctranslate2")
# soundfile reads audio (PCM/WAV) for the STT pipeline
sfile_d,    sfile_b,    sfile_h    = collect_all("soundfile")
# espeakng_loader ships espeak-ng-data (phoneme dicts) used by kokoro for TTS
espeak_d,   espeak_b,   espeak_h   = collect_all("espeakng_loader")

# ── Package metadata needed at runtime (importlib.metadata) ────
metadata = (
    copy_metadata("pydantic")
    + copy_metadata("pydantic-core")
    + copy_metadata("fastapi")
    + copy_metadata("starlette")
    + copy_metadata("uvicorn")
    + copy_metadata("anyio")
    + copy_metadata("email-validator")
    + copy_metadata("SQLAlchemy")
    + copy_metadata("aiosqlite")
    + copy_metadata("python-multipart")
    + copy_metadata("passlib")
    + copy_metadata("python-jose")
    + copy_metadata("chromadb")
    + copy_metadata("pydantic-settings")
)

hidden = (
    chroma_h + uvicorn_h + fastapi_h + onnx_h + anyio_h
    + pydantic_h + pydcore_h + starlette_h + kokoro_h
    + langtag_h + fwhisper_h + ctrans_h + sfile_h + espeak_h
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
        "routers.tutor",
        "routers.system",
        "routers.examiner",
        "routers.syllabus",
        "routers.voice",
        "routers.formulas",
        "routers.mindmap",
        "routers.graph",
        "memory.database",
        "memory.vector",
        "memory.readiness",
        "memory.summarizer",
        "agent.loop",
        "agent.tools",
        "agent.prompts",
        "agent.tutor",
        "utils.parser",
        "utils.exam_parser",
        "scheduler",
        "ws_manager",
        "config",
    ]
)

datas = (
    chroma_d + uvicorn_d + fastapi_d + onnx_d + anyio_d
    + pydantic_d + pydcore_d + starlette_d + kokoro_d
    + langtag_d + fwhisper_d + ctrans_d + sfile_d + espeak_d
    + metadata
)

a = Analysis(
    ["server.py"],
    pathex=["."],
    binaries=chroma_b + uvicorn_b + fastapi_b + onnx_b + anyio_b + pydantic_b + pydcore_b + starlette_b + kokoro_b + langtag_b + fwhisper_b + ctrans_b + sfile_b + espeak_b,
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter", "test", "unittest",
        # PyTorch causes a DLL crash (STATUS_STACK_BUFFER_OVERRUN) when loaded
        # from a PyInstaller bundle on Windows. The cross-encoder reranker in
        # memory/vector.py is already lazy-loaded with try/except, so it falls
        # back cleanly to RRF-only when torch is unavailable.
        "torch", "torchvision", "torchaudio",
        "sentence_transformers",   # depends on torch
        "transformers",            # heavy; pulled in by sentence_transformers
        "tensorboard", "tensorflow", "jax", "flax",
    ],
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
