/**
 * Mimir — Frontend runtime configuration.
 *
 * `VITE_API_URL` can be set in a `.env` file at the repo root:
 * ```
 * VITE_API_URL=http://localhost:8000
 * ```
 * Defaults to `http://localhost:8000` for local development.
 * In a production Tauri build the embedded FastAPI server listens on the same host.
 *
 * Exports:
 * - `API_BASE`    — base HTTP URL (e.g. `http://localhost:8000`)
 * - `WS_BASE`     — base WebSocket URL (scheme swapped to `ws://`)
 * - `API_USERS`   — auth endpoints prefix
 * - `API_PROGRESS`— progress/subjects/topics endpoints prefix
 * - `API_QUIZ`    — quiz generate/submit/history endpoints prefix
 * - `API_FILES`   — file upload/list/delete endpoints prefix
 * - `API_CHRONICLE` — conversation history endpoint prefix
 * - `WS_CHAT`     — full WebSocket chat URL
 */
const BASE = (import.meta.env.VITE_API_URL as string | undefined)
  ?? "http://localhost:8000";

export const API_BASE  = BASE;
export const WS_BASE   = BASE.replace(/^http/, "ws");

// Convenience sub-paths
export const API_USERS    = `${API_BASE}/api/users`;
export const API_PROGRESS = `${API_BASE}/api/progress`;
export const API_QUIZ     = `${API_BASE}/api/quiz`;
export const API_FILES    = `${API_BASE}/api/files`;
export const API_CHRONICLE= `${API_BASE}/api/chronicle`;
export const WS_CHAT      = `${WS_BASE}/ws/chat`;
