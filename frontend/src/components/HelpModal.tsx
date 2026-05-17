/**
 * HelpModal — Norse-themed help overlay explaining all tabs, buttons, and modes.
 *
 * Triggered by the ? button in Topbar. Covers:
 *   Tabs, InputZone buttons, Teaching Modes, Keyboard Shortcuts, Diagram
 *   Understanding, and Interactive Tutor Sessions.
 */

interface HelpModalProps {
  onClose: () => void;
}

export default function HelpModal({ onClose }: HelpModalProps) {
  return (
    <div style={styles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.headerRune}>ᚱ</span>
          <span style={styles.headerTitle}>The Runes — A Guide to Mimir</span>
          <button style={styles.closeBtn} onClick={onClose} title="Close">×</button>
        </div>

        <div style={styles.body}>

          {/* Tabs */}
          <Section rune="ᛟ" title="The Five Halls">
            <Row rune="ᚢ" name="ORACLE"    desc="The main chat — ask Mimir anything. Your conversation history persists across sessions." />
            <Row rune="ᛏ" name="TRIALS"    desc="Take quizzes on any discipline and track your score over time." />
            <Row rune="ᚾ" name="RECKONING" desc="See your exam countdown, Ebbinghaus-decayed readiness for each topic, and your 7-day study plan." />
            <Row rune="ᛊ" name="CHRONICLE" desc="Review your full conversation history and past quiz sessions." />
            <Row rune="ᚠ" name="SCROLLS"   desc="Upload and manage PDFs and images. Mimir indexes them for semantic search." />
          </Section>

          {/* InputZone buttons */}
          <Section rune="ᚲ" title="Oracle Input Buttons">
            <Row rune="ᛋ" name="SCROLL"  desc="Upload a PDF or image. Mimir will summarise it and make it searchable." />
            <Row rune="ᛚ" name="LESSON"  desc="Start a structured 5-stage tutor session on any topic of your choice." />
            <Row rune="ᛏ" name="TRIAL"   desc="Trigger a quiz on the currently active discipline." />
            <Row rune="ᚠ" name="RUNES"   desc="Generate a set of flashcards for the active discipline." />
            <Row rune="ᚾ" name="FATES"   desc="Build a personalised day-by-day revision schedule." />
          </Section>

          {/* Teaching modes */}
          <Section rune="ᛞ" title="Teaching Modes">
            <Row rune="ᛞ" name="DEEP  (ᛞ)"  desc="Professor-style thorough explanations with checkpoint questions." />
            <Row rune="ᛊ" name="SWIFT (ᛊ)"  desc="Brief, direct answers — two to four sentences for simple questions." />
            <Row rune="ᚱ" name="BASIC (ᚱ)"  desc="Simplified analogies, no assumed prior knowledge, one idea at a time." />
            <Row rune="ᛏ" name="EXAM  (ᛏ)"  desc="High-yield content, classic mistakes, boundary conditions, exam tips." />
            <Row rune="ᚲ" name="CODE  (ᚲ)"  desc="Implementation-focused — logic, patterns, bugs, edge cases in prose." />
            <Row rune="ᛜ" name="MATH  (ᛜ)"  desc="Step-by-step derivations from first principles with full LaTeX." />
            <Row rune="ᛝ" name="SOKR  (ᛝ)"  desc="Socratic mode — guiding questions only, you reason toward the answer." />
            <p style={styles.hint}>Click the mode button in the input bar to cycle through modes.</p>
          </Section>

          {/* Tutor sessions */}
          <Section rune="ᛚ" title="Interactive Tutor Sessions">
            <p style={styles.para}>Click LESSON in the input bar, type a topic, and press Begin. Mimir leads you through five stages:</p>
            <Row rune="ᚢ" name="THE SUMMONING"   desc="Mimir greets you and asks what you already know." />
            <Row rune="ᛞ" name="THE WISDOM"      desc="Core explanation — analogy, mechanics, worked example." />
            <Row rune="ᚾ" name="TRIAL OF WORDS"  desc="One open question to verify genuine understanding." />
            <Row rune="ᛏ" name="TRIAL OF BLADES" desc="Three multiple-choice questions — the quiz." />
            <Row rune="ᛟ" name="THE SAGA"        desc="Debrief — score review, key takeaway, closing encouragement." />
            <p style={styles.hint}>The progress chain appears above the chat. Dismiss it with × to end the session early.</p>
          </Section>

          {/* Diagram understanding */}
          <Section rune="ᛋ" title="Diagram Understanding">
            <p style={styles.para}>
              Paste an image from your clipboard (Ctrl+V in the message box) or drag-and-drop an image file onto the input area. Up to 3 images can be attached per message. Mimir will describe and analyse them using a vision model before answering.
            </p>
          </Section>

          {/* Disciplines sidebar */}
          <Section rune="ᚠ" title="Disciplines (Sidebar)">
            <p style={styles.para}>
              Add a discipline (subject) in the left sidebar. Select it to focus the chat context — Mimir will draw on topic scores and uploaded files for that subject. Use the trash icon to delete a discipline.
            </p>
          </Section>

          {/* Keyboard shortcuts */}
          <Section rune="ᛗ" title="Keyboard Shortcuts">
            <Row rune="⌨" name="Enter"            desc="Send the current message." />
            <Row rune="⌨" name="Shift + Enter"    desc="Insert a newline without sending." />
            <Row rune="⌨" name="Ctrl + K"         desc="Open the command palette — quick access to all views and actions." />
            <Row rune="⌨" name="Ctrl + V"         desc="Paste an image directly into the message box." />
          </Section>

        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function Section({ rune, title, children }: { rune: string; title: string; children: React.ReactNode }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <span style={styles.sectionRune}>{rune}</span>
        <span style={styles.sectionTitle}>{title}</span>
      </div>
      <div style={styles.sectionBody}>{children}</div>
    </div>
  );
}

function Row({ rune, name, desc }: { rune: string; name: string; desc: string }) {
  return (
    <div style={styles.row}>
      <span style={styles.rowRune}>{rune}</span>
      <span style={styles.rowName}>{name}</span>
      <span style={styles.rowDesc}>{desc}</span>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.65)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 200,
  },
  panel: {
    width: "min(680px, 94vw)",
    maxHeight: "88vh",
    background: "var(--stone-2)",
    border: "1px solid var(--gold-dim)",
    display: "flex", flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 16px",
    background: "var(--stone-3)",
    borderBottom: "1px solid var(--gold-dim)",
    flexShrink: 0,
  },
  headerRune: {
    fontFamily: "var(--font-header)", fontSize: 18, color: "var(--gold)",
  },
  headerTitle: {
    fontFamily: "var(--font-header)", fontSize: 12, letterSpacing: "0.14em",
    color: "var(--gold-bright)", textTransform: "uppercase" as const, flex: 1,
  },
  closeBtn: {
    background: "none", border: "none",
    color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 18,
    cursor: "pointer", lineHeight: 1, padding: 0,
  },
  body: {
    overflowY: "auto" as const,
    padding: "12px 16px 20px",
    display: "flex", flexDirection: "column" as const, gap: 16,
  },
  section: {
    borderLeft: "2px solid var(--green-dark)", paddingLeft: 12,
  },
  sectionHeader: {
    display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
  },
  sectionRune: {
    fontFamily: "var(--font-header)", fontSize: 14, color: "var(--green)",
  },
  sectionTitle: {
    fontFamily: "var(--font-header)", fontSize: 11, letterSpacing: "0.13em",
    color: "var(--text-secondary)", textTransform: "uppercase" as const,
  },
  sectionBody: {
    display: "flex", flexDirection: "column" as const, gap: 4,
  },
  row: {
    display: "flex", alignItems: "baseline", gap: 8,
  },
  rowRune: {
    fontFamily: "var(--font-header)", fontSize: 13, color: "var(--gold-dim)",
    width: 16, flexShrink: 0,
  },
  rowName: {
    fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.1em",
    color: "var(--green-bright)", width: 130, flexShrink: 0,
  },
  rowDesc: {
    fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)",
    lineHeight: 1.4,
  },
  para: {
    fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-secondary)",
    lineHeight: 1.5, margin: "2px 0 6px",
  },
  hint: {
    fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-dim)",
    fontStyle: "italic", margin: "4px 0 0",
  },
};
