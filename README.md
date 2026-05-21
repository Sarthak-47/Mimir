# Mimir — The Well of Knowledge

[![CI](https://github.com/Sarthak-47/Mimir/actions/workflows/ci.yml/badge.svg)](https://github.com/Sarthak-47/Mimir/actions/workflows/ci.yml)
[![Release](https://github.com/Sarthak-47/Mimir/actions/workflows/release.yml/badge.svg)](https://github.com/Sarthak-47/Mimir/actions/workflows/release.yml)

*[Watch the intro →](https://youtu.be/RXSExdHsypM?si=-I7pVcTdAVejo_ub)*


> *In Norse myth, Mimir guards the well beneath Yggdrasil — the source of all wisdom.
> Odin sacrificed his eye just to drink from it.*
>
> *This is my attempt to build something worthy of that name.*

---

Mimir is a personal desktop application built for students tired of scattered notes, forgotten flashcards, and the creeping anxiety of not knowing what to study next. It is a local AI study companion — one that lives entirely on your machine, knows your weak spots, remembers what you have studied, and pushes back when you are slacking.

Everything runs locally. No API keys. No data leaving your machine. The LLM is served by Ollama, the conversation history lives in SQLite, and semantic memory is stored in ChromaDB. If you unplug the internet, Mimir still works.

---

## Install

**Prerequisites:**

1. **Ollama** — [ollama.com/download](https://ollama.com/download)
2. **Pull the model** (~9 GB — do this first):
   ```
   ollama pull qwen2.5:14b
   ```

**Then download and run the installer from the [Releases page](https://github.com/Sarthak-47/Mimir/releases).**

The installer includes the Python backend — no Python, Rust, or Node.js required.

> Windows x64 only for now.

---

## What it does

Mimir is built around a conversational interface — you talk to it like a tutor, and it responds like one. Behind that interface is a ReAct agent loop that decides when to explain, when to quiz, when to pull up your past sessions, and when to tell you which topics you are weakest in and should revisit tonight.

---

## Current features — v0.6.0

### Core chat & AI
- **Oracle** — WebSocket-streamed chat with a local LLM; tokens appear as they arrive
- **ReAct agent loop** — decides when to explain, quiz, summarise, or recall past sessions based on your message
- **7 teaching modes** — DEEP (full detail), SWIFT (concise), BASIC (ELI5), EXAM (past-paper style), CODE (programming focus), MATH (derivation-first), ODIN (Socratic questioning); switch mid-conversation
- **5 quick-action buttons** — SCROLL (summarise notes), LESSON (structured tutor), TRIAL (quiz), RUNES (flashcards), FATES (study plan) — all launch directly from the input bar
- **Chat hover actions** — copy, edit, or regenerate any message by hovering over it
- **Streaming stop** — cancel a generation mid-response
- **Thinking indicator** — Norse-themed status while the model reasons ("Consulting the Well of Urd…")
- **Friendly error messages** — Ollama down or model not pulled shows a clear fix command, not a stack trace

### Memory & retrieval
- **Hybrid memory recall** — ChromaDB vector search + BM25 keyword ranking fused via Reciprocal Rank Fusion, then reranked by a cross-encoder (`ms-marco-MiniLM`) for the final top-5 chunks
- **Always-on user memory** — document summaries and student struggle facts injected into every prompt, never gated by similarity
- **Session summariser** — nightly job compresses old conversations into durable memory so context from weeks ago is still accessible
- **Misconception tracking** — topics where you repeatedly score below 60% are flagged and actively surfaced to the model

### Knowledge base (Scrolls)
- **PDF and image upload** — PyMuPDF extracts PDFs with heading-aware structure; Ollama vision model describes images with Tesseract OCR as fallback
- **Semantic chunking** — paragraph-aware 800-char chunks with sentence-boundary overlap so retrieval never cuts across a key sentence
- **Discipline filter** — filter your uploaded files by subject in the Scrolls view
- **Exam paper auto-scaling** — upload any past-paper PDF and Mimir automatically detects questions with their mark allocations (`[4 marks]`, `(6 marks)`, `[8]`, etc.). Oracle answers are calibrated in depth to the marks at stake — 1–2 marks gets a concise point, 7+ marks gets a full structured response. Detected questions listed in Scrolls with a gold ▼ Q badge

### Study tools
- **Trials (MCQ)** — dedicated quiz runner with subject and topic selector; inline interactive MCQ cards with correct/wrong state; full score card and SM-2 update on completion
- **Trials (Written Answer)** — free-text answer mode; Mimir generates a question, evaluates your typed response against mark points, and updates SM-2 state
- **AI Examiner** — upload a question + mark scheme, write your answer, receive examiner-style feedback with awarded and missed mark points broken down line by line
- **Structured tutor sessions** — 5-stage lesson arc (INTRO → TEACH → CHECK → QUIZ → DEBRIEF) on any topic, driven by the LESSON button
- **Flashcard decks** — appear in-chat with flip interaction and card navigation
- **Diagram understanding** — paste or drop an image into the chat and the vision model extracts every label, formula, arrow, and relationship for discussion

### Spaced repetition
- **SM-2 algorithm** — confidence scores, ease factors, repetition counts, and review intervals updated after every quiz submission (MCQ and written)
- **Reckoning dashboard** — per-topic confidence bars, quiz history, total days studied, all-time accuracy, current streak
- **Predicted grade** — Ebbinghaus decay + score trajectory → live letter grade estimate with confidence level and trend arrow
- **Overdue review detection** — APScheduler hourly job flags topics past their `next_review` date

### Settings & health
- **Settings modal** — runtime overrides for model, temperature, and context window; persisted to `user_settings.json`
- **Model switcher** — lists all Ollama models on your machine with size info
- **System status banner** — live Ollama and model health check; red banner with exact fix command if something is wrong
- **OS notifications** — review reminders delivered as native Windows notifications when topics are overdue

### Onboarding & updates
- **Onboarding wizard** — 5-step first-launch guide (Welcome → Ollama check → Model pull → Set exam date → Done)
- **Auto-update** — app polls GitHub Releases, shows a gold download-progress banner, and restarts to apply the new installer automatically

### Navigation & UX
- **Command palette** — Ctrl+K or `/` in an empty message box opens a fuzzy-searchable palette with navigation commands, chat shortcuts, and subject switchers
- **All-Chats panel** — browse every past session grouped by date; click any to reload it into the Oracle
- **Chronicle** — full paginated conversation history in the same bubble style as the live chat
- **Sidebar disciplines** — create and delete subjects live; accordion of recent sessions per subject; active subject sets the RAG filter for all memory queries
- **Exam countdown** — set your exam date in the sidebar; the Ragnarok countdown in the right panel is real
- **System tray** — Mimir minimises to tray; click icon or right-click → Show to restore; Ctrl+Shift+M global hotkey toggles the window from anywhere on the desktop
- **Yggdrasil background** — Norse tree rendered as a ghosted full-height wallpaper behind the chat column

### Voice (v0.6)
- **Voice input (Whisper STT)** — press-and-hold the mic rune to dictate; `faster-whisper base.en` transcribes locally, no cloud; WebM/Opus audio, 10 MB upload cap, voice allowlist enforced server-side
- **Voice output (TTS)** — speaker rune on any message reads it aloud; auto-read toggle speaks every Mimir response automatically; kokoro-onnx `bm_lewis` voice, 24 kHz PCM, 1.3× speed by default
- **VIGIL — voice revision mode** — hands-free quiz loop: Mimir speaks a question, listens for your spoken answer, marks it, speaks feedback, then moves on; state machine with setup, active, and summary screens

### Auth & data
- Register / log in with JWT auth and bcrypt passwords; token persisted for the session
- All data — conversations, quiz history, files, subjects, memories — isolated per user account
- SQLite for relational data, ChromaDB embedded for vectors, both stored locally in `%LOCALAPPDATA%\Mimir\data\`

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri 2 (Rust) — native binary, ~16 MB shell |
| Frontend | React 18 + TypeScript, bundled by Vite |
| Styling | CSS custom properties — no component library |
| Typography | Cinzel (headers) + Crimson Text (body) — Google Fonts |
| Backend | FastAPI with async SQLAlchemy + aiosqlite |
| Local LLM | Ollama — `qwen2.5:14b` (chat) + `qwen2.5vl:7b` (vision) |
| Vector memory | ChromaDB, embedded and persistent |
| Reranking | `sentence-transformers` ms-marco-MiniLM-L-6-v2 |
| Relational data | SQLite |
| File parsing | PyMuPDF (PDFs), Tesseract OCR (images) |
| Exam parsing | Custom regex pipeline (`utils/exam_parser.py`) |
| Scheduling | APScheduler AsyncIOScheduler |
| Auth | python-jose (JWT), passlib (bcrypt) |
| Speech-to-text | faster-whisper (`base.en`, CTranslate2) + PyAV for WebM decode |
| Text-to-speech | kokoro-onnx (`bm_lewis`, ONNX runtime) — 24 kHz PCM WAV |
| Notifications | tauri-plugin-notification |
| Auto-updater | tauri-plugin-updater |

---

## Project structure

```
mimir/
├── src-tauri/                  Rust shell — window, tray, global shortcut, Tauri config
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Sidebar.tsx         Disciplines, session accordion, exam date, settings/examiner buttons
│       │   ├── Topbar.tsx          Breadcrumb, NEW button, All-Chats trigger
│       │   ├── AllChatsPanel.tsx   Slide-in drawer of all past sessions
│       │   ├── Chat.tsx            Message bubbles, streaming, hover actions
│       │   ├── InputZone.tsx       Textarea, mode switcher, 5 action buttons
│       │   ├── CommandPalette.tsx  Ctrl+K fuzzy command palette
│       │   ├── RightPanel.tsx      Stats, weaknesses, Ragnarok countdown
│       │   ├── ExaminerModal.tsx   AI examiner — question + mark scheme + marking
│       │   ├── VoiceRevisionModal.tsx  VIGIL — hands-free quiz loop (v0.6)
│       │   ├── SettingsModal.tsx   Model, temperature, context window overrides
│       │   ├── OnboardingWizard.tsx 5-step first-launch guide
│       │   ├── SystemStatus.tsx    Ollama/model health banner
│       │   └── UpdateNotice.tsx    Auto-update download progress banner
│       ├── views/
│       │   ├── TrialsView.tsx      Quiz runner — MCQ + written answer modes
│       │   ├── ReckoningView.tsx   Progress dashboard + predicted grade
│       │   ├── ChronicleView.tsx   Session history
│       │   └── ScrollsView.tsx     File library + exam question browser
│       ├── hooks/
│       │   ├── useWebSocket.ts     Streaming + tool_data routing
│       │   ├── useTTS.ts           kokoro-onnx TTS — speak() returns Promise<void> (v0.6)
│       │   ├── useAudioRecorder.ts WebM/Opus mic recording (v0.6)
│       │   └── useVoiceRevision.ts VIGIL state machine (v0.6)
│       ├── styles/globals.css  Full design system as CSS variables
│       ├── config.ts           Centralised API/WS base URLs
│       └── App.tsx             Root layout, auth gate, state, view routing, update check
├── backend/
│   ├── agent/
│   │   ├── loop.py         ReAct loop — streaming, peek window, tool dispatch
│   │   ├── tools.py        quiz, flashcards, summarize, weak_topics, SM-2
│   │   ├── prompts.py      7 mode system prompts
│   │   └── tutor.py        5-stage tutor state machine
│   ├── memory/
│   │   ├── database.py     ORM models — User, Subject, Topic, File, ExamQuestion, …
│   │   ├── vector.py       ChromaDB wrapper — hybrid BM25+vector+rerank retrieval
│   │   ├── readiness.py    Ebbinghaus decay + priority scoring
│   │   └── summarizer.py   Daily session compression job
│   ├── routers/
│   │   ├── chat.py         WebSocket /ws/chat endpoint
│   │   ├── examiner.py     AI examiner — mark written answers against mark schemes
│   │   ├── files.py        Upload, delete, list, /questions endpoint
│   │   ├── quiz.py         MCQ + written question generation + SM-2 submission
│   │   ├── progress.py     Stats, exam dates, topic scores, predicted grade
│   │   ├── chronicle.py    Paginated session history
│   │   ├── system.py       Settings CRUD, model list, health check
│   │   ├── tutor.py        Tutor session CRUD
│   │   └── voice.py        STT (/transcribe) + TTS (/speak) + health — JWT-gated (v0.6)
│   ├── voice/
│   │   ├── transcribe.py   faster-whisper base.en — WebM/Opus → text via PyAV (v0.6)
│   │   └── synthesise.py   kokoro-onnx bm_lewis — text → 24 kHz PCM WAV (v0.6)
│   ├── utils/
│   │   ├── parser.py       PDF/image extraction, semantic chunking, indexing
│   │   └── exam_parser.py  Regex pipeline — detect exam papers, extract Q + marks
│   ├── scheduler.py        APScheduler — review check, streak update, summariser
│   ├── main.py             FastAPI entry point with lifespan
│   ├── server.py           PyInstaller entry point
│   ├── mimir-backend.spec  PyInstaller spec
│   └── config.py           pydantic-settings from .env
```

---

## Running from source

You need Rust, Python 3.11+, Node.js 20+, and Ollama.

```bash
# Pull the models
ollama pull qwen2.5:14b
ollama pull qwen2.5vl:7b   # optional — for image understanding

# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev

# Tauri desktop window (separate terminal, from repo root)
cargo tauri dev
```

To build the full installer locally:

```bash
# 1. Build the Python backend bundle
cd backend
pyinstaller mimir-backend.spec --noconfirm

# 2. Stage bundle into Tauri resource directories
mkdir -p ..\src-tauri\binaries\mimir-backend
copy dist\mimir-backend\mimir-backend.exe ..\src-tauri\binaries\mimir-backend\

# 3. Zip _internal for the installer (PowerShell)
Compress-Archive -Path "dist/mimir-backend/_internal/*" `
                 -DestinationPath "../src-tauri/resources/backend-internal.zip" -Force

# 4. Build NSIS installer
cd ..
cargo tauri build
# Output: src-tauri/target/release/bundle/nsis/Mimir_0.6.0_x64-setup.exe
```

---

## Roadmap — v0.7 to v1.0

v0.6 ships a capable AI study suite with full voice support. The path to v1.0 turns Mimir into a complete exam-preparation operating system. Below is the plan.

---

### ✅ v0.5 — Living Study Plan *(shipped)*

| # | Feature |
|---|---------|
| 1 | **Syllabus import** — paste or upload an A-Level / IB / GCSE / AP syllabus; Mimir structures subjects and topics around it automatically |
| 2 | **Day-by-day study schedule** — auto-generated plan from exam date + syllabus + weak-topic scores + Ebbinghaus decay; rendered as a calendar view |
| 3 | **Adaptive rescheduling** — if you fall behind or improve faster than expected, the plan recalculates overnight |
| 4 | **Syllabus coverage map** — visual heatmap of every topic area, coloured by how much you've studied each one |
| 5 | **FATES view overhaul** — replace placeholder with the live schedule above; show today's tasks, overdue items, and tomorrow's forecast |
| 6 | **Delete chat** — delete individual sessions from the All-Chats panel and Chronicle view; clears the conversation, its summary, and associated vector memory chunks |

---

### ✅ v0.6 — Voice *(shipped)*
*Hands-free revision — walk around the room and quiz yourself.*

| # | Feature |
|---|---------|
| 6 | **Voice input (Whisper STT)** — press-and-hold to dictate a question or answer; `faster-whisper base.en` transcribes locally, no cloud |
| 7 | **Voice output (TTS)** — Mimir reads explanations and quiz questions aloud; kokoro-onnx `bm_lewis` voice at 1.3× speed |
| 8 | **VIGIL — voice revision mode** — dedicated hands-free session: Mimir asks a question, waits for spoken answer, marks it, speaks feedback, moves to the next |

---

### v0.7 — Insight Engine
*Understanding why you're weak, not just that you are.*

| # | Feature |
|---|---------|
| 9  | **Knowledge graph** — topics linked to prerequisites; Mimir traces the dependency chain when you're weak to identify the root blocker, not just the symptom |
| 10 | **Mind map generator** — visual concept map from any topic or uploaded document; exportable as PNG |
| 11 | **Formula and definition sheets** — auto-generated per subject from uploaded notes; always one click away in the sidebar |
| 12 | **Learning velocity** — per-topic improvement rate and trend lines; highlights topics in free-fall and topics you've already mastered |
| 13 | **Time-on-topic heatmap** — shows where your study hours actually go vs where the schedule says they should |

---

### v0.8 — Polish & Workflow
*The tools that turn occasional use into a daily habit.*

| # | Feature |
|---|---------|
| 14 | **Flashcard deck manager** — create, edit, organise named decks; Anki `.apkg` import and export |
| 15 | **Pomodoro / study session timer** — built-in timer with configurable work/break intervals; logs time-on-topic to the heatmap |
| 16 | **Past paper question database** — every question attempted indexed by topic, paper, and year; coverage gaps surfaced as "unseen question types" |
| 17 | **Custom themes** — light mode, dark mode, accent colour picker while keeping the core Norse design language |
| 18 | **Keybinding customisation** — remap any action from a settings panel |
| 19 | **Frontend performance** — code-split bundle (current ~523 kB → target ~150 kB); lazy-load heavy views |

---

### v0.9 — Platform
*Get Mimir onto every machine, with optional safety-net backup.*

| # | Feature |
|---|---------|
| 20 | **macOS build** — universal binary (Apple Silicon + Intel); notarised and code-signed |
| 21 | **Linux build** — `.AppImage` and `.deb` packages |
| 22 | **Optional encrypted cloud sync** — opt-in backup of DB and uploads to a self-hosted server or S3-compatible bucket; end-to-end encrypted with a user-supplied key |

---

### v1.0 — Completion
*Everything above, stable, documented, and ready for daily use by anyone.*

| # | Feature |
|---|---------|
| 23 | **Full test coverage** — every backend route, every SM-2 edge case, every RAG retrieval path covered by automated tests in CI |
| 24 | **Comprehensive error recovery** — every failure mode (Ollama down, model missing, corrupted DB, disk full) has a clear in-app recovery path |
| 25 | **In-app help and docs** — searchable help panel covering every feature, accessible from the command palette |
| 26 | **Installer signing** — code-signed NSIS installer so Windows does not show an "unknown publisher" warning; enables auto-updater `.sig` verification |

---

## Design notes

The visual language is intentionally severe. No rounded corners. No pastel gradients. Panels are separated by single-pixel borders and thin gold engraving lines. Navigation uses Elder Futhark runes as icons. Typography is set in Cinzel for anything structural and Crimson Text for anything you read. The colour palette is forest green on stone black with gold as the only accent.

It is the kind of UI that should feel like opening a grimoire, not launching a SaaS dashboard.

---

## Status

**v0.6.0** — released and working on Windows x64. All v0.4 through v0.6 features are written and tested end-to-end with Ollama running `qwen2.5:14b`. Includes voice input (Whisper STT), voice output (kokoro-onnx TTS), and hands-free voice revision mode. Mac and Linux builds are planned for v0.9.

If you find this useful or want to build on it, the code is yours. MIT licensed.

---

*Named after the guardian of the well. Built because studying is hard enough without bad tools.*
