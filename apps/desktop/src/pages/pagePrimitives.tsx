import type { ReactNode } from "react";

interface SectionCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}

export function SectionCard({ title, description, children, action }: SectionCardProps) {
  return (
    <article className="app-panel p-6 xl:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h4 className="text-[20px] font-semibold tracking-[-0.02em]" style={{ color: "var(--color-text)" }}>{title}</h4>
          {description ? <p className="mt-2 text-[14px] leading-6" style={{ color: "var(--color-text-muted)" }}>{description}</p> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      <div className="mt-6">{children}</div>
    </article>
  );
}

export function StatusBadge({ label }: { label: string }) {
  const tone =
    label === "Missing"
      ? "border-[#dcc6c0] bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]"
      : label === "Duplicate"
        ? "border-[#ddcfb8] bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]"
        : label === "Move pending"
          ? "border-[#ddcfb8] bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]"
          : label === "Failed" || label === "Interrupted"
            ? "border-[#dcc6c0] bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]"
            : label === "Cancelled"
              ? "border-[#ddcfb8] bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]"
              : label === "Running" || label === "Pending size"
            ? "border-[#c9d5df] bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]"
              : label === "Completed" || label === "Size ready"
                ? "border-[color:var(--color-border)] bg-[color:var(--color-surface-subtle)] text-[color:var(--color-text-muted)]"
          : label === "Healthy"
            ? "border-[#c7d8cb] bg-[#f3f8f3] text-[#345046]"
            : label === "Near capacity"
              ? "border-[#ddcfb8] bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]"
              : label === "Overcommitted"
                ? "border-[#dcc6c0] bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]"
                : label === "Unknown impact"
                  ? "border-[#c9d5df] bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]"
          : label === "Unassigned"
            ? "border-[#c9d5df] bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]"
            : label === "Unknown size impact"
              ? "border-[#c9d5df] bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]"
              : "border-[color:var(--color-border)] bg-[color:var(--color-surface-subtle)] text-[color:var(--color-text-muted)]";

  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${tone}`}>{label}</span>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[20px] border border-dashed px-6 py-10 text-center" style={{ borderColor: "var(--color-border-strong)", background: "var(--color-surface-subtle)" }}>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
        <span className="h-4 w-4 rounded-full" style={{ background: "var(--color-accent-soft)", border: "1px solid var(--color-accent)" }} />
      </div>
      <p className="text-base font-medium" style={{ color: "var(--color-text)" }}>{title}</p>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>{description}</p>
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="rounded-[20px] border px-6 py-8" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: "var(--color-accent)" }} />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: "var(--color-accent)", animationDelay: "120ms" }} />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: "var(--color-accent)", animationDelay: "240ms" }} />
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--color-text-muted)" }}>{label}</p>
      </div>
    </div>
  );
}

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
    <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-text-soft)" }}>
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-accent)" }} />
        {usedLabel}
      </span>
      {reservedLabel ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#b18f63" }} />
          {reservedLabel}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ded7cc" }} />
        {freeLabel}
      </span>
    </div>
  );
}

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

  const palette =
    tone === "success"
      ? { borderColor: "#c7d8cb", background: "#f3f8f3", color: "#345046" }
      : tone === "warning"
        ? { borderColor: "#ddcfb8", background: "var(--color-warning-soft)", color: "var(--color-warning)" }
        : tone === "error"
          ? { borderColor: "#dcc6c0", background: "var(--color-danger-soft)", color: "var(--color-danger)" }
          : { borderColor: "#c9d5df", background: "var(--color-info-soft)", color: "var(--color-info)" };

  return (
    <div className="rounded-[18px] border px-4 py-4" style={palette}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{title}</p>
      <div className="mt-2 space-y-1.5">
        {messages.map((message) => (
          <p key={message} className="text-sm leading-6">{message}</p>
        ))}
      </div>
    </div>
  );
}
