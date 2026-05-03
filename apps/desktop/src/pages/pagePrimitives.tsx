import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "@drive-project-catalog/ui";
import { useFocusTrap } from "../app/useFocusTrap";

// ---------------------------------------------------------------------------
// SectionCard — DESIGN.md §6
// ---------------------------------------------------------------------------
// Flat `.card` surface with a hairline under the title row when a description
// or action is present. No tinted header, no color-mix wash. Title uses
// card-title weight in a conservative 16px on the list pages so it doesn't
// overwhelm the content inside.
// ---------------------------------------------------------------------------

interface SectionCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}

export function SectionCard({ title, description, children, action }: SectionCardProps) {
  const hasHeaderDivider = Boolean(description || action);
  return (
    <section className="card" style={{ overflow: "hidden" }}>
      <div
        className="flex items-start justify-between"
        style={{
          gap: 16,
          padding: "16px 20px",
          borderBottom: hasHeaderDivider ? "1px solid var(--hairline)" : "none"
        }}
      >
        <div className="min-w-0">
          <h4
            style={{
              color: "var(--ink)",
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "-0.01em"
            }}
          >
            {title}
          </h4>
          {description ? (
            <p
              style={{
                color: "var(--ink-3)",
                margin: "4px 0 0",
                fontSize: 14,
                lineHeight: 1.5,
                maxWidth: "62ch"
              }}
            >
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div style={{ padding: "16px 20px" }}>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge — uses shared .chip classes from globals.css (DESIGN.md §6).
// ---------------------------------------------------------------------------

type BadgeTone = "danger" | "warn" | "accent" | "ok" | "info" | "neutral" | "muted";

const TONE_CLASS: Record<BadgeTone, string> = {
  danger: "chip chip-danger",
  warn: "chip chip-warn",
  accent: "chip chip-accent",
  ok: "chip chip-ok",
  info: "chip chip-info",
  neutral: "chip",
  muted: "chip chip-ghost"
};

const LABEL_TONE: Record<string, BadgeTone> = {
  Missing: "danger",
  Failed: "danger",
  Interrupted: "danger",
  Overcommitted: "danger",
  Duplicate: "warn",
  "Move pending": "warn",
  Cancelled: "warn",
  "Near capacity": "warn",
  Running: "accent",
  Mounting: "accent",
  "Pending size": "accent",
  "Unknown size impact": "accent",
  "Personal project": "accent",
  Completed: "neutral",
  "Size ready": "neutral",
  Healthy: "ok",
  Online: "ok",
  Client: "ok",
  "Unknown impact": "info",
  Unassigned: "info",
  "Personal folder": "muted",
  Offline: "muted"
};

const LABEL_SHOWS_DOT: Record<string, boolean> = {
  Missing: true,
  Duplicate: true,
  "Move pending": true,
  Unassigned: true,
  Overcommitted: true,
  "Near capacity": true,
  Running: true,
  Mounting: true,
  Online: true,
  Healthy: true
};

export function StatusBadge({ label }: { label: string }) {
  const tone = LABEL_TONE[label] ?? "neutral";
  const showDot = LABEL_SHOWS_DOT[label] ?? false;
  return (
    <span className={TONE_CLASS[tone]}>
      {showDot ? <span className="chip-dot" /> : null}
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EmptyState — flat surface, hairline border. DESIGN.md §7 "hairlines not
// shadows". No gradient, no decorative tint.
// ---------------------------------------------------------------------------

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-xl)",
        padding: "24px 20px"
      }}
    >
      <p style={{ color: "var(--ink)", margin: 0, fontSize: 14, fontWeight: 600 }}>{title}</p>
      <p style={{ color: "var(--ink-3)", margin: "4px 0 0", fontSize: 14, lineHeight: 1.5 }}>
        {description}
      </p>
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="text-center" style={{ padding: "24px 0" }}>
      <p style={{ color: "var(--ink-3)", margin: 0, fontSize: 14 }}>{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loaders — hairline bounded, no decorative tint.
// ---------------------------------------------------------------------------

export function DriveCardSkeleton() {
  return (
    <div className="card flex flex-col" style={{ padding: 0 }} aria-hidden="true">
      <div style={{ padding: "16px 16px 12px" }}>
        <div className="skeleton" style={{ height: 14, width: "66%", borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 10, width: "33%", borderRadius: 4, marginTop: 8 }} />
        <div className="skeleton" style={{ height: 10, width: "50%", borderRadius: 4, marginTop: 8 }} />
      </div>
      <div style={{ padding: "0 16px 12px" }}>
        <div className="skeleton" style={{ height: 6, width: "100%", borderRadius: 9999 }} />
        <div className="flex" style={{ gap: 16, marginTop: 8 }}>
          <div className="skeleton" style={{ height: 8, width: 64, borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 8, width: 64, borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 8, width: 48, borderRadius: 4 }} />
        </div>
      </div>
      <div
        className="flex"
        style={{ gap: 12, borderTop: "1px solid var(--hairline)", padding: "10px 16px" }}
      >
        <div className="skeleton" style={{ height: 12, width: 32, borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 12, width: 48, borderRadius: 4 }} />
      </div>
    </div>
  );
}

export function ProjectRowSkeleton() {
  return (
    <div
      className="flex items-center"
      style={{ gap: 12, borderBottom: "1px solid var(--hairline)", padding: "10px 12px" }}
      aria-hidden="true"
    >
      <div className="skeleton shrink-0" style={{ height: 14, width: 14, borderRadius: 4 }} />
      <div className="skeleton shrink-0" style={{ height: 10, width: 64, borderRadius: 4 }} />
      <div className="skeleton shrink-0" style={{ height: 10, width: 96, borderRadius: 4 }} />
      <div className="skeleton flex-1" style={{ height: 10, borderRadius: 4 }} />
      <div className="skeleton shrink-0" style={{ height: 10, width: 80, borderRadius: 4 }} />
      <div className="skeleton shrink-0" style={{ height: 10, width: 64, borderRadius: 4 }} />
      <div className="skeleton shrink-0" style={{ height: 10, width: 56, borderRadius: 4 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfirmModal — DESIGN.md §6
// ---------------------------------------------------------------------------
// The only dark surface in the app. Graphite (#1d1d1f), white text, hero
// display title (56/600) — the single place hero-display lives. Destructive
// variants use .btn-danger; non-destructive fall back to .btn-primary but
// keep the graphite shell because that's how the modal is visually coded.
// ---------------------------------------------------------------------------

interface ConfirmModalProps {
  title: string;
  description: string;
  /**
   * Short irreversibility note shown below the description in a distinct
   * treatment — e.g. "This cannot be undone." Keeps descriptions focused
   * on what will change rather than the permanence caveat.
   */
  consequence?: string;
  confirmLabel?: string;
  onConfirm(): void;
  onCancel(): void;
  isDestructive?: boolean;
  isLoading?: boolean;
}

export function ConfirmModal({
  title,
  description,
  consequence,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
  isDestructive = true,
  isLoading = false
}: ConfirmModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  // Focus containment: Tab cycles within the dialog; focus restores on unmount.
  // useFocusTrap focuses the first focusable child on mount — which is the
  // Cancel button because we list it first in the DOM.
  useFocusTrap(dialogRef);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Escape dismisses. Enter is intentionally NOT wired to onConfirm here:
      // this is a destructive modal, so the user must explicitly click/activate
      // the Confirm button. Native button keyboard activation (Enter/Space on
      // the focused button) already works without interception.
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    const dialog = dialogRef.current;
    dialog?.addEventListener("keydown", handleKeyDown);
    return () => dialog?.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(29, 29, 31, 0.48)", padding: 16 }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        style={{
          width: "100%",
          maxWidth: 480,
          borderRadius: 12,
          background: "var(--graphite)",
          color: "#ffffff",
          padding: 40,
          boxShadow: "0 24px 56px rgba(0, 0, 0, 0.32)"
        }}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby={
          consequence
            ? "confirm-modal-desc confirm-modal-consequence"
            : "confirm-modal-desc"
        }
        tabIndex={-1}
      >
        <h3
          id="confirm-modal-title"
          style={{
            margin: 0,
            fontSize: 28,
            fontWeight: 600,
            lineHeight: 1.15,
            letterSpacing: "-0.015em",
            color: "#ffffff"
          }}
        >
          {title}
        </h3>
        <p
          id="confirm-modal-desc"
          style={{
            margin: "14px 0 0",
            fontSize: 15,
            lineHeight: 1.5,
            color: "rgba(255, 255, 255, 0.78)"
          }}
        >
          {description}
        </p>
        {consequence ? (
          <p
            id="confirm-modal-consequence"
            style={{
              margin: "10px 0 0",
              fontSize: 13,
              lineHeight: 1.4,
              color: isDestructive ? "rgba(255, 120, 80, 0.9)" : "rgba(255, 255, 255, 0.5)"
            }}
          >
            {consequence}
          </p>
        ) : null}
        <div className="flex justify-end" style={{ gap: 8, marginTop: 32 }}>
          {/* Cancel listed first in DOM so useFocusTrap focuses it on open —
              safer default for destructive confirmations. */}
          <button
            ref={cancelButtonRef}
            type="button"
            className="btn"
            onClick={onCancel}
            disabled={isLoading}
            style={{
              background: "transparent",
              borderColor: "rgba(255, 255, 255, 0.22)",
              color: "#ffffff"
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className={isDestructive ? "btn btn-danger" : "btn btn-primary"}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CapacityBar — DESIGN.md §6
// ---------------------------------------------------------------------------
// 6px track, fills with ink / warn (80-95%) / danger (>95%). Never blue.
// Uses the canonical `.cap-bar` / `.cap-used[data-level]` classes from
// globals.css so the level→color mapping stays in one place.
// ---------------------------------------------------------------------------

interface CapacityBarProps {
  usedBytes: number | null;
  totalBytes: number | null;
  reservedBytes?: number;
  overcommitted?: boolean;
  /**
   * Visual weight. Defaults to "md" (the canonical 6px). "lg" is 8px and
   * accepted for back-compat on drive detail views. DESIGN.md §6 canonical
   * is 6px — "lg" is a calibrated deviation for hero capacity visuals only.
   */
  height?: "sm" | "md" | "lg";
}

export function CapacityBar({
  usedBytes,
  totalBytes,
  reservedBytes = 0,
  overcommitted = false,
  height = "md"
}: CapacityBarProps) {
  const pct =
    totalBytes && usedBytes !== null && totalBytes > 0
      ? (usedBytes / totalBytes) * 100
      : null;
  const isUnknown = pct === null;
  const usedPctStr = !isUnknown ? `${Math.max(1, pct!)}%` : "0%";
  const reservedPctStr =
    totalBytes && reservedBytes > 0 ? `${(reservedBytes / totalBytes) * 100}%` : undefined;

  const level: "normal" | "warn" | "danger" =
    pct !== null && pct > 95 ? "danger" : pct !== null && pct >= 80 ? "warn" : "normal";
  const dataLevel = level === "normal" ? undefined : level;

  const heightClass = height === "lg" ? "cap-bar lg" : "cap-bar";

  return (
    <div
      className={heightClass}
      role="progressbar"
      aria-valuenow={pct !== null ? Math.round(pct) : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={pct !== null ? `Storage ${Math.round(pct)}% used` : "Storage usage unknown"}
    >
      {!isUnknown && (
        <div
          className="cap-used capacity-bar-fill"
          data-level={dataLevel}
          style={{ width: usedPctStr }}
        >
          {reservedPctStr ? (
            <div
              className="cap-reserved"
              style={{
                right: 0,
                width: reservedPctStr,
                background: overcommitted ? "var(--danger)" : undefined
              }}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CapacityLegend — quiet key for the capacity bar. Used dot is ink, not blue.
// ---------------------------------------------------------------------------

export function CapacityLegend({
  usedLabel,
  reservedLabel,
  freeLabel
}: {
  usedLabel: string;
  reservedLabel?: string;
  freeLabel: string;
}) {
  return (
    <div
      className="flex flex-wrap"
      style={{ gap: "4px 16px", fontSize: 12, color: "var(--ink-3)", marginTop: 12 }}
    >
      <span className="inline-flex items-center" style={{ gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ink)", display: "inline-block" }} />
        {usedLabel}
      </span>
      {reservedLabel ? (
        <span className="inline-flex items-center" style={{ gap: 6 }}>
          <span
            style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ink-3)", display: "inline-block" }}
          />
          {reservedLabel}
        </span>
      ) : null}
      <span className="inline-flex items-center" style={{ gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ink-4)", display: "inline-block" }} />
        {freeLabel}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FeedbackNotice — DESIGN.md §6
// ---------------------------------------------------------------------------
// Flat surface. Error = danger-container fill with danger ink + icon. Other
// tones use a neutral surface-container fill with semantic icon color so the
// notice carries meaning via icon + text, not via gradient.
// ---------------------------------------------------------------------------

export function FeedbackNotice({
  tone,
  title,
  messages
}: {
  tone: "success" | "warning" | "error" | "info";
  title: string;
  messages: string[];
}) {
  if (messages.length === 0) {
    return null;
  }

  const iconColor =
    tone === "error"
      ? "var(--danger)"
      : tone === "warning"
        ? "var(--warn)"
        : tone === "success"
          ? "var(--success, #1d7a4a)"
          : "var(--action)";

  const background = tone === "error" ? "var(--danger-container)" : "var(--surface-container)";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background,
        border: "1px solid var(--hairline)",
        borderRadius: 8,
        padding: "12px 16px",
        color: "var(--ink)"
      }}
    >
      <div className="flex items-start" style={{ gap: 12 }}>
        <div
          className="flex items-center justify-center shrink-0"
          style={{ width: 20, height: 20, color: iconColor }}
          aria-hidden="true"
        >
          <FeedbackIcon tone={tone} />
        </div>
        <div className="min-w-0 flex-1">
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", margin: 0 }}>{title}</p>
          <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
            {messages.map((message) => (
              <p
                key={message}
                style={{ fontSize: 14, lineHeight: 1.5, color: "var(--ink-2)", margin: 0 }}
              >
                {message}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetaField — label / value pair used in drive and project identity cards
// ---------------------------------------------------------------------------

export function MetaField({
  label,
  value,
  tone,
  mono = false
}: {
  label: string;
  value: string;
  tone?: "accent" | "warn";
  mono?: boolean;
}) {
  const valueColor =
    tone === "accent" ? "var(--accent-ink)" : tone === "warn" ? "var(--warn)" : "var(--ink)";
  return (
    <div className="flex flex-col min-w-0" style={{ gap: 2 }}>
      <dt
        className="text-eyebrow"
        style={{ color: "var(--ink-4)" }}
      >
        {label}
      </dt>
      <dd
        className={`tnum truncate${mono ? " mono" : ""}`}
        style={{ color: valueColor, margin: 0, fontSize: 13, fontWeight: 500 }}
      >
        {value}
      </dd>
    </div>
  );
}

function FeedbackIcon({ tone }: { tone: "success" | "warning" | "error" | "info" }) {
  if (tone === "success") {
    return <Icon name="check" size={15} color="currentColor" />;
  }
  if (tone === "warning") {
    return <Icon name="warning" size={15} color="currentColor" />;
  }
  if (tone === "error") {
    return <Icon name="close" size={15} color="currentColor" />;
  }
  return <Icon name="info" size={15} color="currentColor" />;
}
