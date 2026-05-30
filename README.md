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
2. **Pull the models** (~7 GB — do this first):
   ```
   ollama pull qwen3.5:9b
   ollama pull qwen2.5vl:7b   # optional — for image/diagram understanding
   ```

**Then download and run the installer from the [Releases page](https://github.com/Sarthak-47/Mimir/releases).**

The installer includes the Python backend — no Python, Rust, or Node.js required.

> **Windows x64** · **macOS Apple Silicon** · **Linux x64** (AppImage + deb)

---

## What it does

Mimir is built around a conversational interface — you talk to it like a tutor, and it responds like one. Behind that interface is a ReAct agent loop that decides when to explain, when to quiz, when to pull up your past sessions, and when to tell you which topics you are weakest in and should revisit tonight.

---

## Current features — v1.0.0

### Core chat & AI
- **Oracle** — WebSocket-streamed chat with a local LLM; tokens appear as they arrive
- **ReAct agent loop** — decides when to explain, quiz, summarise, or recall past sessions based on your message
- **7 teaching modes** — DEEP (full detail), SWIFT (concise), BASIC (ELI5), EXAM (past-paper style), CODE (programming focus), MATH (derivation-first), ODIN (Socratic questioning); switch mid-conversation
- **6 quick-action buttons** — SCROLL (summarise notes), LESSON (structured tutor), TRIAL (quiz), RUNES (flashcards), FATES (study plan), MAP (mind map) — all launch directly from the input bar
- **KaTeX math rendering** — all responses emit properly formatted LaTeX (`$…$` inline, `$$…$$` display); prompts tuned to produce KaTeX-compatible output across all 7 modes
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
- **Scrolls search & reassign** — full-text filter across uploaded files; reassign any file to a different subject without re-uploading
- **Discipline filter** — filter your uploaded files by subject in the Scrolls view
- **Exam paper auto-scaling** — upload any past-paper PDF and Mimir automatically detects questions with their mark allocations (`[4 marks]`, `(6 marks)`, `[8]`, etc.). Oracle answers are calibrated in depth to the marks at stake — 1–2 marks gets a concise point, 7+ marks gets a full structured response. Detected questions listed in Scrolls with a gold ▼ Q badge

### Study tools
- **Trials (MCQ)** — dedicated quiz runner with subject and topic selector; inline interactive MCQ cards with correct/wrong state; full score card and SM-2 update on completion
- **Trials (Written Answer)** — free-text answer mode; Mimir generates a question, evaluates your typed response against mark points, and updates SM-2 state
- **Trials (Flashcard)** — Anki-style card-flip deck as a third Trials mode; flip to reveal, navigate through the deck, SM-2 updated on completion
- **Timed mock exam** — simulate real exam conditions; upload a question set, answer under a countdown, receive a per-question breakdown with mark allocation
- **AI Examiner** — upload a question + mark scheme, write your answer, receive examiner-style feedback with awarded and missed mark points broken down line by line
- **Structured tutor sessions** — 5-stage lesson arc (INTRO → TEACH → CHECK → QUIZ → DEBRIEF) on any topic, driven by the LESSON button
- **Diagram understanding** — paste or drop an image into the chat and the vision model extracts every label, formula, arrow, and relationship for discussion

### Insight tools (v0.7)
- **Knowledge graph** — prerequisite dependency map for any subject; click a topic to see what it builds on and what depends on it; helps identify the root blocker behind a weak area
- **Mind map generator** — MAP button generates a visual concept map for any topic or uploaded document; dynamic node sizing and full-screen modal
- **Formula & definition sheets** — auto-extracted from your uploaded notes per subject; always one click away in the sidebar
- **Learning velocity** — per-topic improvement slope and sparkline trend lines in The Reckoning; highlights topics in free-fall and topics you have already mastered
- **Study activity heatmap** — GitHub-style contribution calendar showing daily study intensity across all subjects

### Spaced repetition
- **SM-2 algorithm** — ease factors, repetition counts, and review intervals updated after every quiz, written answer, and flashcard submission
- **Due-today review queue** — SM-2 overdue topics surfaced as a one-click Review button; works across all three Trials modes
- **Reckoning dashboard** — per-topic confidence bars, quiz history, total days studied, all-time accuracy, current streak, learning velocity sparklines
- **Predicted grade** — Ebbinghaus decay + score trajectory → live letter grade estimate with confidence level and trend arrow
- **Progress report export** — export your full Reckoning stats as a PDF from The Reckoning view
- **Overdue review detection** — APScheduler hourly job flags topics past their `next_review` date and triggers a desktop notification

### Workflow tools (v0.8)
- **Pomodoro timer** — floating study-session widget with configurable work/break intervals; minimises out of the way without interrupting your session
- **Chronicle search** — full-text search across all past conversations; find any session by topic or keyword
- **Study preferences** — additional per-subject study preferences in Settings; persisted alongside model and temperature settings

### Settings & health
- **Settings modal** — runtime overrides for model, temperature, and context window; persisted to `user_settings.json`
- **Model switcher** — lists all Ollama models on your machine with size info
- **System status banner** — live Ollama and model health check; red banner with exact fix command if something is wrong
- **OS notifications** — review reminders delivered as native desktop notifications when topics are overdue

### Onboarding & updates
- **Onboarding wizard** — 6-step first-launch guide (Welcome → Ollama check → Model pull → Create subject → Set exam date → Done)
- **Auto-update** — app polls GitHub Releases, shows a gold download-progress banner, and restarts to apply the new installer automatically

### Navigation & UX
- **Command palette** — Ctrl+K or `/` in an empty message box opens a fuzzy-searchable palette with navigation commands, chat shortcuts, and subject switchers
- **All-Chats panel** — browse every past session grouped by date; click any to reload it into the Oracle; hover to delete
- **Chronicle** — full paginated conversation history in the same bubble style as the live chat; searchable
- **Sidebar disciplines** — create and delete subjects live; accordion of recent sessions per subject; active subject sets the RAG filter for all memory queries
- **Exam countdown** — set your exam date in the sidebar; the Ragnarok countdown in the right panel is real
- **System tray** — Mimir minimises to tray; click icon or right-click → Show to restore; Ctrl+Shift+M global hotkey toggles the window from anywhere on the desktop
- **Yggdrasil background** — Norse tree rendered as a ghosted full-height wallpaper behind the chat column

### Auth & data
- Register / log in with JWT auth and bcrypt passwords; token persisted for the session
- All data — conversations, quiz history, files, subjects, memories — isolated per user account
- SQLite for relational data, ChromaDB embedded for vectors, both stored locally in `%LOCALAPPDATA%\Mimir\data\` (Windows) or `~/.local/share/Mimir/data/` (Linux) or `~/Library/Application Support/Mimir/data/` (macOS)

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri 2 (Rust) — native binary, ~16 MB shell |
| Frontend | React 18 + TypeScript, bundled by Vite |
| Styling | CSS custom properties — no component library |
| Typography | Cinzel (headers) + Crimson Text (body) — Google Fonts |
| Backend | FastAPI with async SQLAlchemy + aiosqlite |
| Local LLM | Ollama — `qwen3.5:9b` (chat) + `qwen2.5vl:7b` (vision) |
| Math rendering | KaTeX — client-side LaTeX rendering |
| Vector memory | ChromaDB, embedded and persistent |
| Reranking | `sentence-transformers` ms-marco-MiniLM-L-6-v2 |
| Relational data | SQLite |
| File parsing | PyMuPDF (PDFs), Tesseract OCR (images) |
| Exam parsing | Custom regex pipeline (`utils/exam_parser.py`) |
| Scheduling | APScheduler AsyncIOScheduler |
| Auth | python-jose (JWT), passlib (bcrypt) |
| Notifications | tauri-plugin-notification |
| Auto-updater | tauri-plugin-updater |
| CI/CD | GitHub Actions — Windows, macOS, Linux builds on tag push |

---

## Project structure

```
mimir/
├── .github/workflows/
│   ├── ci.yml              Backend test suite on every push to main
│   └── release.yml         Windows NSIS + macOS DMG + Linux AppImage/deb on tag push
├── src-tauri/              Rust shell — window, tray, global shortcut, Tauri config
│   ├── src/main.rs         Cross-platform backend/Ollama spawning, resource dir resolution
│   ├── tauri.conf.json     Base config (version, window, icons)
│   ├── tauri.windows.conf.json   Windows-specific bundle targets and resources
│   ├── tauri.macos.conf.json     macOS-specific bundle targets and resources
│   └── tauri.linux.conf.json     Linux-specific bundle targets and resources
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Sidebar.tsx             Disciplines, session accordion, exam date, settings
│       │   ├── Topbar.tsx              Breadcrumb, NEW button, All-Chats trigger
│       │   ├── AllChatsPanel.tsx       Slide-in drawer of all past sessions
│       │   ├── Chat.tsx                Message bubbles, streaming, hover actions, KaTeX render
│       │   ├── InputZone.tsx           Textarea, mode switcher, 6 action buttons
│       │   ├── CommandPalette.tsx      Ctrl+K fuzzy command palette
│       │   ├── RightPanel.tsx          Stats, weaknesses, Ragnarok countdown
│       │   ├── ExaminerModal.tsx       AI examiner — question + mark scheme + marking
│       │   ├── KnowledgeGraphModal.tsx Prerequisite dependency graph (v0.7)
│       │   ├── MindMapModal.tsx        Visual concept map generator (v0.7)
│       │   ├── PomodoroTimer.tsx       Floating study-session timer widget (v0.8)
│       │   ├── SettingsModal.tsx       Model, temperature, context window overrides
│       │   ├── OnboardingWizard.tsx    6-step first-launch guide
│       │   ├── SystemStatus.tsx        Ollama/model health banner
│       │   └── UpdateNotice.tsx        Auto-update download progress banner
│       ├── views/
│       │   ├── TrialsView.tsx          Quiz runner — MCQ, written answer, flashcard modes
│       │   ├── ReckoningView.tsx       Progress dashboard, velocity, heatmap, grade, PDF export
│       │   ├── ChronicleView.tsx       Searchable session history
│       │   ├── ScrollsView.tsx         File library, search, reassign, exam question browser
│       │   └── FatesView.tsx           Study plan, schedule, syllabus coverage
│       ├── hooks/
│       │   └── useWebSocket.ts         Streaming + tool_data routing
│       ├── styles/globals.css          Full design system as CSS variables
│       ├── config.ts                   Centralised API/WS base URLs
│       └── App.tsx                     Root layout, auth gate, state, view routing, update check
├── backend/
│   ├── agent/
│   │   ├── loop.py         ReAct loop — streaming, peek window, tool dispatch
│   │   ├── tools.py        quiz, flashcards, summarize, weak_topics, SM-2
│   │   ├── prompts.py      7 mode system prompts with KaTeX math instructions
│   │   └── tutor.py        5-stage tutor state machine
│   ├── memory/
│   │   ├── database.py     ORM models — User, Subject, Topic, File, ExamQuestion, …
│   │   ├── vector.py       ChromaDB wrapper — hybrid BM25+vector+rerank retrieval
│   │   ├── readiness.py    Ebbinghaus decay + priority scoring
│   │   └── summarizer.py   Daily session compression job
│   ├── routers/
│   │   ├── chat.py         WebSocket /ws/chat endpoint
│   │   ├── examiner.py     AI examiner — mark written answers against mark schemes
│   │   ├── files.py        Upload, delete, list, search, reassign, /questions endpoint
│   │   ├── quiz.py         MCQ + written + flashcard generation + SM-2 submission
│   │   ├── progress.py     Stats, exam dates, topic scores, predicted grade, PDF export
│   │   ├── chronicle.py    Paginated + searchable session history
│   │   ├── system.py       Settings CRUD, model list, health check
│   │   └── tutor.py        Tutor session CRUD
│   ├── utils/
│   │   ├── parser.py       PDF/image extraction, semantic chunking, indexing
│   │   └── exam_parser.py  Regex pipeline — detect exam papers, extract Q + marks
│   ├── scheduler.py        APScheduler — review check, streak update, summariser
│   ├── main.py             FastAPI entry point with lifespan
│   ├── server.py           PyInstaller entry point
│   ├── mimir-backend.spec  PyInstaller spec (cross-platform)
│   └── config.py           pydantic-settings from .env + user_settings.json overrides
├── scripts/
│   ├── zip-backend.py      Cross-platform _internal zipper for CI (Windows/macOS/Linux)
│   ├── zip-backend.ps1     Windows PowerShell version for local builds
│   └── build-manifest.py   Updater manifest generator
```

---

## Running from source

You need Rust, Python 3.11+, Node.js 20+, and Ollama.

```bash
# Pull the models
ollama pull qwen3.5:9b
ollama pull qwen2.5vl:7b   # optional — for image understanding

# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
uvicorn main:app --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev

# Tauri desktop window (separate terminal, from repo root)
cargo tauri dev
```

To build the installer locally (Windows):

```powershell
# 1. Build the Python backend bundle
cd backend
pyinstaller mimir-backend.spec --noconfirm

# 2. Stage binary + _internal into Tauri resource directories
New-Item -ItemType Directory -Force -Path ..\src-tauri\binaries\mimir-backend
Copy-Item -Force dist\mimir-backend\mimir-backend.exe ..\src-tauri\binaries\mimir-backend\
Copy-Item -Recurse -Force dist\mimir-backend\_internal ..\src-tauri\binaries\mimir-backend\_internal

# 3. Zip _internal for the installer
cd ..
python scripts/zip-backend.py

# 4. Build NSIS installer (pass platform config)
cargo tauri build --config src-tauri/tauri.windows.conf.json
# Output: src-tauri/target/release/bundle/nsis/Mimir_0.9.0_x64-setup.exe
```

For macOS or Linux, replace step 4 with `--config src-tauri/tauri.macos.conf.json` or `--config src-tauri/tauri.linux.conf.json`.

CI builds for all three platforms are triggered automatically when you push a version tag:

```bash
git tag v0.9.0
git push origin v0.9.0
```

---

## Roadmap

### ✅ v0.5 — Living Study Plan *(shipped)*

| # | Feature |
|---|---------|
| 1 | **Syllabus import** — paste or upload an A-Level / IB / GCSE / AP syllabus; Mimir structures subjects and topics around it automatically |
| 2 | **Day-by-day study schedule** — auto-generated plan from exam date + syllabus + weak-topic scores + Ebbinghaus decay |
| 3 | **Adaptive rescheduling** — plan recalculates when you fall behind or improve faster than expected |
| 4 | **Syllabus coverage map** — visual heatmap of every topic area, coloured by study coverage |
| 5 | **FATES view** — live schedule with today's tasks, overdue items, and tomorrow's forecast |
| 6 | **Delete chat** — delete sessions from All-Chats and Chronicle; clears conversation, summary, and vector chunks |

---

### ✅ v0.7 — Insight Engine *(shipped)*

| # | Feature |
|---|---------|
| 10 | **Knowledge graph** — prerequisite dependency map; traces root blockers behind weak topics |
| 11 | **Mind map generator** — visual concept map via MAP button; dynamic node sizing, full-screen modal |
| 12 | **Formula & definition sheets** — auto-extracted from uploaded notes per subject |
| 13 | **Learning velocity** — per-topic improvement slope, sparkline trend lines, free-fall / mastered callouts |
| 14 | **Study activity heatmap** — GitHub-style contribution calendar showing daily study intensity |

---

### ✅ v0.8 — Polish & Workflow *(shipped)*

| # | Feature |
|---|---------|
| 15 | **Flashcard deck (Anki-style)** — card-flip Trials mode with SM-2 scoring |
| 16 | **Timed mock exam** — simulate exam conditions with countdown and per-question breakdown |
| 17 | **SM-2 review queue** — due-today topics surfaced as a one-click Review button |
| 18 | **Pomodoro timer** — floating study-session widget with configurable work/break intervals |
| 19 | **Progress report PDF export** — export full Reckoning stats from The Reckoning view |
| 20 | **Scrolls search & reassign** — filter uploaded files; reassign to a different subject |
| 21 | **Chronicle search** — full-text search across all past conversations |
| 22 | **OS notifications** — native desktop alerts when review topics are overdue |
| 23 | **KaTeX math rendering** — LaTeX in all responses and quiz questions, rendered via KaTeX |

---

### ✅ v0.9 — Platform *(shipped)*

| # | Feature |
|---|---------|
| 24 | **macOS build** — Apple Silicon DMG distributed via GitHub Actions CI |
| 25 | **Linux build** — `.AppImage` and `.deb` packages via GitHub Actions CI |
| 26 | **Flash Attention** — `OLLAMA_FLASH_ATTENTION=1` enabled; ~2× generation speed on supported GPUs |
| 27 | **Context window fix** — `ollama_context_length` from Settings now correctly reaches every Ollama call |

---

### ✅ v1.0 — Completion *(shipped)*

| # | Feature |
|---|---------|
| 28 | **Confidence test suite** — 127 tests covering SM-2 algorithm, RAG retrieval pipeline, API contracts, agent loop, exam parser, and tool helpers; CI runs on every push to main |
| 29 | **Error recovery** — agent/Ollama errors now surface as readable in-chat messages with fix commands (e.g. `ollama serve`, `ollama pull …`) instead of silently disappearing |
| 30 | **In-app help panel** — expanded with MAP button, VIGIL voice loop, AI Examiner, Reckoning insights, Ctrl+Shift+M global hotkey, and a full Troubleshooting section |
| 31 | **Multi-platform installers** — Windows NSIS (unsigned; SmartScreen bypass documented below), macOS DMG, Linux AppImage + deb; all built and distributed via GitHub Actions |

---

## Design notes

The visual language is intentionally severe. No rounded corners. No pastel gradients. Panels are separated by single-pixel borders and thin gold engraving lines. Navigation uses Elder Futhark runes as icons. Typography is set in Cinzel for anything structural and Crimson Text for anything you read. The colour palette is forest green on stone black with gold as the only accent.

It is the kind of UI that should feel like opening a grimoire, not launching a SaaS dashboard.

---

## Status

**v1.0.0** — released. Windows x64, macOS Apple Silicon, and Linux AppImage/deb installers distributed via GitHub Actions CI. Backend runs `qwen3.5:9b` with Flash Attention (~23 tok/s on a mid-range GPU). 127-test confidence suite green. All planned features shipped: spaced repetition, exam paper parsing, hybrid vector memory, knowledge graphs, mind maps, Pomodoro timer, KaTeX math rendering, timed mock exams, and multi-platform builds. Voice I/O (STT/TTS/VIGIL) was removed in v1.0.0 to reduce installer size and eliminate GPU-heavy audio model dependencies.

**First install on Windows:** Windows will show a SmartScreen warning ("Unknown publisher"). Click **More info → Run anyway**. This is expected for an unsigned open-source installer — the app is safe to run.

**First install on macOS:** Right-click the DMG → Open → Open to bypass Gatekeeper on first launch.

If you find this useful or want to build on it, the code is yours. MIT licensed.

---

*Named after the guardian of the well. Built because studying is hard enough without bad tools.*
