/**
 * FormulaSheetModal — auto-generated formula & definition reference sheet.
 *
 * Calls GET /api/formulas?subject_id={id} which retrieves all uploaded
 * document chunks for the subject, passes them to the local LLM, and returns
 * every formula and key definition found.
 *
 * Triggered by the ᛜ rune in the Sidebar profile strip.
 */
import { useState, useEffect } from "react";
import { API_FORMULAS } from "@/config";

interface FormulaEntry {
  name:    string;
  formula: string;
  notes:   string;
}

interface DefinitionEntry {
  term:       string;
  definition: string;
}

interface SheetData {
  formulas:    FormulaEntry[];
  definitions: DefinitionEntry[];
  chunks_used: number;
  empty:       boolean;
}

interface FormulaSheetModalProps {
  authToken:   string;
  subjectId:   string | null;
  subjectName: string | null;
  onClose:     () => void;
}

type Phase = "loading" | "result" | "error";

export default function FormulaSheetModal({
  authToken, subjectId, subjectName, onClose,
}: FormulaSheetModalProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [data,  setData]  = useState<SheetData | null>(null);
  const [error, setError] = useState("");
  const [tab,   setTab]   = useState<"formulas" | "definitions">("formulas");

  useEffect(() => {
    const url = subjectId
      ? `${API_FORMULAS}/?subject_id=${subjectId}`
      : `${API_FORMULAS}/`;

    fetch(url, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { detail?: string };
          throw new Error(body.detail ?? `Error ${res.status}`);
        }
        return res.json() as Promise<SheetData>;
      })
      .then((sheet) => {
        setData(sheet);
        // Default to the non-empty tab
        if (sheet.formulas.length === 0 && sheet.definitions.length > 0) {
          setTab("definitions");
        }
        setPhase("result");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Unknown error");
        setPhase("error");
      });
  }, [authToken, subjectId]);

  const title = subjectName
    ? `${subjectName} — Formula Sheet`
    : "Formula Sheet — All Subjects";

  return (
    <div
      style={S.backdrop}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={S.panel}>

        {/* ── Header ── */}
        <div style={S.header}>
          <span style={S.headerRune}>ᛜ</span>
          <span style={S.headerTitle}>{title}</span>
          <button style={S.closeBtn} onClick={onClose} title="Close">×</button>
        </div>
        <div style={S.engraving} />

        {/* ── Loading ── */}
        {phase === "loading" && (
          <div style={S.spinner}>
            <div style={S.spinnerRune}>ᛜ</div>
            <div style={S.spinnerText}>Extracting formulas from your scrolls…</div>
          </div>
        )}

        {/* ── Error ── */}
        {phase === "error" && (
          <div style={S.spinner}>
            <div style={{ ...S.spinnerRune, color: "#c87a7a" }}>ᚷ</div>
            <div style={{ ...S.spinnerText, color: "#c87a7a" }}>{error}</div>
          </div>
        )}

        {/* ── Result ── */}
        {phase === "result" && data && (
          <>
            {/* Empty state */}
            {data.empty ? (
              <div style={S.emptyState}>
                <div style={S.emptyRune}>ᚱ</div>
                <div style={S.emptyText}>
                  No scrolls indexed for this subject yet.
                </div>
                <div style={S.emptyHint}>
                  Upload a PDF or image via the SCROLL button to generate a formula sheet.
                </div>
              </div>
            ) : (
              <>
                {/* Tab bar */}
                <div style={S.tabBar}>
                  <button
                    style={{ ...S.tab, ...(tab === "formulas" ? S.tabActive : {}) }}
                    onClick={() => setTab("formulas")}
                  >
                    ᛜ Formulas
                    <span style={S.tabCount}>{data.formulas.length}</span>
                  </button>
                  <button
                    style={{ ...S.tab, ...(tab === "definitions" ? S.tabActive : {}) }}
                    onClick={() => setTab("definitions")}
                  >
                    ᚦ Definitions
                    <span style={S.tabCount}>{data.definitions.length}</span>
                  </button>
                  <span style={S.chunkBadge}>
                    {data.chunks_used} chunk{data.chunks_used !== 1 ? "s" : ""} read
                  </span>
                </div>

                {/* ── Formulas tab ── */}
                {tab === "formulas" && (
                  <div style={S.body}>
                    {data.formulas.length === 0 ? (
                      <div style={S.noItems}>
                        No formulas found in this subject's notes.
                        Try uploading notes that contain equations or laws.
                      </div>
                    ) : (
                      data.formulas.map((f, i) => (
                        <div key={i} style={S.formulaCard}>
                          <div style={S.formulaName}>{f.name}</div>
                          <div style={S.formulaEq}>{f.formula}</div>
                          {f.notes && (
                            <div style={S.formulaNotes}>{f.notes}</div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ── Definitions tab ── */}
                {tab === "definitions" && (
                  <div style={S.body}>
                    {data.definitions.length === 0 ? (
                      <div style={S.noItems}>
                        No definitions found in this subject's notes.
                      </div>
                    ) : (
                      data.definitions.map((d, i) => (
                        <div key={i} style={S.defRow}>
                          <span style={S.defTerm}>{d.term}</span>
                          <span style={S.defDivider}>—</span>
                          <span style={S.defText}>{d.definition}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Footer ── */}
        <div style={S.engraving} />
        <div style={S.footer}>
          <span style={S.footerHint}>
            {phase === "result" && !data?.empty
              ? "Generated from your uploaded notes — re-open to regenerate after new uploads."
              : ""}
          </span>
          <button style={S.closeFooterBtn} onClick={onClose}>Close</button>
        </div>

      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.65)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 200,
  },
  panel: {
    width: 600, maxWidth: "94vw", maxHeight: "90vh",
    background: "var(--stone-2)",
    border: "1px solid var(--gold-dim)",
    display: "flex", flexDirection: "column" as const,
    overflow: "hidden",
  },
  header: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "12px 16px",
    background: "var(--stone-3)",
    flexShrink: 0,
  },
  headerRune: {
    fontFamily: "var(--font-header)", fontSize: 20,
    color: "var(--gold-bright)", lineHeight: 1, flexShrink: 0,
  },
  headerTitle: {
    fontFamily: "var(--font-header)", fontSize: 11,
    letterSpacing: "0.14em", textTransform: "uppercase" as const,
    color: "var(--text-primary)", flex: 1,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
  },
  closeBtn: {
    background: "none", border: "none",
    color: "var(--text-dim)", fontFamily: "var(--font-header)",
    fontSize: 18, cursor: "pointer", padding: "0 0 0 8px",
    lineHeight: 1, flexShrink: 0,
  },
  engraving: {
    height: 1,
    background: "linear-gradient(90deg, transparent, var(--gold-dim) 40%, var(--gold-dim) 60%, transparent)",
    opacity: 0.4, flexShrink: 0,
  },

  // ── Spinner ──
  spinner: {
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center",
    gap: 12, padding: "48px 0", flex: 1,
  },
  spinnerRune: {
    fontFamily: "var(--font-header)", fontSize: 36,
    color: "var(--gold-dim)",
  },
  spinnerText: {
    fontFamily: "var(--font-body)", fontSize: 12,
    fontStyle: "italic", color: "var(--text-dim)",
  },

  // ── Empty state ──
  emptyState: {
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center",
    gap: 10, padding: "40px 24px", flex: 1,
  },
  emptyRune: {
    fontFamily: "var(--font-header)", fontSize: 32,
    color: "var(--green-dim)",
  },
  emptyText: {
    fontFamily: "var(--font-header)", fontSize: 12,
    letterSpacing: "0.1em", textTransform: "uppercase" as const,
    color: "var(--text-primary)", textAlign: "center" as const,
  },
  emptyHint: {
    fontFamily: "var(--font-body)", fontSize: 12,
    fontStyle: "italic", color: "var(--text-dim)",
    textAlign: "center" as const, lineHeight: 1.6, maxWidth: 340,
  },

  // ── Tabs ──
  tabBar: {
    display: "flex", alignItems: "center", gap: 0,
    borderBottom: "1px solid var(--green-dark)",
    flexShrink: 0, padding: "0 16px",
  },
  tab: {
    display: "flex", alignItems: "center", gap: 6,
    fontFamily: "var(--font-header)", fontSize: 10,
    letterSpacing: "0.12em", textTransform: "uppercase" as const,
    color: "var(--text-dim)",
    background: "none", border: "none",
    borderBottom: "2px solid transparent",
    padding: "9px 14px 7px",
    cursor: "pointer", transition: "all 0.12s",
  },
  tabActive: {
    color: "var(--gold-bright)",
    borderBottom: "2px solid var(--gold-bright)",
  },
  tabCount: {
    fontFamily: "var(--font-body)", fontSize: 10,
    color: "var(--text-dim)", fontStyle: "italic",
  },
  chunkBadge: {
    marginLeft: "auto",
    fontFamily: "var(--font-body)", fontSize: 10,
    fontStyle: "italic", color: "var(--text-dim)",
  },

  // ── Body (scrollable) ──
  body: {
    flex: 1, overflowY: "auto" as const,
    padding: "12px 16px",
    display: "flex", flexDirection: "column" as const, gap: 10,
  },
  noItems: {
    fontFamily: "var(--font-body)", fontSize: 12,
    fontStyle: "italic", color: "var(--text-dim)",
    padding: "24px 0", textAlign: "center" as const, lineHeight: 1.6,
  },

  // ── Formula cards ──
  formulaCard: {
    background: "var(--stone-3)",
    border: "1px solid var(--green-dark)",
    padding: "10px 14px",
    display: "flex", flexDirection: "column" as const, gap: 5,
  },
  formulaName: {
    fontFamily: "var(--font-header)", fontSize: 10,
    letterSpacing: "0.12em", textTransform: "uppercase" as const,
    color: "var(--gold-bright)",
  },
  formulaEq: {
    fontFamily: "monospace", fontSize: 15,
    color: "var(--green-bright)", lineHeight: 1.4,
    whiteSpace: "pre-wrap" as const,
  },
  formulaNotes: {
    fontFamily: "var(--font-body)", fontSize: 11,
    fontStyle: "italic", color: "var(--text-dim)", lineHeight: 1.5,
    borderTop: "1px solid var(--green-dark)", paddingTop: 5, marginTop: 2,
  },

  // ── Definition rows ──
  defRow: {
    display: "flex", alignItems: "baseline", gap: 8,
    borderBottom: "1px solid var(--stone-4)",
    padding: "7px 0",
  },
  defTerm: {
    fontFamily: "var(--font-header)", fontSize: 11,
    letterSpacing: "0.08em", color: "var(--gold-bright)",
    flexShrink: 0, minWidth: 120,
  },
  defDivider: {
    color: "var(--green-dark)", flexShrink: 0,
    fontFamily: "var(--font-body)", fontSize: 12,
  },
  defText: {
    fontFamily: "var(--font-body)", fontSize: 12,
    color: "var(--text-secondary)", lineHeight: 1.5, flex: 1,
  },

  // ── Footer ──
  footer: {
    display: "flex", justifyContent: "space-between",
    alignItems: "center", gap: 10,
    padding: "10px 16px", flexShrink: 0,
  },
  footerHint: {
    fontFamily: "var(--font-body)", fontSize: 10,
    fontStyle: "italic", color: "var(--text-dim)",
    flex: 1,
  },
  closeFooterBtn: {
    background: "none", border: "1px solid var(--green-dark)",
    color: "var(--text-dim)", fontFamily: "var(--font-header)",
    fontSize: 10, letterSpacing: "0.12em", cursor: "pointer",
    padding: "6px 14px", textTransform: "uppercase" as const,
  },
};
