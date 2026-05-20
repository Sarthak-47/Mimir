/**
 * UpdateNotice — Gold banner shown when a new Mimir release is available.
 *
 * Rendered by App.tsx when the Tauri updater plugin signals a pending update.
 * The `onInstall` callback triggers the actual download+install sequence.
 * While downloading, a progress bar (0–100) fills the bottom of the banner.
 *
 * @param version   - New version string, e.g. "0.3.1"
 * @param progress  - Download progress 0–100, or undefined when not downloading.
 * @param onInstall - Kick off the update download and install.
 * @param onDismiss - Hide the banner without installing.
 */
interface UpdateNoticeProps {
  version:    string;
  progress?:  number;        // undefined = idle, 0-100 = downloading
  onInstall:  () => void;
  onDismiss:  () => void;
}

export default function UpdateNotice({
  version, progress, onInstall, onDismiss,
}: UpdateNoticeProps) {
  const isDownloading = progress !== undefined;

  return (
    <div style={styles.wrap}>
      <div style={styles.banner}>
        {/* ── Left: rune + text ── */}
        <div style={styles.left}>
          <span style={styles.rune}>ᚨ</span>
          <div style={styles.text}>
            <span style={styles.title}>Mimir v{version} is ready</span>
            {isDownloading ? (
              <span style={styles.sub}>
                Downloading… {Math.round(progress!)}%
              </span>
            ) : (
              <span style={styles.sub}>
                Install and restart to receive new gifts from the well
              </span>
            )}
          </div>
        </div>

        {/* ── Right: action buttons ── */}
        <div style={styles.right}>
          {!isDownloading && (
            <button style={styles.installBtn} onClick={onInstall}>
              ᛟ &nbsp;Install
            </button>
          )}
          {!isDownloading && (
            <button style={styles.dismissBtn} onClick={onDismiss} title="Dismiss">
              ×
            </button>
          )}
        </div>
      </div>

      {/* ── Progress bar ── */}
      {isDownloading && (
        <div style={styles.progressTrack}>
          <div
            style={{
              ...styles.progressFill,
              width: `${Math.min(progress!, 100)}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    flexShrink: 0,
    background: "rgba(40, 30, 10, 0.8)",
    borderBottom: "1px solid var(--gold-dim)",
  },
  banner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "7px 16px",
    gap: 12,
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  rune: {
    fontFamily: "var(--font-header)",
    fontSize: 20,
    color: "var(--gold-bright)",
    flexShrink: 0,
    lineHeight: 1,
  },
  text: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 1,
  },
  title: {
    fontFamily: "var(--font-header)",
    fontSize: 11,
    letterSpacing: "0.14em",
    color: "var(--gold-bright)",
    textTransform: "uppercase" as const,
  },
  sub: {
    fontFamily: "var(--font-body)",
    fontSize: 11,
    fontStyle: "italic",
    color: "var(--gold-dim)",
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  installBtn: {
    background: "var(--stone-3)",
    border: "1px solid var(--gold-dim)",
    color: "var(--gold-bright)",
    fontFamily: "var(--font-header)",
    fontSize: 11,
    letterSpacing: "0.12em",
    cursor: "pointer",
    padding: "4px 12px",
    transition: "all 0.15s",
  },
  dismissBtn: {
    background: "none",
    border: "none",
    color: "var(--gold-dim)",
    fontFamily: "var(--font-header)",
    fontSize: 16,
    cursor: "pointer",
    padding: "0 0 0 4px",
    lineHeight: 1,
    transition: "color 0.15s",
  },
  progressTrack: {
    height: 2,
    background: "var(--stone-3)",
    width: "100%",
  },
  progressFill: {
    height: "100%",
    background: "var(--gold-bright)",
    transition: "width 0.3s ease",
  },
};
