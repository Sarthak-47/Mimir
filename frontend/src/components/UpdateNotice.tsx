/**
 * UpdateNotice — lightweight in-app update banner.
 *
 * On mount, calls the Tauri updater plugin to check whether a new version
 * is available at the configured endpoint. If so, renders a gold banner with
 * a "Download and install" button. The user must click to start the download;
 * once complete the app relaunches automatically.
 *
 * This component is a no-op when:
 *   - running outside Tauri (browser / dev server)
 *   - no update is found
 *   - the updater plugin throws (unsigned build, no internet, etc.)
 *
 * The check runs once per app session. There is no polling.
 */

import { useState, useEffect } from "react";

interface UpdateState {
  version:        string;
  releaseNotes:   string | null | undefined;
  downloading:    boolean;
  downloadPct:    number;    // 0–100
}

export default function UpdateNotice() {
  const [update,     setUpdate]     = useState<UpdateState | null>(null);
  const [dismissed,  setDismissed]  = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Lazy-import the Tauri plugins so the component tree doesn't break in
  // browser mode where these modules throw on import.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { check }    = await import("@tauri-apps/plugin-updater");
        const available    = await check();
        if (!cancelled && available) {
          setUpdate({
            version:       available.version,
            releaseNotes:  available.body,
            downloading:   false,
            downloadPct:   0,
          });
        }
      } catch {
        // Not inside Tauri, or updater not configured — silently skip.
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (!update || dismissed) return null;

  const handleInstall = async () => {
    if (!update) return;
    setUpdate((u) => u ? { ...u, downloading: true } : null);
    setInstalling(true);
    setError(null);
    try {
      const { check }    = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      const available    = await check();
      if (!available) return;

      await available.downloadAndInstall((progress) => {
        if (progress.event === "Progress" && progress.data?.chunkLength) {
          // We don't always have total length, so just show an indeterminate state
          setUpdate((u) => u ? { ...u, downloadPct: Math.min(u.downloadPct + 5, 95) } : null);
        } else if (progress.event === "Finished") {
          setUpdate((u) => u ? { ...u, downloadPct: 100 } : null);
        }
      });

      await relaunch();
    } catch (e) {
      setError(`Update failed: ${e}`);
      setInstalling(false);
      setUpdate((u) => u ? { ...u, downloading: false } : null);
    }
  };

  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      gap:            16,
      padding:        "7px 16px",
      background:     "var(--stone-4)",
      borderBottom:   "1px solid var(--gold)",
      flexShrink:     0,
    }}>
      {/* Left — version info */}
      <span style={{
        fontFamily:    "var(--font-header)",
        fontSize:      11,
        letterSpacing: "0.1em",
        color:         "var(--gold-bright)",
      }}>
        ᚠ &nbsp; Mimir {update.version} is available
        {update.releaseNotes && (
          <span style={{ color: "var(--gold-dim)", marginLeft: 8, fontFamily: "var(--font-body)", fontSize: 11 }}>
            — {update.releaseNotes.split("\n")[0]?.slice(0, 60)}
          </span>
        )}
      </span>

      {/* Right — actions */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        {error && (
          <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--gold-dim)" }}>
            {error}
          </span>
        )}

        {update.downloading ? (
          <span style={{
            fontFamily:    "var(--font-header)",
            fontSize:      10,
            letterSpacing: "0.1em",
            color:         "var(--gold-dim)",
          }}>
            {update.downloadPct < 100 ? `Downloading… ${update.downloadPct}%` : "Installing…"}
          </span>
        ) : (
          <button
            onClick={handleInstall}
            disabled={installing}
            style={{
              fontFamily:    "var(--font-header)",
              fontSize:      10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding:       "4px 12px",
              background:    "var(--stone-5)",
              border:        "1px solid var(--gold-dim)",
              color:         "var(--gold-bright)",
              cursor:        "pointer",
            }}
          >
            Install update
          </button>
        )}

        {!update.downloading && (
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: "none",
              border:     "none",
              color:      "var(--gold-dim)",
              fontSize:   13,
              cursor:     "pointer",
              lineHeight: 1,
              padding:    "0 0 0 4px",
            }}
          >×</button>
        )}
      </div>
    </div>
  );
}
