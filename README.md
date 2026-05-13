# ᛗ Mimir — The Well of Knowledge

> *"Before you can see clearly, you must drink from the well."*

A **local-first**, **offline** study agent desktop application.  
God of War-inspired dark fantasy UI. Norse wisdom aesthetic. No cloud. No tracking.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🤖 **AI Tutor** | Chat with Mimir powered by local Ollama (qwen2.5:14b) |
| 🛡 **Trials** | Auto-generated MCQ quizzes on any topic |
| 📤 **Scrolls** | Upload PDFs/images, ask questions about them |
| 🃏 **Runes** | Generate flashcard Q&A pairs from any topic |
| 🔁 **Spaced Repetition** | Automatically schedules review based on your quiz scores |
| 📊 **Reckoning** | Track weak areas, exam countdown, study streak |
| 🔒 **Privacy** | 100% local — nothing leaves your machine |

---

## 🛠 Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | [Tauri](https://tauri.app) (Rust, ~10MB binary) |
| Frontend | React 18 + TypeScript + Vite |
| Styling | CSS variables, God of War dark theme |
| Fonts | Cinzel + Crimson Text (Google Fonts) |
| Backend | [FastAPI](https://fastapi.tiangolo.com) (Python 3.11+) |
| Local LLM | [Ollama](https://ollama.com) + `qwen2.5:14b` |
| Vector Memory | [ChromaDB](https://www.trychroma.com) (embedded) |
| Database | SQLite (via SQLAlchemy async) |
| File Parsing | PyMuPDF + Tesseract OCR |

---

## 🚀 Getting Started

### Prerequisites

1. **Rust + Cargo** — https://rustup.rs  
2. **Node.js 20+** — https://nodejs.org  
3. **Python 3.11+** — https://python.org  
4. **Ollama** — https://ollama.com — then run:
   ```bash
   ollama pull qwen2.5:14b
   ```
5. **Tesseract OCR** (optional, for image parsing) — https://github.com/tesseract-ocr/tesseract

---

### Development

```bash
# 1. Clone
git clone https://github.com/yourname/mimir.git
cd mimir

# 2. Backend
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# → API running at http://localhost:8000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev
# → Dev server at http://localhost:5173

# 4. Tauri dev mode (new terminal, from repo root)
cargo tauri dev
```

---

### Production Build

```bash
# From repo root — produces platform binary
cargo tauri build
```

Outputs:
- Windows: `src-tauri/target/release/bundle/msi/Mimir_*.msi`
- macOS:   `src-tauri/target/release/bundle/dmg/Mimir_*.dmg`
- Linux:   `src-tauri/target/release/bundle/appimage/Mimir_*.AppImage`

---

## 📁 Project Structure

```
mimir/
├── src-tauri/          # Rust shell (Tauri)
│   ├── src/main.rs
│   ├── tauri.conf.json
│   └── Cargo.toml
│
├── frontend/           # React UI
│   ├── src/
│   │   ├── components/ # Sidebar, Chat, InputZone, RightPanel, Quiz, Topbar
│   │   ├── hooks/      # useWebSocket
│   │   ├── styles/     # globals.css (design system)
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── backend/            # FastAPI + ReAct agent
│   ├── main.py
│   ├── config.py
│   ├── agent/          # loop.py, tools.py, prompts.py
│   ├── memory/         # database.py (SQLite), vector.py (ChromaDB)
│   ├── routers/        # chat, files, quiz, users, progress
│   └── requirements.txt
│
└── .github/workflows/  # Auto-build binaries on release
    └── build.yml
```

---

## 🎨 Design System

**Colors**: Forest green (`#4a8a5a`) + gold (`#c9a84c`) on stone black (`#060c08`)  
**Fonts**: Cinzel (headers/nav) + Crimson Text (body)  
**Language**: Norse mythology — rune icons (ᚦ ᛏ ᚢ ᛊ ᚱ), angular clip-paths, no rounded corners  

---

## 📜 License

MIT — fork freely, study wisely.

---

*Built with wisdom. Guarded by Mimir.*
