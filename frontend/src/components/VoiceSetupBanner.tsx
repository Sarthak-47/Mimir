/**
 * VoiceSetupBanner — first-run model download progress bar.
 *
 * Polls GET /api/voice/status every 3 s while either model is not yet ready.
 * Disappears permanently once both whisper and kokoro are in "ready" state.
 * Persists across page navigation (rendered at App root level, above main).
 *
 * States
 * ------
 * - downloading: animated progress bar + descriptive label
 * - error:       red banner with the error message
 * - ready:       self-dismisses (does not render)
 */

import { useEffect, useState, useCallback } from "react";
import { API_VOICE } from "@/config";

interface VoiceStatus {
  whisper:  string;
  kokoro:   string;
  progress: number;
  error:    string | null;
}

interface VoiceSetupBannerProps {
  authToken: string;
  /** Called once both models are ready so the parent can enable voice UI. */
  onReady?: () => void;
}

export default function VoiceSetupBanner({ authToken, onReady }: VoiceSetupBannerProps) {
  const [status,   setStatus]   = useState<VoiceStatus | null>(null);
  const [visible,  setVisible]  = useState(true);
  const [notified, setNotified] = useState(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${API_VOICE}/status`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) setStatus(await res.json() as VoiceStatus);
    } catch { /* backend not yet up */ }
  }, [authToken]);

  useEffect(() => {
    poll();                              // immediate first check
    const id = setInterval(poll, 3000); // then every 3 s
    return () => clearInterval(id);
  }, [poll]);

  // Fire onReady and hide banner once both models are ready
  useEffect(() => {
    if (!status) return;
    const bothReady = status.whisper === "ready" && status.kokoro === "ready";
    if (bothReady && !notified) {
      setNotified(true);
      onReady?.();
      // Short delay so the user sees the "ready" state before it disappears
      setTimeout(() => setVisible(false), 1500);
    }
  }, [status, notified, onReady]);

  // Don't render if dismissed or not yet fetched
  if (!visible || !status) return null;

  // Both already ready on first poll — no need to show banner at all
  if (status.whisper === "ready" && status.kokoro === "ready") return null;

  // ── Derive display state ──────────────────────────────────────────────────

  const hasError = status.whisper === "error" || status.kokoro === "error";
  const bothReady = status.whisper === "ready" && status.kokoro === "ready";

  let label: string;
  if (hasError) {
    label = `Voice setup error: ${status.error ?? "unknown"}`;
  } else if (bothReady) {
    label = "ᛗ Voice ready";
  } else if (status.whisper === "downloading" || status.kokoro === "downloading") {
    const which = status.whisper !== "ready" ? "speech recognition" : "voice synthesis";
    label = `Summoning voice — downloading ${which} model… (one-time, ~600 MB total)`;
  } else {
    label = "ᛗ Preparing voice models…";
  }

  // Rough combined progress: 50% whisper + 50% kokoro
  const whisperPct = status.whisper === "ready" ? 100 : status.progress;
  const kokoroPct  = status.kokoro  === "ready" ? 100 : status.progress;
  const combined   = Math.round((whisperPct + kokoroPct) / 2);

  return (
    <div style={{
      ...S.banner,
      background: hasError ? "rgba(120,40,40,0.85)" : "rgba(20,44,28,0.92)",
      borderColor: hasError ? "#8a3a3a" : "var(--gold-dark)",
    }}>
      {/* Label */}
      <span style={S.label}>{label}</span>

      {/* Progress bar — hidden on error */}
      {!hasError && !bothReady && (
        <div style={S.barTrack}>
          <div style={{ ...S.barFill, width: `${combined}%` }} />
        </div>
      )}

      {/* Pct */}
      {!hasError && !bothReady && (
        <span style={S.pct}>{combined}%</span>
      )}

      {/* Dismiss */}
      <button style={S.dismiss} onClick={() => setVisible(false)} title="Dismiss">
        ✕
      </button>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 14px",
    borderBottom: "1px solid var(--gold-dark)",
    flexShrink: 0,
    zIndex: 50,
  },
  label: {
    fontFamily: "var(--font-header)",
    fontSize: 10,
    letterSpacing: "0.1em",
    color: "var(--gold-dim)",
    flex: 1,
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  barTrack: {
    width: 140,
    height: 3,
    background: "var(--stone-4)",
    flexShrink: 0,
    borderRadius: 2,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    background: "var(--gold-dim)",
    transition: "width 0.4s ease",
    borderRadius: 2,
  },
  pct: {
    fontFamily: "var(--font-header)",
    fontSize: 9,
    letterSpacing: "0.1em",
    color: "var(--text-dim)",
    flexShrink: 0,
    minWidth: 30,
  },
  dismiss: {
    background: "none",
    border: "none",
    color: "var(--text-dim)",
    cursor: "pointer",
    fontSize: 11,
    padding: "0 0 0 4px",
    lineHeight: 1,
    flexShrink: 0,
  },
};
