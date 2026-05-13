# ᛗ Mimir — Installation Guide

> Complete setup guide for Windows. Follow steps in order.

---

## 📋 What You Need at a Glance

| Tool | Why | Already Installed? |
|------|-----|--------------------|
| Python 3.11 | Backend (FastAPI, ChromaDB, Ollama) | ⚠️ You have 3.14 — install 3.11 |
| Node.js | Frontend (React, Vite) | ✅ v24.13.0 |
| Rust + Cargo | Desktop wrapper (Tauri) | ❌ Missing |
| Ollama | Run the local AI model | ❌ Missing |
| qwen2.5:14b | The actual LLM (~9GB) | ❌ Missing |
| Tauri CLI | Build/dev Tauri apps | ❌ Missing (needs Rust first) |
| WebView2 | Tauri needs this on Windows | ✅ Usually pre-installed on Win 11 |
| Tesseract OCR | Parse images/scanned PDFs | ❌ Optional |

---

## Step 1 — Python 3.11

> You have Python 3.14 which is too new. ChromaDB and PyMuPDF don't have wheels for it yet.

### Download
🔗 https://www.python.org/downloads/release/python-3119/

Scroll to the bottom → click **"Windows installer (64-bit)"**

### Install
1. Run the downloaded `python-3.11.9-amd64.exe`
2. ✅ Check **"Add Python 3.11 to PATH"** at the bottom
3. Click **"Install Now"**

### Verify
Open a **new** terminal and run:
```
py -3.11 --version
```
Expected: `Python 3.11.9`

---

## Step 2 — Rust + Cargo

> Tauri (the desktop wrapper) is built in Rust. This is the biggest install.

### Download
🔗 https://rustup.rs

Click the big **"DOWNLOAD RUSTUP-INIT.EXE (64-BIT)"** button.

### Install
1. Run `rustup-init.exe`
2. When prompted, press **`1`** (default installation)
3. Wait ~5–10 minutes for it to download and compile
4. When done, it says **"Rust is installed now. Great!"**
5. **Close and reopen your terminal** (required — PATH needs to refresh)

### Verify
```
rustc --version
cargo --version
```
Expected output like:
```
rustc 1.78.0 (90b35a623 2024-05-08)
cargo 1.78.0 (...)
```

---

## Step 3 — Ollama

> Ollama runs AI models locally on your machine. No internet needed after setup.

### Download
🔗 https://ollama.com/download

Click **"Download for Windows"**

### Install
1. Run the downloaded `OllamaSetup.exe`
2. Click through the installer (Next → Install)
3. Ollama runs silently in the system tray after install

### Verify
Open a terminal:
```
ollama --version
```
Expected: `ollama version 0.x.x`

---

## Step 4 — Download the AI Model (qwen2.5:14b)

> This is the brain of Mimir. About **9 GB** — do this on good WiFi.

```
ollama pull qwen2.5:14b
```

This will show a progress bar. Takes 10–30 minutes depending on your connection.

### Verify
```
ollama list
```
You should see `qwen2.5:14b` in the list.

---

## Step 5 — Tauri CLI

> The command-line tool for building and running Tauri apps. Needs Rust (Step 2) done first.

```
cargo install tauri-cli
```

Takes ~5 minutes to compile. You'll see a lot of output — that's normal.

### Verify
```
cargo tauri --version
```
Expected: `tauri-cli 1.x.x`

---

## Step 6 — WebView2 (Windows 11 — probably already done)

> Tauri uses WebView2 to render the UI on Windows. Windows 11 ships with it pre-installed.

**Check if you already have it:**
Open `Settings → Apps → Installed apps` and search for **"WebView2"**.

If it's not there:
🔗 https://developer.microsoft.com/en-us/microsoft-edge/webview2/

Click **"Download"** under the Evergreen Bootstrapper section and run it.

---

## Step 7 — Project Dependencies

### 7a. Frontend (React + Vite)

Open a terminal and run:
```
cd "D:\Claude Code Projs\Mimir\frontend"
npm install
```

Takes ~1 minute. Creates a `node_modules` folder.

### 7b. Backend (FastAPI + ChromaDB + etc.)

```
cd "D:\Claude Code Projs\Mimir\backend"
py -3.11 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

What each line does:
- `py -3.11 -m venv .venv` — creates an isolated Python 3.11 environment
- `.venv\Scripts\activate` — activates it (you'll see `(.venv)` in your prompt)
- `pip install -r requirements.txt` — installs all backend packages (~3–5 minutes)

---

## Step 8 — Tesseract OCR (Optional)

> Only needed if you want to upload **photos of handwritten notes** or **scanned PDFs**.
> Regular PDFs work fine without this.

### Download
🔗 https://github.com/UB-Mannheim/tesseract/wiki

Click **"tesseract-ocr-w64-setup-5.x.x.exe"** (the 64-bit Windows installer)

### Install
1. Run the installer
2. On the **"Choose Components"** page, select your language (e.g. English)
3. ✅ On the **"Select Additional Tasks"** page, check **"Add to PATH"**
4. Finish the install

### Verify
Open a **new** terminal:
```
tesseract --version
```

---

## ✅ Final Verification Checklist

Run these one by one. Everything should return a version number, not an error:

```
py -3.11 --version          # Python 3.11.x
node --version               # v24.x.x  (already good)
rustc --version              # rustc 1.x.x
cargo --version              # cargo 1.x.x
ollama --version             # ollama version 0.x.x
ollama list                  # should show qwen2.5:14b
cargo tauri --version        # tauri-cli 1.x.x
```

---

## 🚀 Running Mimir (After Everything Is Installed)

Open **3 terminals** side by side:

**Terminal 1 — Backend**
```
cd "D:\Claude Code Projs\Mimir\backend"
.venv\Scripts\activate
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend**
```
cd "D:\Claude Code Projs\Mimir\frontend"
npm run dev
```

**Terminal 3 — Tauri (Desktop Window)**
```
cd "D:\Claude Code Projs\Mimir"
cargo tauri dev
```

The desktop app window opens automatically. 🎉

---

## ⏱ Total Time Estimate

| Step | Time |
|------|------|
| Python 3.11 install | ~2 min |
| Rust install | ~10 min |
| Ollama install | ~2 min |
| qwen2.5:14b download | ~15–30 min |
| Tauri CLI compile | ~5 min |
| npm install | ~1 min |
| pip install | ~3–5 min |
| **Total** | **~40–55 min** (mostly waiting on downloads) |

---

*The longest wait is the 9GB model download. Start that early and let it run in the background.*
