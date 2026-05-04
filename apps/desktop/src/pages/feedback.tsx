// StatusBadge and FeedbackNotice — split from pagePrimitives.tsx (CODE-V2-01)
import { Icon } from "@drive-project-catalog/ui";

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
