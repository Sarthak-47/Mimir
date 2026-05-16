# Mimir — Complete User Guide

> *Everything you can do in the app, explained from first launch to daily use.*

---

## Table of Contents

1. [Prerequisites & Installation](#1-prerequisites--installation)
2. [First Launch — Boot Splash](#2-first-launch--boot-splash)
3. [Authentication — Login & Register](#3-authentication--login--register)
4. [Main Layout — The Three Columns](#4-main-layout--the-three-columns)
5. [Sidebar (Left Column)](#5-sidebar-left-column)
6. [Topbar](#6-topbar)
7. [The Oracle — Chat View](#7-the-oracle--chat-view)
8. [Trials — Quiz Runner](#8-trials--quiz-runner)
9. [The Reckoning — Progress Dashboard](#9-the-reckoning--progress-dashboard)
10. [Chronicle — Conversation History](#10-chronicle--conversation-history)
11. [Scrolls — File Library](#11-scrolls--file-library)
12. [Right Panel](#12-right-panel)
13. [Response Modes — Deep vs Swift](#13-response-modes--deep-vs-swift)
14. [Keyboard Shortcuts](#14-keyboard-shortcuts)
15. [How the AI Works](#15-how-the-ai-works)
16. [Data & Privacy](#16-data--privacy)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Prerequisites & Installation

### What you need before installing

| Requirement | Where to get it |
|-------------|----------------|
| **Ollama** (runs the local AI) | [ollama.com/download](https://ollama.com/download) |
| **qwen3.5:9b model** (~6 GB download) | `ollama pull qwen3.5:9b` in a terminal |
| **Windows x64** | Only platform supported currently |

> **Pull the model first.** Run `ollama pull qwen3.5:9b` in any terminal and wait for it to finish before opening Mimir. This is a one-time download.

### Installing Mimir

1. Download `Mimir_x.x.x_x64-setup.exe` from the [Releases page](https://github.com/Sarthak-47/Mimir/releases).
2. Run the installer. Windows may show a SmartScreen warning — click **More info → Run anyway** (the app is unsigned).
3. The installer places Mimir in `%LocalAppData%\Mimir\` and creates a Start Menu shortcut.
4. Launch Mimir from the Start Menu or the desktop shortcut.

### Uninstalling

Run `%LocalAppData%\Mimir\uninstall.exe` or use **Add/Remove Programs** → search "Mimir".

Your conversation data lives in `%LocalAppData%\Mimir\data\` — the uninstaller does **not** delete this folder, so your history is preserved if you reinstall.

---

## 2. First Launch — Boot Splash

When Mimir opens, a full-screen **boot splash** appears:

```
      ◇ (eye-in-diamond logo)
   Awakening Mimir...
```

The app's Python backend (FastAPI + Ollama) takes a few seconds to start. The splash polls `/health` every 500 ms for up to 20 seconds. The ellipsis animates to show it is working. Once the backend responds, the splash disappears and the login screen appears.

> **If the splash never goes away:** Ollama is not running. Open a terminal and run `ollama serve`, then restart Mimir.

---

## 3. Authentication — Login & Register

### The login card

The card shows the **eye-in-diamond logo**, the name **MIMIR**, and the tagline *"The Well of Knowledge"*.

Two tabs at the top switch between modes:

| Tab | What it does |
|-----|-------------|
| **Drink from the Well** | Log in to an existing account |
| **Engrave your Name** | Create a new account |

Both modes ask for the same two fields:

- **NAME OF THE SEEKER** — your username
- **PASSPHRASE** — your password

The main button changes label based on mode:
- Login mode → **"Enter the Well"**
- Register mode → **"Forge your Path"**

### After authenticating

Your **JWT token** and **username** are saved to `localStorage`. On subsequent launches you go straight to the main interface — no need to log in again until you manually log out or the token expires (7 days).

### Notes

- Passwords are hashed with bcrypt on the backend — they are never stored in plain text.
- All data is local. Nothing is sent to any server outside your machine.
- If you are on a fresh install, you must **register** — there is no default account.

---

## 4. Main Layout — The Three Columns

After logging in, the app shows three columns side by side:

```
┌──────────┬───────────────────────────────┬──────────┐
│          │  Topbar                        │          │
│          ├───────────────────────────────┤          │
│ Sidebar  │  Main view content             │  Right   │
│  (left)  │  (Oracle / Trials / etc.)      │  Panel   │
│          │                               │          │
│          ├───────────────────────────────┤          │
│          │  Input Zone (Oracle only)      │          │
└──────────┴───────────────────────────────┴──────────┘
```

The sidebar and right panel are always visible. The centre column shows whichever view you have selected.

---

## 5. Sidebar (Left Column)

### Logo strip

At the top of the sidebar: the **eye-in-diamond SVG logo**, the word **MIMIR** in large gold letters, and the subtitle *"Drink from the well of knowledge"* in small italic text below.

---

### Navigation — Paths

Five navigation buttons, each with a rune icon and a label:

| Rune | Label | What it opens |
|------|-------|---------------|
| **ᚦ** | The Oracle | Main chat interface |
| **ᛏ** | Trials | Standalone quiz runner |
| **ᚢ** | The Reckoning | Progress & stats dashboard |
| **ᛊ** | Chronicle | Full conversation history |
| **ᚱ** | Scrolls | Uploaded file library |

The active view is highlighted with a bright green left border. Clicking any button switches the centre column instantly.

---

### Disciplines

Below the navigation is the **Disciplines** section — your study subjects.

**Adding a discipline:**
Click **"+ engrave new discipline"** at the bottom of the list. A text input appears inline — type the name and press **Enter**. The discipline is saved to the backend and appears immediately with a coloured diamond icon.

**Selecting a discipline:**
Click any discipline name to make it the **active subject**. A bright green left border marks it as active. The active subject:
- Appears as a badge in the input zone
- Is sent with every chat message so Mimir tailors responses to that subject
- Pre-selects the subject in the Trials quiz setup form
- Is used by TRIAL / RUNES / FATES quick actions

**Deselecting a discipline:**
Click the active discipline again to deselect it (or select a different one).

**Deleting a discipline:**
Hover over any discipline — a small **×** button appears on the right. Clicking it removes the discipline and its topics from the backend.

Subject colours cycle through: green, gold, light green, bright gold, and dark green.

---

### Ragnarök — Exam Date

Below the disciplines is the **Ragnarök** section (your exam deadline).

**Setting the date:**
Click on **"set date"** (or the existing date if one is set). A date input appears. Pick your exam date and click away — it saves automatically to both `localStorage` and your user profile on the backend.

**What it affects:**
- A **countdown** in the right panel shows how many days remain.
- A progress bar fills red as the exam approaches.

**Clearing the date:**
In the right panel, a small *"clear date"* link appears below the countdown when a date is set.

---

### User Profile Strip

At the very bottom of the sidebar:

- A square **avatar** showing the first letter of your username (in gold).
- Your **username** in small caps.
- The label *"Seeker of wisdom"* in italic below it.

This strip is decorative — it does not have any interactive buttons (logout is in the Topbar).

---

## 6. Topbar

The thin bar at the top of the centre column contains:

### Left side — Breadcrumb + subtitle

- **Breadcrumb** (small, uppercase, dim): the current view name, e.g. `THE ORACLE` — or with an active subject: `THE ORACLE · Machine Learning`.
- **Subtitle** (larger, bold): the view's tagline, e.g. *"Speak your question into the well"*.

### Right side — User badge + status pill

**User badge:**
Shows your username in a bordered chip. Next to it, the **logout rune button** (ᛚ — "Leave the Well"). Clicking it:
- Clears your token from `localStorage`
- Returns you to the login screen
- Clears all in-memory messages and subjects

**Status pill:**
A coloured dot + text showing the WebSocket connection state:

| Dot colour | Text | Meaning |
|------------|------|---------|
| 🟢 Green | **awake** | Connected — you can send messages |
| 🟡 Gold | **summoning…** | Connecting on startup (normal, wait a few seconds) |
| 🔴 Red | **offline** | Connection lost — Mimir will retry automatically |

The connection retries automatically with exponential backoff. If it stays red for more than ~30 seconds, check that Ollama is running.

---

## 7. The Oracle — Chat View

The Oracle is the main interface — a conversational chat with your local AI tutor.

### Empty state

When no messages exist yet, the centre shows:

- The rune **ᚦ** in large green text
- **"The Oracle Awaits"**
- *"Ask Mimir anything — concepts, quizzes, summaries, or what to study next."*
- Four **suggestion chips** you can click to start with a pre-filled question:
  - *"Explain cross-entropy loss"*
  - *"Quiz me on B+ Trees"*
  - *"What should I study today?"*
  - *"Summarize my uploaded notes"*

Clicking a chip sends that message immediately.

---

### Message bubbles

**Your messages** appear on the right with a gold right border. Your avatar initial appears to the far right.

**Mimir's messages** appear on the left with a green left border. A square **M** avatar appears to the far left.

Each bubble shows:
- Sender label (**YOU** or **MIMIR**) + timestamp (HH:MM) on the same line
- Message content below

**Mimir's responses support:**
- `**bold text**` → rendered in gold
- `$inline math$` → rendered with KaTeX
- `$$display math$$` → rendered as a centred block
- Plain text with line breaks preserved

---

### Thinking indicator

While waiting for Mimir's first token to arrive, an animated bubble appears on the left with cycling Norse phrases:

- *"Consulting the Well of Urd…"*
- *"Mimir drinks deep…"*
- *"The runes stir in the dark…"*
- *"Seeking wisdom beneath Yggdrasil…"*
- *"The waters of knowledge churn…"*
- *"The Norns weave their answer…"*
- *"Listening to the world tree…"*
- *"Drawing from the Well's depths…"*

Phrases cycle every 2.8 seconds with a fade transition.

---

### Inline quiz cards

When you ask Mimir to quiz you (or click **TRIAL**), a quiz card appears **inside the chat** immediately after the response bubble. It renders as a bordered card containing:

- A header: **ᛏ TRIALS — Question X of N**
- The question text
- Four answer options (A / B / C / D) as clickable buttons

**Selecting an answer:**
Click any option. All options lock immediately and colour-code:
- ✅ Correct answer → green border + green text
- ❌ Your wrong pick → red border + red text
- All others dim

An **explanation** appears below the options (if the model provided one).

A **"Next →"** button in the bottom-right advances to the next question.

**After the last question**, the quiz card is replaced by a score summary:
- **ᛏ** rune + your score (e.g. `7/10 — 70%`)
- A verdict:
  - ≥80% → *"Outstanding! You know this well."*
  - ≥60% → *"Good effort — keep practising."*
  - ≥40% → *"Needs more work. Review soon."*
  - <40% → *"Critical weakness. Review in 4 hours."*

> Inline quiz scores are **not** saved to the backend. Only quizzes started from the **Trials** view update your spaced repetition scores.

---

### Inline flashcard decks

When you ask for flashcards (or click **RUNES**), a flashcard deck appears in the chat below the response:

- Header: **ᚠ RUNES — 1/N** (card position)
- A clickable card body showing the **question** (front)
- Click the card to **flip** it — reveals the **answer** (back)
- Hint text: *"Question — click to reveal"* / *"Answer"*
- **‹** and **›** navigation arrows in the bottom right to move between cards

Flipping resets when you navigate to a new card.

---

### Input zone

The bottom strip of the Oracle view. Contains:

#### Quick-action rune buttons (top row)

| Rune | Label | What it does |
|------|-------|-------------|
| **ᛋ** | SCROLL | Opens a file picker — uploads a PDF or image to the backend, then sends a summary request to Mimir automatically. Accepted: `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp` |
| **ᛏ** | TRIAL | Sends *"Quiz me on [active subject]"* (or the last discussed topic if no subject is active) |
| **ᚠ** | RUNES | Sends *"Generate flashcards for [active subject]"* |
| **ᚾ** | FATES | Sends *"Build a revision schedule for [active subject]"* |
| **ᛞ/ᛊ** | DEEP / SWIFT | Toggles response mode (see [Response Modes](#13-response-modes--deep-vs-swift)) |

**Active subject badge** (right side of button row): When a discipline is selected, a diamond + subject name appears as a badge on the far right. This is a display indicator only — it shows which subject context is being sent with your messages.

#### Text input

A self-resizing **textarea**. Type your message here.
- Expands up to ~5 lines automatically as you type.
- Shrinks back when cleared.
- Placeholder: *"Speak your query to Mimir..."*

#### Send button (ᛊ rune)

A square button to the right of the textarea. It is dim and unclickable when the textarea is empty, and lights up green when there is text to send.

**Hint text** below the input: *"Enter to send · Shift+Enter for new line"*

---

## 8. Trials — Quiz Runner

The dedicated quiz view for running quizzes outside of the chat. Scores from here **do update** your spaced repetition and topic confidence.

### Setup form

When you first open Trials, a setup card appears:

**Discipline dropdown** (if you have subjects): Select which subject the quiz covers. Defaults to the currently active subject.

**Topic field**: Optional text input to narrow the quiz to a specific topic within the subject (e.g. "neural networks" within "Machine Learning"). Leave blank to quiz on the whole subject.

**Number of questions**: Three buttons — **5**, **10**, or **15**. The active count has a highlighted border.

**"Enter the Trial — ᛏ" button**: Submits the request to the backend, which calls Ollama to generate the questions.

---

### Loading state

While questions are being generated, a loading screen shows:
- The rune **ᛏ** in large gold text
- *"Consulting the runes…"*

Generation typically takes 10–30 seconds depending on your hardware and question count.

---

### Quiz runner

The same interactive quiz format as inline chat quizzes, but filling the full centre column. All the same interactions apply (select answer → see correct/wrong → explanation → Next →).

---

### Result card

After the last question:
- Score + percentage (e.g. `8/10 — 80%`)
- Same verdict messages as inline quizzes
- **"Begin Another Trial"** button — resets the form so you can run another quiz

The result is saved to the backend. Your topic's **confidence score** updates using a weighted formula based on percentage correct, and the **next review date** is scheduled using spaced repetition intervals (4h / 1d / 3d / 7d depending on score).

---

### Error card

If question generation fails (Ollama not running, backend error, etc.):
- *"The runes could not be consulted"*
- The error message from the backend
- *"Make sure the backend and Ollama are running."*
- **"Try Again"** button

---

## 9. The Reckoning — Progress Dashboard

Your full progress view. Loads data from the backend on mount.

### Stats row (top)

Four stat boxes across the top:

| Stat | What it measures |
|------|-----------------|
| **Days at the Well** | Total days you have used Mimir (streak or cumulative — resets daily at 00:05 UTC) |
| **Trial Accuracy** | Average score across all completed quizzes, as a percentage |
| **Current Streak** | Consecutive days with at least one study session |
| **Trials Completed** | Total number of quizzes submitted |

---

### Discipline Mastery

A list of all your tracked topics with confidence scores.

**Filter dropdown** at the top right: filter by discipline or show all.

Each row shows:
- **Topic name**
- **Subject name** (in small italic below the topic)
- A **colour-coded confidence bar** (horizontal):
  - 🟢 Green ≥ 80%
  - 🟡 Gold ≥ 60%
  - 🟫 Dark gold ≥ 40%
  - 🔴 Red < 40%
- **Percentage** (right of bar)
- **Study count** (e.g. `3×`) — how many times you've been quizzed on this topic

Topics are added automatically when you submit a quiz from the Trials view.

---

### Recent Trials

A table of your last 10 quiz results:

| Column | Content |
|--------|---------|
| Date | Month + day (e.g. `May 16`) |
| Topic | What was quizzed |
| Score | Raw score (e.g. `7/10`) |
| % | Percentage, coloured green/gold/red by performance |

---

## 10. Chronicle — Conversation History

A read-only view of your last 100 conversation turns, displayed in the same chat-bubble layout as the live Oracle.

- **Mimir's messages** on the left with green border, **M** avatar
- **Your messages** on the right with gold border, your initial avatar
- Each bubble shows the **date + time** of the message
- `**bold**` markdown is rendered in gold, same as in live chat
- Scroll up to read older messages

The history is loaded once on view mount. It does not live-update while you are viewing it — switch away and back to refresh.

---

## 11. Scrolls — File Library

Manage your uploaded documents. Mimir indexes uploaded files into its vector memory (ChromaDB) so you can ask questions about them in the chat.

### Header area

- **Title**: Scrolls / *"Your uploaded knowledge"*
- **Discipline selector** (if you have subjects): Assign a discipline to new uploads before picking a file. Optional — unassigned files go into general memory.
- **"ᛋ Upload Scroll" button**: Opens a file picker. Accepted formats: `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`

### File list

Each uploaded file shows as a row:

| Column | Content |
|--------|---------|
| Rune icon | **ᚱ** for PDFs, **ᛇ** for images, **ᚦ** for other |
| Filename | Full filename, truncated with ellipsis if long |
| Discipline | Which subject it is assigned to (— if none) |
| Status | **indexed** (green) — content is in memory; **pending** (gold) — still processing |
| × button | Deletes the file and removes it from the database |

### Empty state

If no files have been uploaded yet:
- Large **ᚱ** rune
- *"The vault is empty"*
- *"Upload a PDF or image and Mimir will extract its knowledge into memory."*
- **"Upload your first scroll"** button

### Hint text

At the bottom: *"Indexed scrolls become part of Mimir's memory. Ask about them in the Oracle."*

### How file indexing works

When you upload:
1. PDFs are parsed with **PyMuPDF** — all text is extracted.
2. Images are processed with **Tesseract OCR** — text is extracted.
3. Text is split into 512-character chunks with overlap.
4. Chunks are embedded and stored in **ChromaDB**.
5. Status shows `pending` until indexing completes, then `indexed`.

Once indexed, just ask Mimir in the Oracle: *"What does my uploaded PDF say about X?"* — it will retrieve relevant chunks and answer.

---

## 12. Right Panel

A fixed sidebar on the far right showing live stats. Auto-refreshes every 30 seconds.

### Warrior's Record

Two stat boxes with decorative corner marks (L-bracket corners in gold):

- **Days at the Well** — same as Reckoning dashboard
- **Trial Accuracy** — same as Reckoning dashboard

---

### Weaknesses

Up to 4 of your weakest topics, each shown as:
- Topic name (truncated with ellipsis)
- A small coloured bar showing confidence:
  - 🔴 Red = critical (< ~30%)
  - 🟡 Gold = weak
  - 🟢 Green = moderate

This list updates every 30 seconds from the backend. It is designed to show at a glance what to study next.

---

### Ragnarök Approaches

The exam countdown section.

- **Large number** (e.g. `14`) — days until your exam
- **"Days Until Trial"** label
- Subject name and date (e.g. `Machine Learning · May 30`)
- A **fill bar** that grows red as the date approaches (turns solid red with ≤7 days remaining)
- **"clear date"** link — removes the exam date from your profile

If no exam date is set: *"No exam date set."*

---

### Active Discipline indicator

When a subject is active (selected in the sidebar), a small chip at the bottom of the right panel shows:
- A coloured diamond (the subject's colour)
- The subject name

---

## 13. Response Modes — Deep vs Swift

The **mode toggle button** in the input zone controls how Mimir responds.

| Mode | Button rune | Button label | What it does |
|------|-------------|-------------|--------------|
| **Deep** (default) | ᛞ | DEEP | Thorough, detailed explanations. Longer responses. Better for learning new concepts. |
| **Swift** | ᛊ | SWIFT | Brief, direct answers. Shorter responses. Better for quick lookups or review. |

The button highlights (dark green background) when **Swift** mode is active. Click it again to switch back to Deep.

The mode is sent with every message — you can switch mid-conversation and the change takes effect on the very next message.

---

## 14. Keyboard Shortcuts

| Shortcut | Where | Action |
|----------|-------|--------|
| **Enter** | Input zone | Send message |
| **Shift + Enter** | Input zone | Insert a new line (multi-line message) |

No other keyboard shortcuts currently. The textarea auto-focuses after each sent message.

---

## 15. How the AI Works

### ReAct agent loop

Every message you send goes through a **ReAct (Reason + Act)** loop running on `qwen3.5:9b` via Ollama:

1. Mimir reads your message + the last 20 conversation turns + your topic scores for the active subject.
2. It reasons about what you need.
3. It decides whether to call a **tool** or respond directly.
4. Tool output is injected back into the context and the model produces the final response.
5. Tokens stream back to the frontend in real time as they are generated.

### Available tools

| Tool | What Mimir uses it for | What you see |
|------|------------------------|--------------|
| **quiz** | Generates multiple-choice questions | Inline quiz card appears in chat |
| **flashcards** | Generates flip-card study pairs | Flashcard deck appears in chat |
| **summarize** | Produces a condensed summary of a topic | Normal text response |
| **weak_topics** | Fetches your lowest-confidence topics | Normal text response listing what to review |

### Memory

Mimir has two memory layers:

**Conversation history** (SQLite): The last 20 turns of your conversation are loaded on every message. This is the immediate context — what you discussed a moment ago.

**Semantic memory** (ChromaDB): Every message you send and every response Mimir gives is embedded and stored as a vector. Your uploaded files are also here. When relevant, Mimir can retrieve past context that happened earlier than the 20-turn window.

### Spaced repetition

After every quiz submitted from the **Trials** view, Mimir updates the topic's confidence score and schedules the next review:

| Score | Next review |
|-------|-------------|
| < 40% | 4 hours |
| 40–59% | 1 day |
| 60–79% | 3 days |
| ≥ 80% | 7 days |

The **APScheduler** runs an hourly job to detect overdue topics and push a review reminder banner at the top of the screen (the gold banner with **ᚾ** rune).

---

## 16. Data & Privacy

Everything is local. Nothing leaves your machine.

| Data | Where it is stored |
|------|--------------------|
| User accounts + passwords (hashed) | `%LocalAppData%\Mimir\data\mimir.db` (SQLite) |
| Conversation history | Same SQLite database |
| Topic scores + quiz history | Same SQLite database |
| Semantic memory (message embeddings) | `%LocalAppData%\Mimir\data\chroma\` |
| Uploaded files (raw) | `%LocalAppData%\Mimir\data\uploads\` |
| JWT token + username | Browser `localStorage` (inside Tauri WebView) |
| Exam date | `localStorage` + synced to SQLite |

**To fully wipe all data:** delete `%LocalAppData%\Mimir\data\` and clear the WebView storage at `%LocalAppData%\com.mimir.studyagent\`.

---

## 17. Troubleshooting

### Boot splash never disappears

Ollama is not running. Open a terminal and run:
```
ollama serve
```
Then restart Mimir.

### Status pill shows "offline" / "summoning…" forever after login

The backend started but Ollama crashed or the model is not loaded. Run:
```
ollama run qwen3.5:9b
```
The status pill should turn green within a few seconds.

### "The runes could not be consulted" in Trials

Ollama is running but returned an error generating questions. This usually happens when:
- The model is still loading (first query after startup can take 30+ seconds)
- The topic you entered is very obscure — try a broader topic name
- You ran out of memory — close other heavy applications

### Uploaded file stays "pending" forever

File indexing ran but ChromaDB rejected the content. This can happen with:
- Encrypted/password-protected PDFs (Mimir cannot read these)
- Image files with no readable text (Tesseract finds nothing)
- Very large files (>50 MB) — split them before uploading

### Login screen loops or can't type

This was a bug in v0.1.0 where the WebSocket would connect without a token, get rejected, clear storage, and reload infinitely. It is **fixed in v0.1.1**. Update to the latest release.

### The app installed but shows the wrong version

Uninstall via `%LocalAppData%\Mimir\uninstall.exe`, then install the new `Mimir_x.x.x_x64-setup.exe` from the [Releases page](https://github.com/Sarthak-47/Mimir/releases).

---

*Built with Tauri + React + FastAPI + ChromaDB + Ollama. MIT licensed.*
