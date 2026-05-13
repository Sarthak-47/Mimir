/**
 * Mimir — Frontend runtime configuration.
 *
 * VITE_API_URL can be set in a .env file at the repo root:
 *   VITE_API_URL=http://localhost:8000
 *
 * Defaults to localhost:8000 for local development.
 * In a production Tauri build the backend runs on the same host.
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
