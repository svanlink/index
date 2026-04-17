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
  const eyebrowColor = eyebrowTone === "warning" ? "var(--color-warning)" : "var(--color-danger)";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: "var(--color-surface)" }}
    >
      <div className="app-panel w-full max-w-md space-y-4 px-6 py-6">
        <div className="space-y-1">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: eyebrowColor }}
          >
            {eyebrow}
          </p>
          <h1 className="text-[16px] font-semibold" style={{ color: "var(--color-text)" }}>
            {title}
          </h1>
        </div>

        <p className="text-[13px]" style={{ color: "var(--color-text-soft)" }}>
          {description}
        </p>

        {detail ? (
          <details
            className="rounded-md border px-3 py-2"
            style={{ borderColor: "var(--color-border)", background: "var(--color-surface-subtle)" }}
          >
            <summary
              className="cursor-pointer select-none text-[12px] font-medium"
              style={{ color: "var(--color-text-muted)" }}
            >
              Technical detail
            </summary>
            <pre
              className="mt-2 whitespace-pre-wrap break-all font-mono text-[11px] leading-snug"
              style={{ color: "var(--color-text-soft)" }}
            >
              {detail}
            </pre>
          </details>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div>
      </div>
    </div>
  );
}
