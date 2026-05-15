/**
 * @fileoverview Authentication gate: login / register form shown before the main UI.
 *
 * Provides two tab modes — "Drink from the Well" (login) and "Engrave your
 * Name" (register). Login uses `application/x-www-form-urlencoded` because
 * the backend uses FastAPI's `OAuth2PasswordRequestForm`. Registration uses
 * JSON. On success, the JWT and username are passed to `onAuthenticated`.
 */

import { useState } from "react";

import { API_USERS as API } from "@/config";

// ── Logo mark (reused from Sidebar) ─────────────────────────
function LogoMark() {
  return (
    <svg width="48" height="48" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 2 L34 18 L18 34 L2 18 Z" stroke="#c9a84c" strokeWidth="1" fill="none" />
      <line x1="18" y1="2"  x2="18" y2="6"  stroke="#c9a84c" strokeWidth="1" />
      <line x1="34" y1="18" x2="30" y2="18" stroke="#c9a84c" strokeWidth="1" />
      <line x1="18" y1="34" x2="18" y2="30" stroke="#c9a84c" strokeWidth="1" />
      <line x1="2"  y1="18" x2="6"  y2="18" stroke="#c9a84c" strokeWidth="1" />
      <path d="M10 18 Q18 11 26 18 Q18 25 10 18 Z" stroke="#c9a84c" strokeWidth="1" fill="none" />
      <circle cx="18" cy="18" r="3.5" stroke="#c9a84c" strokeWidth="1" fill="none" />
      <circle cx="18" cy="18" r="1.5" fill="#c9a84c" />
    </svg>
  );
}

interface AuthProps {
  onAuthenticated: (token: string, username: string) => void;
}

type Mode = "login" | "register";

/**
 * Full-screen login and registration form.
 *
 * @param onAuthenticated - Called with the JWT and username on successful auth.
 */
export default function Auth({ onAuthenticated }: AuthProps) {
  const [mode, setMode]         = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Both fields are required.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (mode === "register") {
        // Register
        const res = await fetch(`${API}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail ?? "Registration failed.");
          return;
        }
        onAuthenticated(data.access_token, username.trim());
      } else {
        // Login — OAuth2PasswordRequestForm expects form-encoded body
        const form = new URLSearchParams();
        form.append("username", username.trim());
        form.append("password", password);

        const res = await fetch(`${API}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail ?? "Invalid credentials.");
          return;
        }
        onAuthenticated(data.access_token, username.trim());
      }
    } catch {
      setError("Cannot reach the backend. Make sure it is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logoRow}>
          <LogoMark />
          <div>
            <div style={styles.logoName}>MIMIR</div>
            <div style={styles.logoSub}>The Well of Knowledge</div>
          </div>
        </div>

        <div style={styles.engraving} />

        {/* Mode tabs */}
        <div style={styles.tabs}>
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
              style={{ ...styles.tab, ...(mode === m ? styles.tabActive : {}) }}
              onClick={() => { setMode(m); setError(""); }}
            >
              {m === "login" ? "Drink from the Well" : "Engrave your Name"}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>NAME OF THE SEEKER</label>
            <input
              style={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your name..."
              autoComplete="username"
              autoFocus
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>PASSPHRASE</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your passphrase..."
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button style={styles.submitBtn} type="submit" disabled={loading}>
            {loading
              ? "Consulting the runes…"
              : mode === "login"
              ? "Enter the Well"
              : "Forge your Path"}
          </button>
        </form>

        <div style={styles.engraving} />
        <div style={styles.footer}>
          All knowledge is stored locally. Nothing leaves your machine.
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "var(--stone-0)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  card: {
    width: 360,
    background: "var(--stone-2)",
    border: "1px solid var(--green-dark)",
    padding: "28px 28px 20px",
    position: "relative",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
  },
  logoName: {
    fontFamily: "var(--font-header)",
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: "0.22em",
    color: "var(--gold-bright)",
  },
  logoSub: {
    fontFamily: "var(--font-body)",
    fontSize: 11,
    fontStyle: "italic",
    color: "var(--text-dim)",
    marginTop: 2,
  },
  engraving: {
    height: 1,
    background: "linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent)",
    opacity: 0.4,
    margin: "12px 0",
  },
  tabs: {
    display: "flex",
    gap: 0,
    marginBottom: 18,
  },
  tab: {
    flex: 1,
    padding: "7px 10px",
    background: "var(--stone-1)",
    border: "1px solid var(--green-dark)",
    fontFamily: "var(--font-header)",
    fontSize: 8,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "var(--text-dim)",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  tabActive: {
    background: "var(--stone-3)",
    borderColor: "var(--green)",
    color: "var(--text-primary)",
    borderBottom: "2px solid var(--green-bright)",
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 5,
  },
  label: {
    fontFamily: "var(--font-header)",
    fontSize: 7,
    letterSpacing: "0.16em",
    color: "var(--text-dim)",
    textTransform: "uppercase" as const,
  },
  input: {
    background: "var(--stone-1)",
    border: "1px solid var(--green-dark)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    padding: "8px 10px",
    outline: "none",
    width: "100%",
  },
  error: {
    fontFamily: "var(--font-body)",
    fontSize: 11,
    color: "#c87a7a",
    fontStyle: "italic",
    padding: "5px 8px",
    background: "rgba(138,58,58,0.1)",
    border: "1px solid #5a2020",
  },
  submitBtn: {
    padding: "10px",
    background: "var(--green-dark)",
    border: "1px solid var(--green)",
    color: "var(--green-bright)",
    fontFamily: "var(--font-header)",
    fontSize: 9,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    cursor: "pointer",
    marginTop: 4,
    transition: "all 0.15s",
  },
  footer: {
    fontFamily: "var(--font-body)",
    fontSize: 9,
    fontStyle: "italic",
    color: "var(--text-dim)",
    textAlign: "center" as const,
  },
};
