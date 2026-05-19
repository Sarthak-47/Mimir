# Mimir — The Well of Knowledge

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

## Current features — v0.2.0

### Core chat & AI
- **Oracle** — WebSocket-streamed chat with a local LLM; tokens appear as they arrive
- **ReAct agent loop** — decides when to explain, quiz, summarise, or recall past sessions based on your message
- **7 teaching modes** — DEEP (full detail), SWIFT (concise), BASIC (ELI5), EXAM (past-paper style), CODE (programming focus), MATH (derivation-first), ODIN (Socratic questioning); switch mid-conversation
- **5 quick-action buttons** — SCROLL (summarise notes), LESSON (structured tutor), TRIAL (quiz), RUNES (flashcards), FATES (study plan) — all launch directly from the input bar
- **Chat hover actions** — copy, edit, or regenerate any message by hovering over it
- **Streaming stop** — cancel a generation mid-response
- **Thinking indicator** — Norse-themed status while the model reasons ("Consulting the Well of Urd…")

### Memory & retrieval
- **Hybrid memory recall** — ChromaDB vector search + BM25 keyword ranking fused via Reciprocal Rank Fusion, then reranked by a cross-encoder (`ms-marco-MiniLM`) for the final top-5 chunks
- **Always-on user memory** — document summaries and student struggle facts injected into every prompt, never gated by similarity
- **Session summariser** — nightly job compresses old conversations into durable memory so context from weeks ago is still accessible
- **Misconception tracking** — topics where you repeatedly score below 60% are flagged and actively surfaced to the model

### Knowledge base (Scrolls)
- **PDF and image upload** — PyMuPDF extracts PDFs with heading-aware structure; Ollama vision model describes images with Tesseract OCR as fallback
- **Semantic chunking** — paragraph-aware 800-char chunks with sentence-boundary overlap so retrieval never cuts across a key sentence
- **Discipline filter** — filter your uploaded files by subject in the Scrolls view
- **Exam paper auto-scaling** — upload any past-paper PDF and Mimir automatically detects questions with their mark allocations (`[4 marks]`, `(6 marks)`, `[8]`, etc.). Oracle answers are calibrated in depth to the marks at stake — 1–2 marks gets a concise point, 7+ marks gets a full structured response. Detected questions listed in Scrolls with a gold ▼ Q badge that expands to show each question and its mark count

### Study tools
- **Trials** — dedicated quiz runner with subject and topic selector; inline interactive MCQ cards with correct/wrong state; full score card and SM-2 update on completion
- **Structured tutor sessions** — 5-stage lesson arc (INTRO → TEACH → CHECK → QUIZ → DEBRIEF) on any topic, driven by the LESSON button
- **Flashcard decks** — appear in-chat with flip interaction and card navigation
- **Diagram understanding** — paste or drop an image into the chat and the vision model extracts every label, formula, arrow, and relationship for discussion

### Spaced repetition
- **SM-2 algorithm** — confidence scores, ease factors, repetition counts, and review intervals updated after every quiz submission
- **Reckoning dashboard** — per-topic confidence bars, quiz history, total days studied, all-time accuracy, current streak
- **Overdue review detection** — APScheduler hourly job flags topics past their `next_review` date

### Navigation & UX
- **Command palette** — Ctrl+K or `/` in an empty message box opens a fuzzy-searchable palette with navigation commands, chat shortcuts, and subject switchers
- **All-Chats panel** — browse every past session grouped by date; click any to reload it into the Oracle
- **Chronicle** — full paginated conversation history in the same bubble style as the live chat
- **Sidebar disciplines** — create and delete subjects live; accordion of recent sessions per subject; active subject sets the RAG filter for all memory queries
- **Exam countdown** — set your exam date in the sidebar; the Ragnarok countdown in the right panel is real
- **Yggdrasil background** — Norse tree rendered as a ghosted full-height wallpaper behind the chat column

### Auth & data
- Register / log in with JWT auth and bcrypt passwords; token persisted for the session
- All data — conversations, quiz history, files, subjects, memories — isolated per user account
- SQLite for relational data, ChromaDB embedded for vectors, both stored locally in `%LOCALAPPDATA%\Mimir\data\`

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri 2 (Rust) — native binary, ~10 MB shell |
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

---

## Project structure

```
mimir/
├── src-tauri/                  Rust shell — window, Tauri config, NSIS installer spec
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Sidebar.tsx     Disciplines, session accordion, exam date
│       │   ├── Topbar.tsx      Breadcrumb, NEW button, All-Chats trigger
│       │   ├── AllChatsPanel.tsx  Slide-in drawer of all past sessions
│       │   ├── Chat.tsx        Message bubbles, streaming, hover actions
│       │   ├── InputZone.tsx   Textarea, mode switcher, 5 action buttons
│       │   ├── CommandPalette.tsx  Ctrl+K fuzzy command palette
│       │   └── RightPanel.tsx  Stats, weaknesses, Ragnarok countdown
│       ├── views/
│       │   ├── TrialsView.tsx      Quiz runner
│       │   ├── ReckoningView.tsx   Progress dashboard
│       │   ├── ChronicleView.tsx   Session history
│       │   └── ScrollsView.tsx     File library + exam question browser
│       ├── hooks/              useWebSocket — streaming + tool_data routing
│       ├── styles/globals.css  Full design system as CSS variables
│       ├── config.ts           Centralised API/WS base URLs
│       └── App.tsx             Root layout, auth gate, state, view routing
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
│   │   ├── files.py        Upload, delete, list, /questions endpoint
│   │   ├── quiz.py         MCQ generation + SM-2 submission
│   │   ├── progress.py     Stats, exam dates, topic scores
│   │   ├── chronicle.py    Paginated session history
│   │   └── tutor.py        Tutor session CRUD
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

You need Rust, Python 3.11+, Node.js, and Ollama.

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
pyinstaller mimir-backend.spec

# 2. Copy bundle into Tauri resource directory
xcopy /E /I dist\mimir-backend ..\src-tauri\binaries\mimir-backend

# 3. Zip _internal for the installer
# (see build script or zip manually)

# 4. Build NSIS installer
cd ..
cargo tauri build
# Output: src-tauri/target/release/bundle/nsis/Mimir_0.2.0_x64-setup.exe
```

---

## Roadmap — v1.0

v0.2 is a capable study tool. v1.0 is the goal: a complete study operating system that doesn't just answer questions — it plans your entire exam campaign, marks your answers like an examiner, and tells you your predicted grade every morning.

### Must-have for 1.0

| # | Feature |
|---|---------|
| 1 | **Living study plan** — auto-generated day-by-day schedule from exam date + syllabus + weak topics; recalculates when you fall behind or improve |
| 2 | **AI examiner / answer marking** — upload question paper + mark scheme, write your answer, get it marked with examiner-style feedback and assessment objective breakdown |
| 3 | **Predicted grade** — calibrated daily estimate from SR intervals, quiz scores, topic coverage, and time remaining |
| 4 | **Typed answer testing** — free-text answer mode alongside MCQ; Mimir evaluates against expected mark points |
| 5 | **Past paper question database** — every question ever attempted tracked by topic and marks; coverage gaps surfaced automatically |
| 6 | **Syllabus import** — paste or upload an A-Level / IB / GCSE / AP syllabus and Mimir structures your subjects around it |
| 7 | **Auto-update** — app checks for and applies new releases without manual reinstall (Tauri updater plugin) |
| 8 | **Onboarding flow** — first-launch wizard: add subjects, set exam dates, upload first scroll, do a calibration quiz |
| 9 | **Notification system** — OS-level review reminders when topics are overdue (APScheduler already detects them; nowhere to send them yet) |
| 10 | **Crash / error recovery** — graceful UI when Ollama is down, model is not pulled, or backend fails to start |

### Strong differentiators

| # | Feature |
|---|---------|
| 11 | **Knowledge graph** — topics linked to prerequisites so Mimir understands *why* you're weak, not just *that* you are |
| 12 | **Voice input** — Whisper STT for hands-free quizzing and question asking |
| 13 | **Voice output** — TTS so Mimir can read explanations back; full voice revision session mode |
| 14 | **Mind map generator** — visual concept map from any topic or uploaded notes |
| 15 | **Syllabus coverage map** — what percentage of each topic area you've actually studied |
| 16 | **Formula / definition sheets** — auto-generated per subject from uploaded notes, always one click away |

### Polish & platform

| # | Feature |
|---|---------|
| 17 | **Proper flashcard deck manager** — create, edit, organise decks; Anki import |
| 18 | **Pomodoro / study session timer** — built-in, logs time-on-topic |
| 19 | **Time-on-topic heatmap** — see where hours actually go vs where they should |
| 20 | **Learning velocity** — improvement rate per topic, trend lines |
| 21 | **Custom themes** — light mode, accent colour picker |
| 22 | **Keybinding customisation** — remap anything from a settings panel |
| 23 | **Frontend performance** — code-split the bundle (currently 523 kB, target ~150 kB) |
| 24 | **Optional cloud sync** — encrypted backup of DB and notes to a self-hosted server |
| 25 | **Mac and Linux builds** |

---

## Design notes

The visual language is intentionally severe. No rounded corners. No pastel gradients. Panels are separated by single-pixel borders and thin gold engraving lines. Navigation uses Elder Futhark runes as icons. Typography is set in Cinzel for anything structural and Crimson Text for anything you read. The colour palette is forest green on stone black with gold as the only accent.

It is the kind of UI that should feel like opening a grimoire, not launching a SaaS dashboard.

---

## Status

**v0.2.0** — released and working on Windows x64. The full feature set described above is written and tested end-to-end with Ollama running `qwen2.5:14b`. Mac and Linux builds are not yet available.

If you find this useful or want to build on it, the code is yours. MIT licensed.

---

*Named after the guardian of the well. Built because studying is hard enough without bad tools.*
