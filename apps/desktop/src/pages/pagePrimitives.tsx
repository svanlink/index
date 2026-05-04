import { useEffect, useRef, type ReactNode } from "react";
import { useFocusTrap } from "../app/useFocusTrap";

// ---------------------------------------------------------------------------
// SectionCard — DESIGN.md §6
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
// ConfirmModal — DESIGN.md §6
// ---------------------------------------------------------------------------

interface ConfirmModalProps {
  title: string;
  description: string;
  /**
   * Short irreversibility note shown below the description — e.g. "This
   * cannot be undone." Keeps descriptions focused on what will change.
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

  useFocusTrap(dialogRef);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
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
          maxWidth: 380,
          borderRadius: 12,
          background: "var(--graphite)",
          color: "#ffffff",
          padding: "28px 32px",
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
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
            color: "#ffffff"
          }}
        >
          {title}
        </h3>
        <p
          id="confirm-modal-desc"
          style={{
            margin: "8px 0 0",
            fontSize: 13,
            lineHeight: 1.5,
            color: "rgba(255, 255, 255, 0.72)"
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
