# Mimir — Complete User Guide

> *Everything you can do in the app, explained from first launch to daily use.*

---

## Table of Contents

1. [Prerequisites & Installation](#1-prerequisites--installation)
2. [First Launch — Boot Splash](#2-first-launch--boot-splash)
3. [Authentication — Login & Register](#3-authentication--login--register)
4. [Main Layout — The Three Columns](#4-main-layout--the-three-columns)
5. [Disciplines — The Core Organiser](#5-disciplines--the-core-organiser)
6. [Sidebar (Left Column)](#6-sidebar-left-column)
7. [Topbar](#7-topbar)
8. [Review Reminder Banner](#8-review-reminder-banner)
9. [The Oracle — Chat View](#9-the-oracle--chat-view)
10. [Trials — Quiz Runner](#10-trials--quiz-runner)
11. [The Reckoning — Progress Dashboard](#11-the-reckoning--progress-dashboard)
12. [Chronicle — Conversation History](#12-chronicle--conversation-history)
13. [Scrolls — File Library](#13-scrolls--file-library)
14. [Right Panel](#14-right-panel)
15. [Response Modes — Deep vs Swift](#15-response-modes--deep-vs-swift)
16. [Topics & Spaced Repetition](#16-topics--spaced-repetition)
17. [Background Scheduler](#17-background-scheduler)
18. [Keyboard Shortcuts](#18-keyboard-shortcuts)
19. [How the AI Works](#19-how-the-ai-works)
20. [Data & Privacy](#20-data--privacy)
21. [Troubleshooting](#21-troubleshooting)

---

## 1. Prerequisites & Installation

### What you need before installing

| Requirement | Where to get it |
|-------------|----------------|
| **Ollama** (runs the local AI) | [ollama.com/download](https://ollama.com/download) |
| **qwen3.5:9b model** (~6 GB download) | `ollama pull qwen3.5:9b` in any terminal |
| **Windows x64** | Only platform supported currently |

> **Pull the model first.** Run `ollama pull qwen3.5:9b` in any terminal and wait for it to finish before opening Mimir. This is a one-time 6 GB download. Mimir will not respond to messages if the model is missing.

### Installing Mimir

1. Download `Mimir_x.x.x_x64-setup.exe` from the [Releases page](https://github.com/Sarthak-47/Mimir/releases).
2. Run the installer. Windows SmartScreen may warn you — click **More info → Run anyway** (the app is not code-signed).
3. The installer places everything in `%LocalAppData%\Mimir\` and creates a Start Menu shortcut.
4. Launch Mimir from the Start Menu or desktop shortcut.

### Uninstalling

Run `%LocalAppData%\Mimir\uninstall.exe` or use **Add/Remove Programs** → search "Mimir".

Your conversation data in `%LocalAppData%\Mimir\data\` is **not deleted** by the uninstaller — your history, topics, and quiz scores are preserved if you reinstall.

---

## 2. First Launch — Boot Splash

When Mimir opens for the first time, the Python backend needs a few seconds to unpack and start. You will see a full-screen boot splash:

```
         ◇  (eye-in-diamond logo, animated)
    Awakening Mimir...
```

The ellipsis cycles (`...` → `. ` → `.. ` → `...`) every 500 ms while the app polls the backend `/health` endpoint. Once the backend responds, the splash disappears and the login screen appears automatically.

**On first ever launch specifically:** the app also extracts a ~71 MB zip archive (`backend-internal.zip`) into the install directory. This happens silently in the background and may add 10–20 seconds to the very first startup. Subsequent launches are faster.

> **If the splash never goes away (>20 seconds):** Ollama is not running. Open any terminal and run `ollama serve`, then restart Mimir. After 20 seconds the splash gives up and shows the auth screen anyway — but Mimir will not be able to answer questions until Ollama is running.

---

## 3. Authentication — Login & Register

### The login card

The card shows:
- **Eye-in-diamond SVG logo** (left)
- **MIMIR** in large gold letters
- *"The Well of Knowledge"* subtitle in small italic

A gold engraving line separates the logo from the form.

### Mode tabs

Two tabs at the top of the card:

| Tab | Action |
|-----|--------|
| **Drink from the Well** | Log in with an existing account |
| **Engrave your Name** | Register a new account |

The active tab has a brighter border and a green underline. Switching tabs clears any error message.

### Form fields

Both modes use the same two fields:

- **NAME OF THE SEEKER** — your username (text input, auto-focused on load)
- **PASSPHRASE** — your password (password input, masked)

### Buttons

| Button label | Mode | What it does |
|-------------|------|-------------|
| **Enter the Well** | Login | Submits credentials via OAuth2 form-encoded POST |
| **Forge your Path** | Register | Submits username + password as JSON, then logs you in |
| **Consulting the runes…** | Either (loading) | Shown while the request is in flight; button is disabled |

### Error messages

If login fails (wrong credentials) or registration fails (username taken), a red error box appears below the fields with the server's message.

### Footer

Below the second engraving line: *"All knowledge is stored locally. Nothing leaves your machine."*

### After authenticating

Your **JWT token** and **username** are saved to `localStorage`. On subsequent launches you go straight to the main interface — the login screen is skipped until you log out or the token expires (7 days by default).

**Notes:**
- Passwords are hashed with bcrypt — never stored in plain text.
- Accounts are local to your machine; there is no cloud sync.
- On a fresh install you must **register** first — there is no default account.

---

## 4. Main Layout — The Three Columns

After logging in, the app displays three fixed columns:

```
┌─────────────────┬──────────────────────────────────────┬──────────────┐
│                 │  Topbar                               │              │
│                 ├──────────────────────────────────────┤              │
│   Sidebar       │  [Review Reminder Banner — if any]   │  Right       │
│   (left)        ├──────────────────────────────────────┤  Panel       │
│                 │                                      │              │
│  • Logo         │   Main view content                  │  • Stats     │
│  • Navigation   │   (Oracle / Trials / Reckoning /     │  • Weaknesses│
│  • Disciplines  │    Chronicle / Scrolls)              │  • Countdown │
│  • Exam date    │                                      │              │
│  • Profile      ├──────────────────────────────────────┤              │
│                 │  Input Zone  (Oracle view only)       │              │
└─────────────────┴──────────────────────────────────────┴──────────────┘
```

- The **Sidebar** and **Right Panel** are always visible regardless of which view is active.
- The **Topbar** and optional **Review Reminder Banner** span the top of the centre column.
- The **Input Zone** only appears in the Oracle view.
- The centre column scrolls independently; the outer columns do not scroll.

---

## 5. Disciplines — The Core Organiser

**Disciplines** (also called subjects) are the most important concept in Mimir. They are study subjects you create — e.g. *"Machine Learning"*, *"Organic Chemistry"*, *"Data Structures"* — and they act as a lens that focuses the entire app on what you are currently studying.

### How disciplines flow through the whole app

Selecting a discipline (clicking it in the sidebar) sets it as the **active subject**. This one action affects every other part of the app:

| Where | What changes |
|-------|-------------|
| **Topbar breadcrumb** | Changes from `THE ORACLE` to `THE ORACLE · Machine Learning` |
| **Input zone badge** | A coloured diamond + subject name appears on the right of the button strip |
| **Every chat message** | The active subject's ID is attached to every message you send — Mimir uses it to tailor explanations and quizzes to that subject |
| **TRIAL button** | Sends *"Quiz me on Machine Learning"* instead of a generic prompt |
| **RUNES button** | Sends *"Generate flashcards for Machine Learning"* |
| **FATES button** | Sends *"Build a revision schedule for Machine Learning"* |
| **Trials view — discipline dropdown** | Pre-selects the active discipline in the quiz setup form |
| **Scrolls view — upload selector** | The active discipline is suggested for new file uploads |
| **Reckoning — mastery filter** | You can filter the topic list to show only topics under the active discipline |
| **Right panel — active discipline chip** | Shows a coloured diamond + subject name at the bottom of the right panel |
| **Conversation history (SQLite)** | Each message is tagged with the subject ID so history can be filtered per discipline in future |

### Creating a discipline

1. In the sidebar under **Disciplines**, click **"+ engrave new discipline"**.
2. A text input appears inline — type the discipline name.
3. Press **Enter** to save. The discipline is immediately sent to the backend API and appears in the list with an auto-assigned colour.
4. Press **Escape** or click away to cancel without saving.

### Selecting / switching disciplines

Click any discipline name. The active one gets a bright green left border. You can only have one active discipline at a time.

To **clear** the active discipline, click it again — the green border disappears and all the context above resets (messages go back to being subject-agnostic).

### Discipline colours

Colours are assigned automatically in a cycling sequence:
1. `#6ab87a` — forest green
2. `#c9a84c` — gold
3. `#7aaa84` — light green
4. `#e8c96a` — bright gold
5. `#4a8a5a` — dark green

After 5 disciplines the cycle repeats from the beginning.

### Deleting a discipline

Hover over any discipline row — a **×** button appears on the far right. Click it to:
- Remove the discipline from the sidebar immediately.
- Send a DELETE request to the backend (removes the discipline and its associated topic scores from SQLite).
- If the deleted discipline was active, the active subject is cleared.

> **Note:** Deleting a discipline does **not** delete conversation history that was tagged with it — those messages remain in the Chronicle.

### Disciplines vs Topics

These are two different things:

| Concept | What it is | Who creates it |
|---------|-----------|---------------|
| **Discipline** | A broad study subject (e.g. "Machine Learning") | You, manually in the sidebar |
| **Topic** | A specific area within a discipline (e.g. "neural networks", "backpropagation") | Created automatically when you submit a Trials quiz |

Disciplines organise your work. Topics are what Mimir tracks for spaced repetition. You can have many topics under one discipline.

---

## 6. Sidebar (Left Column)

### Logo strip

At the top: the **eye-in-diamond SVG logo**, the word **MIMIR** in large gold Cinzel font, and the tagline *"Drink from the well of knowledge"* in small italic Crimson Text. This is purely decorative.

---

### Navigation — Paths

Five navigation buttons arranged vertically, each with an Elder Futhark rune and a label:

| Rune | Label | View |
|------|-------|------|
| **ᚦ** | The Oracle | Chat with Mimir |
| **ᛏ** | Trials | Run a standalone quiz |
| **ᚢ** | The Reckoning | Progress dashboard |
| **ᛊ** | Chronicle | Full conversation history |
| **ᚱ** | Scrolls | Uploaded file library |

The active button has:
- A bright green left border
- Brighter rune colour
- Brighter label text

Clicking any button switches the centre column instantly with no loading state.

---

### Disciplines section

The section heading **"Disciplines"** (uppercase, dim gold) labels the list below it.

**Discipline list:** Each discipline shows a small coloured diamond (rotated square) followed by the discipline name in body font. Active discipline has a green left border and brighter text.

**Hover interaction:** Hovering any discipline row reveals the **×** delete button on the right.

**"+ engrave new discipline" button:** At the bottom of the list. Italic, dim, full-width button that opens the inline add form.

**Add form:** A full-width text input that appears below the list. Auto-focused. Press Enter to save, Escape or click elsewhere to cancel.

---

### Ragnarök — Exam Date

Below the disciplines, a section with:

- **"Ragnarök"** label on the left (uppercase, gold)
- **Date value or "set date"** on the right (italic, clickable)

**Setting the date:**
Click "set date" (or the existing date). A native date input (`<input type="date">`) appears. Pick your exam date — it saves the moment you select a date and click away. The value is stored in:
1. `localStorage` (instant, for offline access)
2. Your user profile on the backend via `PATCH /api/users/exam-date` (best-effort, synced on login)

**What the exam date powers:**
- The **days-until countdown** in the right panel
- The **fill bar** that turns red when ≤7 days remain

**Clearing the date:**
Click **"clear date"** in the right panel (below the countdown). This removes the date from `localStorage` and sends `null` to the backend.

---

### User Profile Strip

Fixed at the bottom of the sidebar:

- Gold engraving line above it
- Square **avatar** (first letter of username, uppercase, in gold on stone background)
- **Username** in small caps
- *"Seeker of wisdom"* label in italic below

This is decorative — no interactive actions here. Logout is in the Topbar.

---

## 7. Topbar

The bar at the top of the centre column. Always visible.

### Left side — breadcrumb + subtitle

**Breadcrumb** (small, uppercase, dim):
- Without an active discipline: `THE ORACLE`
- With an active discipline: `THE ORACLE · Machine Learning`
- Changes per view: `TRIALS`, `THE RECKONING`, `CHRONICLE`, `SCROLLS`

**Subtitle** (larger, bold, primary colour):

| View | Subtitle |
|------|---------|
| The Oracle | *"Speak your question into the well"* |
| Trials | *"Test your knowledge. Face the trial."* |
| The Reckoning | *"Behold your progress, warrior"* |
| Chronicle | *"Records of past sessions"* |
| Scrolls | *"Your uploaded knowledge"* |

A thin gold engraving gradient runs along the very bottom edge of the topbar.

### Right side — user badge + status pill

**User badge:**
A bordered chip showing your username in small uppercase letters. To its right, the **logout rune button**:

| Element | Detail |
|---------|--------|
| Rune | **ᛚ** |
| Tooltip | *"Leave the Well"* |
| Action | Clears token + username from `localStorage`, resets all app state, returns to the login screen |

**WebSocket status pill:**
A small bordered chip with a coloured dot and text label:

| Dot colour | Text | Meaning |
|------------|------|---------|
| 🟢 Bright green (glowing) | **awake** | WebSocket connected — Mimir can respond |
| 🟡 Gold (dim) | **summoning…** | Connecting at startup — wait a few seconds |
| 🔴 Dark red | **offline** | Disconnected — auto-retry is running |

The dot transitions smoothly between states. When offline, the hook retries automatically with backoff (1.5 s → 3 s → 4 s cap). If you stay offline for more than ~12 retries without ever connecting, it assumes a stale token and returns to the login screen.

---

## 8. Review Reminder Banner

A gold banner that appears **below the Topbar and above the main view** when the background scheduler detects overdue topics. It is not shown by default — only when Mimir has topics due for review.

### What it looks like

```
ᚾ   3 topics overdue for review — backpropagation, calculus, B+ Trees     [×]
```

- **ᚾ rune** on the left (gold)
- Topic count + up to 3 topic names listed inline
- **×** dismiss button on the far right

### When it appears

The backend runs an **hourly check** (see [Background Scheduler](#17-background-scheduler)). If any of your topics have a `next_review` timestamp in the past and you are currently connected via WebSocket, the server pushes a `review_reminder` message through the WebSocket. The frontend shows the banner immediately.

### Dismissing the banner

Click the **×** button. The banner hides for the current session. It will reappear after the next hourly check if the topics are still overdue.

The banner does not automatically navigate you anywhere — it is a reminder only. Go to **Trials** to review the listed topics and clear their overdue status.

---

## 9. The Oracle — Chat View

The main interface. A live streaming conversation with your local AI tutor.

### Empty state (no messages yet)

When you have not sent any messages yet, the chat area shows:

- Large **ᚦ** rune in green
- **"The Oracle Awaits"** heading
- *"Ask Mimir anything — concepts, quizzes, summaries, or what to study next."* subtext
- Four **suggestion chips** — clickable prompts to get started:

| Chip | What it sends |
|------|--------------|
| *"Explain cross-entropy loss"* | A concept explanation request |
| *"Quiz me on B+ Trees"* | Triggers the quiz tool |
| *"What should I study today?"* | Triggers the weak_topics tool |
| *"Summarize my uploaded notes"* | Triggers summarization of indexed files |

Clicking any chip sends that text immediately as your message.

---

### Message bubbles

Every message appears as a **bubble** in the chat scroll area.

**Your messages (right-aligned):**
- Gold right border (`2px solid var(--gold-dim)`)
- Stone-4 background
- Your username initial in a small square avatar on the far right
- Sender label: **YOU** (uppercase, dim)
- Timestamp (HH:MM) aligned to the right of the sender label

**Mimir's messages (left-aligned):**
- Green left border (`2px solid var(--green)`)
- Stone-3 background
- Square **M** avatar on the far left
- Sender label: **MIMIR** (uppercase, dim)
- Timestamp aligned to the right of the sender label

**Mimir's message content renders:**

| Syntax | Rendered as |
|--------|------------|
| `**bold text**` | Gold-coloured bold span |
| `$x^2 + y^2$` | Inline KaTeX formula |
| `$$\sum_{i=0}^{n} x_i$$` | Centred display KaTeX block |
| Plain text | Preserved with line breaks (`white-space: pre-wrap`) |

---

### Thinking indicator

Shown while waiting for Mimir's first streaming token. A left-aligned bubble with a **M** avatar cycles through Norse-flavoured phrases (one every 2.8 s, with a fade transition):

1. *"Consulting the Well of Urd…"*
2. *"Mimir drinks deep…"*
3. *"The runes stir in the dark…"*
4. *"Seeking wisdom beneath Yggdrasil…"*
5. *"The waters of knowledge churn…"*
6. *"The Norns weave their answer…"*
7. *"Listening to the world tree…"*
8. *"Drawing from the Well's depths…"*

The indicator disappears the moment the first token arrives and text starts streaming in.

---

### Inline quiz (embedded in chat)

When Mimir's response includes quiz questions (triggered by asking Mimir to quiz you, or clicking the **TRIAL** button), an interactive quiz card appears **inside the chat, directly below the response bubble**.

**Quiz card structure:**

```
┌─────────────────────────────────────────────┐
│  ᛏ TRIALS — Question 2 of 5                 │
│─────────────────────────────────────────────│
│  What is the time complexity of binary       │
│  search on a sorted array?                   │
│                                             │
│  [A]  O(n)         [B]  O(log n)  ← correct │
│  [C]  O(n log n)   [D]  O(1)                │
│                                             │
│  Binary search halves the search space       │
│  each step, giving O(log n).                 │
│                                    [Next →]  │
└─────────────────────────────────────────────┘
```

**Interactions:**
- Click any option → all options lock; correct answer turns green, your wrong pick turns red, others dim
- Explanation text appears below the options (if generated by the model)
- **"Next →"** button (bottom right) — advances to next question
- After the last question → replaced by a score summary card

**Score summary card:**

```
ᛏ   7/10 — 70%
    Good effort — keep practising.
```

Verdicts:
- ≥ 80% → *"Outstanding! You know this well."*
- ≥ 60% → *"Good effort — keep practising."*
- ≥ 40% → *"Needs more work. Review soon."*
- < 40% → *"Critical weakness. Review in 4 hours."*

> **Important:** Inline quiz scores are **not** saved to the database. They do not update your topic confidence or schedule. Only quizzes run from the **Trials** view are persisted.

---

### Inline flashcard deck (embedded in chat)

When Mimir generates flashcards (triggered by asking for flashcards or clicking **RUNES**), a flip-card deck appears below the response bubble.

```
┌─────────────────────────────────────────────┐
│  ᚠ RUNES — 3/8                              │
│─────────────────────────────────────────────│
│                                             │
│   What is gradient descent?                  │
│                                             │
│   Question — click to reveal                 │
│                                  [‹]  [›]   │
└─────────────────────────────────────────────┘
```

**Interactions:**
- **Click the card body** → flips to the answer (back face). The hint changes to *"Answer"*. Click again to flip back.
- **‹ button** — previous card (disabled on first card)
- **› button** — next card (disabled on last card)
- Navigating to a new card always resets to the front (question) face

The header shows current position: **ᚠ RUNES — 3/8**.

---

### Input zone

The bottom strip of the Oracle view. Always visible within the Oracle.

#### Rune action strip (top row of buttons)

Five quick-action buttons and one badge:

| Rune | Label | Action |
|------|-------|--------|
| **ᛋ** | SCROLL | Opens OS file picker. Accepted: `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`. Uploads the file to `/api/files/upload`, then automatically sends the message *"I just uploaded '[filename]'. Please summarise it for me."* to start a conversation about it. |
| **ᛏ** | TRIAL | Sends *"Quiz me on [active subject]"*, or *"Quiz me on the topic we last discussed"* if no subject is active. Triggers the quiz tool. |
| **ᚠ** | RUNES | Sends *"Generate flashcards for [active subject]"*, or *"Generate flashcards for the topic we last discussed"*. Triggers the flashcards tool. |
| **ᚾ** | FATES | Sends *"Build a revision schedule for [active subject]"*, or *"Build a revision schedule for my subjects"*. Mimir responds with a structured study plan as plain text. |
| **ᛞ / ᛊ** | DEEP / SWIFT | Toggles response verbosity. See [Response Modes](#15-response-modes--deep-vs-swift). |

**Active subject badge** (far right of the strip, when a discipline is selected):
- Small green diamond + discipline name in uppercase
- Display only — not interactive
- Confirms which subject context is active for the next message

**SCROLL button loading state:**
While a file is uploading, the SCROLL button shows **"…"** and is disabled. It re-enables once the upload completes or fails.

#### Textarea

A self-resizing plain text input.
- Placeholder: *"Speak your query to Mimir..."*
- Starts at 1 row height (~38px), expands as you type, capped at ~5 rows (130px)
- Shrinks back to 1 row after sending

#### Send button (ᛊ rune)

A square button to the right of the textarea.
- **Dim + disabled** when the textarea is empty
- **Bright green + enabled** when there is text to send
- Sends the message and clears the textarea

#### Hint text

Below the textarea: *"Enter to send · Shift+Enter for new line"* in small italic.

---

## 10. Trials — Quiz Runner

A dedicated quiz runner where scores **are saved** and update your spaced repetition schedule. Use this view when you want Mimir to track your progress on a topic.

### Setup form

Opens by default when you navigate to Trials.

**Discipline dropdown** (only shown if you have at least one discipline):
- Defaults to the currently active discipline
- Select any discipline to quiz within that subject context
- Choosing no discipline ("— any —") generates a general-knowledge quiz

**Topic input** (optional, text field):
- Narrow the quiz to a specific topic within the selected discipline
- Examples: *"neural networks"*, *"Dijkstra's algorithm"*, *"acid-base reactions"*
- Leave blank to quiz on the whole discipline broadly

**Number of questions:** Three toggle buttons:
- **5** — quick check (~5 min)
- **10** — standard session (~10 min)
- **15** — deep review (~15 min)
The selected count has a highlighted border. Default is 5.

**"Enter the Trial — ᛏ" button:**
Full-width green button at the bottom of the card. Submits the quiz generation request. The backend sends the topic + discipline context to Ollama, which generates the questions.

---

### Loading state

While questions are being generated:
- Large gold **ᛏ** rune
- *"Consulting the runes…"* in italic
- No progress indicator — just wait

Generation takes 10–40 seconds depending on question count and hardware. Ollama generates all questions in one pass.

---

### Quiz runner

The same format as inline chat quizzes (see [Inline quiz](#inline-quiz-embedded-in-chat)) but:
- Fills the full centre column width
- Larger question text
- Fully interactive — same click-to-answer, colour-coded feedback, explanation, and Next → button

---

### Result card

After the last question:

```
ᛏ
8/10 — 80%
Outstanding! You know this well.
─────────────────────────────
        [Begin Another Trial]
```

**What happens in the background when you see this card:**
1. The result (`score`, `total`, `topic_name`, `subject_id`) is submitted to the backend.
2. The topic is looked up by name — if it doesn't exist yet under the discipline, it is created automatically.
3. The topic's **confidence score** is updated using a weighted moving average.
4. The topic's **next_review** date is set based on your score (see [Topics & Spaced Repetition](#16-topics--spaced-repetition)).
5. The result row is added to the **QuizSession** history (visible in Reckoning → Recent Trials).

**"Begin Another Trial" button:** Resets the view to the setup form. The discipline and question count are remembered.

---

### Error card

If generation fails:

```
The runes could not be consulted
[error message from the backend]
Make sure the backend and Ollama are running.

        [Try Again]
```

**"Try Again" button:** Returns to the setup form without losing your selections.

---

## 11. The Reckoning — Progress Dashboard

Your full progress view. All data fetched fresh from the backend on every mount.

### Stats row

Four stat boxes displayed in a responsive flex row:

| Box | Metric | Notes |
|-----|--------|-------|
| **Days at the Well** | How many days you have used Mimir | Computed from quiz session history; resets if you miss a day |
| **Trial Accuracy** | Average score across all submitted quizzes | Percentage, rounded to nearest integer |
| **Current Streak** | Consecutive days with at least one quiz submitted | Broken if you skip a day |
| **Trials Completed** | Total quiz sessions ever submitted | Cumulative, never decreases |

Each box has a label (small uppercase), a large number in gold, and a small italic subtitle (e.g. *"unbroken vigil"*, *"all time"*).

---

### Discipline Mastery

A table of all your tracked topics with live confidence scores.

**Filter dropdown** (top right of the section):
- *"All disciplines"* — shows every topic from every discipline
- Any individual discipline — shows only topics under that subject

**Topic rows** (one per tracked topic):

| Element | What it shows |
|---------|--------------|
| Topic name | Full name in body font |
| Subject name | Small italic below the topic name — which discipline it belongs to |
| Confidence bar | Horizontal bar, 80px wide, colour-coded |
| Percentage | Numeric score to the right of the bar |
| Study count | Number of times this topic has been quizzed (e.g. `3×`), on the far right |

**Confidence bar colours:**
- 🟢 Green (`var(--green-dim)`) — ≥ 80% — strong
- 🟡 Gold (`var(--gold-dim)`) — ≥ 60% — good
- 🟫 Dark gold (`#7a5020`) — ≥ 40% — needs work
- 🔴 Red (`#8a3a3a`) — < 40% — critical weakness

If no topics exist yet: *"No topics tracked yet. Start chatting with Mimir or run a trial."*

---

### Recent Trials

Shown only if you have quiz history. Displays up to the **10 most recent** quiz sessions:

| Column | Content |
|--------|---------|
| Date | Short format — `May 16` |
| Topic | Topic name |
| Score | `7/10` format |
| % | Percentage; coloured green (≥80%), gold (≥60%), or red (<60%) |

---

## 12. Chronicle — Conversation History

A paginated, read-only view of your conversation history. Loads the **100 most recent turns** on mount.

### Layout

Same chat-bubble layout as the live Oracle:
- **Mimir messages** — left-aligned, green left border, **M** avatar
- **Your messages** — right-aligned, gold right border, your initial avatar
- **`**bold**`** markdown is highlighted in gold (same as live chat)
- Each bubble shows **date + time** (e.g. `May 16, 14:32`)

Scroll up to read older messages. The view does not live-update — it is a snapshot from when you navigated here. Switch to another view and back to refresh.

### Filtering and search

Not yet implemented. The full 100-turn history is shown in chronological order.

---

## 13. Scrolls — File Library

Manage your uploaded documents. Files uploaded here are indexed into ChromaDB and become part of Mimir's permanent memory.

### Header area (always visible)

- **ᚱ** rune + **"Scrolls"** title + *"Your uploaded knowledge"* subtitle on the left
- On the right:
  - **Discipline selector** (dropdown, shown only if you have disciplines): choose which subject to assign new uploads to. Optional — unassigned files go into general memory.
  - **"ᛋ Upload Scroll" button** — opens the OS file picker

**Upload Scroll button accepted formats:** `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`

**While uploading:** the button is disabled and shows *"Uploading…"*

---

### File list (when files exist)

**Column header row** (dim, uppercase labels):
`[rune icon] | Scroll | Discipline | Status | [delete]`

**File rows**, one per uploaded document:

| Element | Detail |
|---------|--------|
| Rune icon | **ᚱ** = PDF, **ᛇ** = image (png/jpg/webp), **ᚦ** = other |
| Filename | Full original filename, truncated with `…` if long |
| Discipline | Assigned subject name, or `—` if none |
| Status badge | **indexed** in green = content searchable; **pending** in gold = still processing |
| × button | Deletes file from the database and removes it from ChromaDB |

---

### Empty state (no files yet)

```
       ᚱ
   The vault is empty
Upload a PDF or image and Mimir will
extract its knowledge into memory.

   [Upload your first scroll]
```

---

### Footer hint

At the very bottom of the Scrolls view:
*"Indexed scrolls become part of Mimir's memory. Ask about them in the Oracle."*

---

### How file indexing works (step by step)

1. You select a file in the file picker.
2. The file is sent to `POST /api/files/upload` with an optional `subject_id`.
3. The backend saves the raw file to disk.
4. **For PDFs:** PyMuPDF extracts all text content page by page.
5. **For images:** Tesseract OCR reads any text in the image.
6. The extracted text is split into **512-character chunks** with a small overlap between chunks.
7. Each chunk is embedded (converted to a vector) and stored in **ChromaDB**, tagged with the file ID and subject ID.
8. The file's `processed` flag is set to `True` in SQLite — the status badge changes from `pending` to `indexed`.

Once indexed, Mimir can retrieve relevant chunks when you ask questions in the Oracle. Example: *"What does my Machine Learning notes PDF say about regularization?"*

### Upload from Oracle vs upload from Scrolls

| Method | Where | What happens after upload |
|--------|-------|--------------------------|
| **SCROLL button** in Oracle input zone | Chat view | File uploads, then Mimir immediately sends a summary of it into the chat |
| **"ᛋ Upload Scroll" button** in Scrolls view | Scrolls view | File uploads and is indexed — no automatic chat message |

Both methods index the file. The Oracle shortcut is faster if you want to immediately discuss what you just uploaded.

---

## 14. Right Panel

A fixed sidebar on the far right. Fetches stats from the backend on mount and **auto-refreshes every 30 seconds**.

### Warrior's Record

Two stat boxes with gold L-bracket corner decorations (purely visual):

**Days at the Well:**
- Large number in gold (e.g. `12`)
- Subtitle: *"unbroken vigil"*

**Trial Accuracy:**
- Large number + `%` in gold (e.g. `76%`)
- Subtitle: *"all time"*

Both boxes show `—` while loading.

---

### Weaknesses

Up to **4 of your lowest-confidence topics** listed in order from weakest:

Each row:
- Topic name (left, truncated with ellipsis)
- A small 44px colour bar on the right:
  - 🔴 Red `#8a3a3a` — `critical` status
  - 🟡 Gold `var(--gold-dim)` — `weak` status
  - 🟢 Green `var(--green-dim)` — `moderate` status

If no topics tracked yet: *"No weak topics yet."*

This section is your at-a-glance "what to study now" guide. The weakest topic is always at the top.

---

### Ragnarök Approaches

**With an exam date set:**
- Large number — days until exam (e.g. `14`)
- **"Days Until Trial"** label (uppercase, dim)
- Subject name + date (e.g. `Machine Learning · May 30`) in small italic gold
- A progress fill bar:
  - Calculates `100 - (days / 90 * 100)` fill percentage
  - Bar colour: gold normally, **red** when ≤ 7 days remain
- **"clear date"** link (italic, dim, right-aligned) — removes the exam date

**Without an exam date:**
- *"No exam date set."* in italic
- Set one via the Sidebar's Ragnarök section

---

### Active Discipline chip

When you have a discipline selected, a small chip appears at the very bottom of the right panel:
- Small coloured diamond (the discipline's colour) on the left
- Discipline name on the right

This disappears when no discipline is active.

---

## 15. Response Modes — Deep vs Swift

The **mode toggle button** in the Oracle input zone controls the verbosity of every response Mimir gives.

| Mode | Rune shown | Label | Behaviour |
|------|------------|-------|-----------|
| **Deep** (default) | ᛞ | DEEP | Thorough explanations, worked examples, context. Best for learning something new. |
| **Swift** | ᛊ | SWIFT | Short, direct answers. No padding. Best for quick lookups or revision. |

The button background turns dark green when **Swift** is active. Click it again to return to Deep.

The mode value (`"detailed"` or `"fast"`) is sent with every chat message in the WebSocket payload. Switching modes mid-conversation takes effect on the very next message — you can ask a quick question in Swift then switch back to Deep for the next detailed topic.

---

## 16. Topics & Spaced Repetition

### What is a topic?

A **topic** is a specific knowledge area that Mimir tracks for spaced repetition. Topics are always children of a discipline.

Examples:
- Discipline: *Machine Learning* → Topics: *"backpropagation"*, *"gradient descent"*, *"transformers"*
- Discipline: *Data Structures* → Topics: *"B+ Trees"*, *"red-black trees"*, *"heaps"*

### How topics are created

Topics are **never created manually**. They are created automatically when you submit a quiz from the **Trials view**:

1. You run a quiz with topic *"backpropagation"* under *Machine Learning*.
2. On completion, Mimir looks for an existing topic named "backpropagation" under Machine Learning.
3. If found: updates the confidence score.
4. If not found: creates a new topic row in SQLite.
5. The new topic immediately appears in the **Reckoning** mastery list.

### Confidence score

Each topic has a `confidence_score` (0–100). It starts at `50` when first created.

After each quiz:
- The new score is blended with the existing score: `new = old * 0.7 + result_pct * 0.3`
- This weighted average prevents a single bad quiz from tanking your score or a single lucky run from inflating it.

### Spaced repetition schedule

After each quiz submission, Mimir sets a `next_review` date based on performance:

| Score | Next review due |
|-------|----------------|
| < 40% | 4 hours |
| 40–59% | 1 day |
| 60–79% | 3 days |
| ≥ 80% | 7 days |

When `next_review` is in the past, the topic is **overdue**. The hourly scheduler detects this and pushes the Review Reminder Banner.

### Seeing your topics

All tracked topics are visible in:
- **The Reckoning** → Discipline Mastery section (full list, filterable)
- **Right Panel** → Weaknesses section (top 4 lowest-confidence topics)
- **Review Reminder Banner** → shows topic names when overdue

---

## 17. Background Scheduler

Mimir runs two automatic background jobs via APScheduler:

### Hourly: Review Check

**When:** Every hour, on the hour, 24/7 while Mimir is running.

**What it does:**
1. Queries all topics in the database where `next_review` is in the past.
2. Groups overdue topics by user.
3. For each user currently connected via WebSocket: sends a `review_reminder` push message with the topic count and up to 5 topic names.
4. The frontend receives this message and shows the [Review Reminder Banner](#8-review-reminder-banner).

If no topics are overdue, nothing happens.

### Daily: Streak Update (00:05 UTC)

**When:** Every day at 00:05 UTC (midnight + 5 min).

**What it does:**
1. Fetches all users who have at least one quiz session.
2. For each user, computes the current consecutive-day streak from their quiz history.
3. Logs the result (used by `/api/progress/stats` to serve the streak number in the Reckoning dashboard).

**Streak logic:**
- A day counts if you submitted at least one quiz that day.
- The streak is the number of consecutive days ending on today (or yesterday) with at least one quiz.
- If the most recent quiz was more than 1 day ago, the streak is 0.

---

## 18. Keyboard Shortcuts

| Shortcut | Where it works | Action |
|----------|---------------|--------|
| **Enter** | Oracle input zone | Send the message |
| **Shift + Enter** | Oracle input zone | Insert a newline (multi-line message) |
| **Enter** | Add discipline form | Save the new discipline |
| **Escape / click away** | Add discipline form | Cancel without saving |

The textarea re-focuses automatically after each message is sent. No global navigation shortcuts currently exist.

---

## 19. How the AI Works

### WebSocket streaming

The connection to Mimir is a **persistent WebSocket** (`ws://127.0.0.1:8000/ws/chat?token=<jwt>`). It opens when you log in and stays open for the entire session. You can send multiple messages on the same connection without re-authenticating.

Tokens stream back from Ollama one chunk at a time — the text appears in the message bubble as it is generated, not all at once at the end.

### ReAct agent loop

Every message goes through a **ReAct (Reason + Act)** loop:

```
Your message
    ↓
System prompt + last 20 conversation turns + topic scores for active subject
    ↓
Ollama (qwen3.5:9b) reasons about what you need
    ↓
Tool call? ──Yes──► Tool runs ──► Result injected into context ──► Final response generated
     │                                                                     │
    No                                                                     ↓
     └──────────────────────────────────────────────────────────► Streaming tokens
```

### System prompt context

Every message sends to the model:
- The full **system prompt** (defines Mimir's role and Norse personality)
- **Last 20 conversation turns** (immediate context)
- **Topic confidence scores** for the active discipline (so Mimir knows what you are weak on)
- **Active subject name and ID**
- The chosen **response mode** (detailed or fast)

### Tools the agent can call

| Tool | Trigger phrase (examples) | Output |
|------|--------------------------|--------|
| **quiz** | *"quiz me"*, *"test me"*, *"MCQ on"* | JSON quiz data → inline quiz card |
| **flashcards** | *"flashcards"*, *"flash cards"*, *"study cards"* | JSON flashcard data → flip-card deck |
| **summarize** | *"summarize"*, *"summarise"*, *"TL;DR"* | Structured summary text |
| **weak_topics** | *"what should I study"*, *"my weaknesses"* | Fetches topics from DB → listed in response |

The agent decides which tool to call based on natural language — you do not have to use specific keywords. If no tool fits, it responds directly as a tutor.

### Two memory layers

**Immediate context (SQLite, last 20 turns):**
What you discussed in the current and recent sessions. Always included in every request.

**Semantic memory (ChromaDB, all history + files):**
Every message and response is embedded and stored as a vector. Your uploaded files are also here. When you reference something from a long-ago session or ask about uploaded documents, the agent retrieves the most relevant chunks from ChromaDB and includes them in the context.

---

## 20. Data & Privacy

Everything in Mimir runs and is stored on your local machine. No data is sent to any external server.

| Data type | Stored at |
|-----------|-----------|
| User accounts + bcrypt-hashed passwords | `%LocalAppData%\Mimir\data\mimir.db` |
| Conversation history (all messages) | Same SQLite database |
| Disciplines and topic scores | Same SQLite database |
| Quiz session history | Same SQLite database |
| Exam date | Same SQLite database + `localStorage` |
| Semantic message embeddings | `%LocalAppData%\Mimir\data\chroma\` |
| Uploaded raw files | `%LocalAppData%\Mimir\data\uploads\` |
| JWT token + username (current session) | WebView2 `localStorage` |
| WebView2 cache and cookies | `%LocalAppData%\com.mimir.studyagent\EBWebView\` |

**To fully reset all data:** delete `%LocalAppData%\Mimir\data\` (SQLite + ChromaDB + uploads), then clear `%LocalAppData%\com.mimir.studyagent\` (WebView2 localStorage / session data).

---

## 21. Troubleshooting

### Boot splash never disappears

Ollama is not running. Open any terminal and run:
```
ollama serve
```
Then restart Mimir. If the splash times out (20 s) it shows the login screen anyway, but Mimir cannot respond to questions until Ollama is up.

---

### Status pill shows "offline" or stays "summoning…" after logging in

The WebSocket cannot reach the backend. Most common causes:

1. **Ollama not running** — run `ollama serve`
2. **Backend crashed during startup** — close Mimir completely and reopen it
3. **Antivirus blocked the backend** — add `%LocalAppData%\Mimir\mimir-backend\` to your AV exclusions

---

### Mimir replies with an error or stops mid-response

The LLM encountered an issue. Common causes:
- The model is still loading on first use after startup (wait ~30 s and retry)
- Ollama ran out of VRAM — close other GPU-heavy apps and retry
- The response was cut short — ask Mimir to continue

---

### "The runes could not be consulted" in Trials

Quiz generation failed. Try:
- Waiting 30 s and clicking **Try Again** (model may still be loading)
- Making the topic name broader (e.g. *"sorting algorithms"* instead of *"in-place stable O(n log n) sort"*)
- Reducing the question count to 5

---

### Uploaded file stays "pending" forever

Indexing failed silently. This happens with:
- **Encrypted PDFs** — Mimir cannot read password-protected files
- **Image with no text** — Tesseract finds nothing to embed
- **Corrupt file** — the file was damaged before upload

Delete the file, fix the source, and re-upload.

---

### Login screen loops, logo glitches, or can't type in the login fields

This was a bug in **v0.1.0** where the WebSocket connected without a token, received a rejection, cleared `localStorage`, and reloaded the page — causing an infinite loop.

**Fixed in v0.1.1.** Download the latest installer from the [Releases page](https://github.com/Sarthak-47/Mimir/releases).

---

### Review reminder banner appears but I reviewed the topic already

The banner is sent when the hourly scheduler runs. If you just completed a quiz, the `next_review` date was updated, but the banner from the previous hourly check is still on screen. Click **×** to dismiss it. It will not reappear for that topic at the next check.

---

### Streak shows 0 even though I studied today

The streak is computed from **quiz sessions submitted via the Trials view**. Just chatting in the Oracle does not count toward the streak. Submit at least one Trials quiz per day to maintain it.

---

*Built with Tauri · React · FastAPI · ChromaDB · Ollama. MIT licensed.*
