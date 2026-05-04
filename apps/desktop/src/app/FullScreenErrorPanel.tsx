import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// FullScreenErrorPanel
// ---------------------------------------------------------------------------
//
// Reusable full-screen error surface shared by:
//   - ErrorBoundary (render-phase crashes)
//   - AppProviders (startup boot failures — SQLite open, migration, etc.)
//   - Future fatal surfaces where the entire app cannot proceed.
//
// Product rules encoded by this primitive:
//   1. Empty state and failed state must never share the same visual result —
//      this panel always renders the failure framing (eyebrow + title + detail)
//      so the user never confuses "no data yet" with "load failed".
//   2. Raw technical detail is available but tucked into a <details> block so
//      the user is not confronted with a stack trace first.
//   3. The actions slot is caller-owned — the caller decides whether the
//      primary action is Retry, Reset, Reload, or something else.
//
// Accessibility:
//   - The root uses role="alert" + aria-live="assertive" so screen readers
//     announce the failure immediately when it appears.
// ---------------------------------------------------------------------------

export interface FullScreenErrorPanelProps {
  /** Short category label rendered above the title (e.g. "Startup failed"). */
  eyebrow: string;
  /** Tone for the eyebrow color. Defaults to danger. */
  eyebrowTone?: "danger" | "warning";
  /** Primary heading — what failed, in plain language. Rendered as <h1>. */
  title: string;
  /** One-sentence human explanation. Distinguishes this from an empty state. */
  description: string;
  /**
   * Optional raw error detail. Rendered inside a collapsed <details> block so
   * the UI stays calm by default but diagnostic detail is one click away.
   */
  detail?: string | null;
  /** Action buttons — caller provides primary/secondary actions. */
  actions: ReactNode;
}

export function FullScreenErrorPanel({
  eyebrow,
  eyebrowTone = "danger",
  title,
  description,
  detail,
  actions
}: FullScreenErrorPanelProps) {
  const eyebrowColor = eyebrowTone === "warning" ? "var(--warn)" : "var(--danger)";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-center justify-center"
      style={{ minHeight: "100vh", padding: 24, background: "var(--canvas)" }}
    >
      <div className="app-panel w-full flex flex-col" style={{ maxWidth: 448, gap: 16, padding: 24 }}>
        <div className="flex flex-col" style={{ gap: 4 }}>
          <p
            style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: eyebrowColor }}
          >
            {eyebrow}
          </p>
          <h1 className="font-semibold" style={{ fontSize: 16, color: "var(--ink)" }}>
            {title}
          </h1>
        </div>

        <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
          {description}
        </p>

        {detail ? (
          <details
            style={{ borderRadius: 6, border: "1px solid var(--hairline)", background: "var(--surface-inset)", padding: "8px 12px" }}
          >
            <summary
              className="cursor-pointer select-none font-medium"
              style={{ fontSize: 12, color: "var(--ink-2)" }}
            >
              Technical detail
            </summary>
            <pre
              style={{ marginTop: 8, whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.35, color: "var(--ink-3)" }}
            >
              {detail}
            </pre>
          </details>
        ) : null}

        <div className="flex flex-wrap items-center" style={{ gap: 8, paddingTop: 4 }}>{actions}</div>
      </div>
    </div>
  );
}
