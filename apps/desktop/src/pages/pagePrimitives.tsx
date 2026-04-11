import { useEffect, useRef, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// SearchField
// ---------------------------------------------------------------------------

export interface SearchSuggestionItem {
  key: string;
  label: string;
  value: string;
  matchType: string;
}

export interface SearchSuggestionGroup {
  key: string;
  label: string;
  suggestions: SearchSuggestionItem[];
}

interface SearchFieldProps {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  suggestions?: SearchSuggestionGroup[];
  onSelectSuggestion?(value: string): void;
  className?: string;
  /** Optional live result count shown inside the field when typing */
  resultCount?: number;
}

export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
  suggestions = [],
  onSelectSuggestion,
  className = "",
  resultCount
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const isActive = isFocused || value.length > 0;
  const showSuggestions = isFocused && value.trim().length > 0 && suggestions.length > 0;
  const showShortcutHint = !isActive;
  const showResultCount = isActive && value.trim().length > 0 && resultCount !== undefined && !showSuggestions;

  // `/` keyboard shortcut to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if ((e.target as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleSelect(v: string) {
    onChange(v);
    onSelectSuggestion?.(v);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      if (value) {
        onChange("");
      } else {
        inputRef.current?.blur();
      }
    }
  }

  return (
    <div className={`relative ${className}`} role="search">
      {/* Shell — surface shift: idle=subtle, focus=elevated */}
      <div
        className="flex items-center gap-2 rounded-md border px-3 py-1.5"
        style={{
          borderColor: isFocused ? "var(--color-accent)" : "var(--color-border)",
          background: isFocused ? "var(--color-surface-elevated)" : "var(--color-surface-subtle)",
          transition: "border-color 120ms ease, background 120ms ease"
        }}
      >
        <SearchFieldIcon active={isActive} />
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-label={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[13px] leading-normal outline-none placeholder:text-[color:var(--color-text-soft)] [&::-webkit-search-cancel-button]:hidden"
          style={{
            color: "var(--color-text)",
            caretColor: "var(--color-accent)"
          }}
        />

        {/* Live result count — quiet feedback while typing */}
        {showResultCount ? (
          <span
            className="shrink-0 text-[11px] tabular-nums font-medium"
            style={{ color: "var(--color-text-soft)" }}
            aria-live="polite"
          >
            {resultCount}
          </span>
        ) : null}

        {/* Keyboard shortcut hint — idle state only */}
        {showShortcutHint ? (
          <kbd
            className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-surface-elevated)",
              color: "var(--color-text-soft)",
              fontFamily: "inherit"
            }}
            aria-hidden="true"
          >
            /
          </kbd>
        ) : null}

        {/* Clear button — visible when value exists */}
        {value ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange("")}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[color:var(--color-surface-subtle)]"
            style={{ color: "var(--color-text-soft)" }}
            aria-label="Clear search"
          >
            <XIcon />
          </button>
        ) : null}
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 overflow-hidden rounded-lg border"
          style={{
            borderColor: "var(--color-border)",
            background: "var(--color-surface-elevated)"
          }}
        >
          {suggestions.map((group, gi) => (
            <div
              key={group.key}
              className="border-b last:border-b-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              <p
                className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: "var(--color-text-soft)" }}
              >
                {group.label}
              </p>
              <ul role="listbox" className={`px-1.5 ${gi === suggestions.length - 1 ? "pb-1.5" : "pb-1"}`}>
                {group.suggestions.map((s) => (
                  <li key={s.key} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelect(s.value);
                      }}
                      className="search-suggestion-item flex w-full items-center justify-between rounded-[8px] px-2.5 py-1.5 text-left text-[13px] transition-colors"
                      style={{ color: "var(--color-text)" }}
                    >
                      <span className="font-medium">{s.label}</span>
                      <span
                        className="ml-3 shrink-0 rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.12em]"
                        style={{
                          borderColor: "var(--color-border)",
                          background: "var(--color-surface-subtle)",
                          color: "var(--color-text-soft)"
                        }}
                      >
                        {s.matchType === "prefix" ? "starts with" : "contains"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SearchFieldIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{
        flexShrink: 0,
        color: active ? "var(--color-accent)" : "var(--color-text-soft)",
        transition: "color 140ms ease"
      }}
    >
      <circle cx="6.5" cy="6.5" r="4.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// SectionCard
// ---------------------------------------------------------------------------

interface SectionCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}

export function SectionCard({ title, description, children, action }: SectionCardProps) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[14px] font-semibold" style={{ color: "var(--color-text)" }}>{title}</h4>
          {description ? <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--color-text-muted)" }}>{description}</p> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

type BadgeTone = "danger" | "warning" | "accent" | "success" | "info" | "neutral" | "muted";

const TONE_CLASSES: Record<BadgeTone, string> = {
  danger: "border-[color:var(--color-border-danger)] bg-[color:var(--color-danger-soft)] text-[color:var(--color-danger)]",
  warning: "border-[color:var(--color-border-warning)] bg-[color:var(--color-warning-soft)] text-[color:var(--color-warning)]",
  accent: "border-[color:var(--color-border-info)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]",
  success: "border-[color:var(--color-border-success)] bg-[color:var(--color-success-soft)] text-[color:var(--color-success-deep)]",
  info: "border-[color:var(--color-border-info)] bg-[color:var(--color-info-soft)] text-[color:var(--color-info)]",
  neutral: "border-[color:var(--color-border)] bg-[color:var(--color-surface-subtle)] text-[color:var(--color-text-muted)]",
  muted: "border-[color:var(--color-border)] bg-[color:var(--color-surface-subtle)] text-[color:var(--color-text-soft)]",
};

const LABEL_TONE: Record<string, BadgeTone> = {
  Missing: "danger",
  Failed: "danger",
  Interrupted: "danger",
  Overcommitted: "danger",
  Duplicate: "warning",
  "Move pending": "warning",
  Cancelled: "warning",
  "Near capacity": "warning",
  Running: "accent",
  "Pending size": "accent",
  "Unknown size impact": "accent",
  "Personal project": "accent",
  Completed: "neutral",
  "Size ready": "neutral",
  Healthy: "success",
  Client: "success",
  "Unknown impact": "info",
  Unassigned: "info",
  "Personal folder": "muted",
};

export function StatusBadge({ label }: { label: string }) {
  const tone = TONE_CLASSES[LABEL_TONE[label] ?? "neutral"];
  return <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>{label}</span>;
}

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
    <div className="rounded-lg border border-dashed px-6 py-8 text-center" style={{ borderColor: "var(--color-border-strong)" }}>
      <p className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>{title}</p>
      <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-muted)" }}>{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="py-6 text-center">
      <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

/** Skeleton for a drive card (used in DrivesPage grid) */
export function DriveCardSkeleton() {
  return (
    <div className="app-panel flex flex-col overflow-hidden" style={{ padding: 0 }} aria-hidden="true">
      <div className="px-4 pt-4 pb-3">
        <div className="skeleton h-3.5 w-2/3 rounded" />
        <div className="skeleton mt-2 h-2.5 w-1/3 rounded" />
        <div className="skeleton mt-2 h-2.5 w-1/2 rounded" />
      </div>
      <div className="px-4 pb-3">
        <div className="skeleton h-1.5 w-full rounded-full" />
        <div className="mt-2 flex gap-4">
          <div className="skeleton h-2 w-16 rounded" />
          <div className="skeleton h-2 w-16 rounded" />
          <div className="skeleton h-2 w-12 rounded" />
        </div>
      </div>
      <div className="flex gap-3 border-t px-4 py-2.5" style={{ borderColor: "var(--color-border)" }}>
        <div className="skeleton h-3 w-8 rounded" />
        <div className="skeleton h-3 w-12 rounded" />
      </div>
    </div>
  );
}

/** Skeleton for a project table row */
export function ProjectRowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b px-3 py-2.5" style={{ borderColor: "var(--color-border)" }} aria-hidden="true">
      <div className="skeleton h-3.5 w-3.5 shrink-0 rounded" />
      <div className="skeleton h-2.5 w-16 shrink-0 rounded" />
      <div className="skeleton h-2.5 w-24 shrink-0 rounded" />
      <div className="skeleton h-2.5 flex-1 rounded" />
      <div className="skeleton h-2.5 w-20 shrink-0 rounded" />
      <div className="skeleton h-2.5 w-16 shrink-0 rounded" />
      <div className="skeleton h-2.5 w-14 shrink-0 rounded" />
    </div>
  );
}

/** Skeleton for a metric card (label + value) */
export function MetricCardSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="skeleton h-2.5 w-14 rounded" />
      <div className="skeleton mt-1.5 h-4 w-20 rounded" />
    </div>
  );
}

/** Skeleton for a scan list row */
export function ScanRowSkeleton() {
  return (
    <article className="border-b px-4 py-3" style={{ borderColor: "var(--color-border)" }} aria-hidden="true">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="skeleton h-5 w-14 rounded" />
          <div className="skeleton h-3 w-32 rounded" />
        </div>
        <div className="skeleton h-6 w-14 rounded" />
      </div>
      <div className="skeleton mt-2 h-2.5 w-3/4 rounded" />
      <div className="mt-2 flex gap-4">
        <div className="skeleton h-2.5 w-20 rounded" />
        <div className="skeleton h-2.5 w-20 rounded" />
        <div className="skeleton h-2.5 w-16 rounded" />
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// ConfirmModal
// ---------------------------------------------------------------------------

interface ConfirmModalProps {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm(): void;
  onCancel(): void;
  isDestructive?: boolean;
  isLoading?: boolean;
}

export function ConfirmModal({
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
  isDestructive = true,
  isLoading = false
}: ConfirmModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape to close, Enter to confirm — scoped to the modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && !isLoading) {
        e.preventDefault();
        onConfirm();
      }
    }
    const dialog = dialogRef.current;
    dialog?.addEventListener("keydown", handleKeyDown);
    return () => dialog?.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, onConfirm, isLoading]);

  // Auto-focus the dialog so it receives keyboard events
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.2)" }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        className="app-panel w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        tabIndex={-1}
      >
        <h3
          id="confirm-modal-title"
          className="text-[15px] font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          {title}
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
          {description}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="button-secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className={isDestructive ? "button-danger" : "button-primary"}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetricCard
// ---------------------------------------------------------------------------

export function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium" style={{ color: "var(--color-text-soft)" }}>{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CapacityBar
// ---------------------------------------------------------------------------

interface CapacityBarProps {
  usedBytes: number | null;
  totalBytes: number | null;
  reservedBytes?: number;
  overcommitted?: boolean;
  height?: "sm" | "md";
}

export function CapacityBar({
  usedBytes,
  totalBytes,
  reservedBytes = 0,
  overcommitted = false,
  height = "md"
}: CapacityBarProps) {
  const usedPct =
    totalBytes && usedBytes !== null
      ? `${Math.max(8, (usedBytes / totalBytes) * 100)}%`
      : "28%";
  const reservedPct =
    totalBytes && reservedBytes > 0
      ? `${Math.max(6, (reservedBytes / totalBytes) * 100)}%`
      : undefined;
  const h = height === "sm" ? "h-2.5" : "h-3";

  const usedPctNum = totalBytes && usedBytes !== null ? Math.round((usedBytes / totalBytes) * 100) : null;

  return (
    <div
      className="overflow-hidden rounded-full"
      style={{ background: "var(--color-progress-track)" }}
      role="progressbar"
      aria-valuenow={usedPctNum ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={usedPctNum !== null ? `Storage ${usedPctNum}% used` : "Storage usage unknown"}
    >
      <div
        className={`capacity-bar-fill relative ${h} rounded-full`}
        style={{ width: usedPct, background: "var(--color-accent)" }}
      >
        {reservedPct ? (
          <div
            className="absolute right-0 top-0 h-full rounded-full"
            style={{
              width: reservedPct,
              background: overcommitted ? "var(--color-danger)" : "var(--color-reserved)"
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CapacityLegend
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
    <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-text-soft)" }}>
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-accent)" }} />
        {usedLabel}
      </span>
      {reservedLabel ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-reserved)" }} />
          {reservedLabel}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-free-indicator)" }} />
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
    <div
      role="status"
      aria-live="polite"
      className="rounded-md border px-3 py-3"
      style={palette}
    >
      <div className="flex items-start gap-2">
        <FeedbackIcon tone={tone} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold">{title}</p>
          <div className="mt-1.5 space-y-1">
            {messages.map((message) => (
              <p key={message} className="text-[13px] leading-snug">{message}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedbackIcon({ tone }: { tone: "success" | "warning" | "error" | "info" }) {
  if (tone === "success") {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (tone === "warning") {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
        <path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 6.5V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
      </svg>
    );
  }
  if (tone === "error") {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  // info
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.5V11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="5" r="0.75" fill="currentColor" />
    </svg>
  );
}
