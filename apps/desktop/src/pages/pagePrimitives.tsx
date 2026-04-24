import { useEffect, useRef, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// SearchField
// ---------------------------------------------------------------------------
// Big search surface used on the Projects list. DESIGN.md §4 puts the global
// omnibox in the top nav, but the Projects page — the app's primary work
// surface — also offers an inline search with suggestions. Hairline border,
// flat surface, action-blue focus ring. No uppercase-tracked decoration.
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
  const showResultCount =
    isActive && value.trim().length > 0 && resultCount !== undefined && !showSuggestions;

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
      <div
        className="flex items-center gap-2 rounded-lg border px-3"
        style={{
          height: 40,
          borderColor: isFocused ? "var(--action)" : "var(--border-soft)",
          background: "var(--surface)",
          boxShadow: isFocused ? "0 0 0 2px var(--accent-soft)" : "none",
          transition: "border-color 120ms ease, box-shadow 120ms ease"
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
          className="min-w-0 flex-1 bg-transparent text-[14px] leading-normal outline-none placeholder:text-[color:var(--ink-4)] [&::-webkit-search-cancel-button]:hidden"
          style={{
            color: "var(--ink)",
            caretColor: "var(--action)"
          }}
        />

        {showResultCount ? (
          <span
            className="tnum shrink-0 text-[12px] font-medium"
            style={{ color: "var(--ink-3)" }}
            aria-live="polite"
          >
            {resultCount}
          </span>
        ) : null}

        {showShortcutHint ? (
          <kbd className="kbd shrink-0" aria-hidden="true">
            /
          </kbd>
        ) : null}

        {value ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange("")}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors"
            style={{ color: "var(--ink-3)" }}
            aria-label="Clear search"
          >
            <XIcon />
          </button>
        ) : null}
      </div>

      {showSuggestions ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 overflow-hidden rounded-lg border"
          style={{
            borderColor: "var(--hairline)",
            background: "var(--surface)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.08)"
          }}
        >
          {suggestions.map((group, gi) => (
            <div
              key={group.key}
              className="border-b last:border-b-0"
              style={{ borderColor: "var(--hairline)" }}
            >
              <p
                className="px-3 pt-2.5 pb-1 text-[12px] font-medium"
                style={{ color: "var(--ink-3)" }}
              >
                {group.label}
              </p>
              <ul
                role="listbox"
                className={`px-1.5 ${gi === suggestions.length - 1 ? "pb-1.5" : "pb-1"}`}
              >
                {group.suggestions.map((s) => (
                  <li key={s.key} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelect(s.value);
                      }}
                      className="search-suggestion-item flex w-full items-center justify-between rounded-[8px] px-2.5 py-2 text-left text-[14px] transition-colors"
                      style={{ color: "var(--ink)" }}
                    >
                      <span className="truncate font-medium">{s.label}</span>
                      <span
                        className="ml-3 shrink-0 text-[12px]"
                        style={{ color: "var(--ink-4)" }}
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
        color: active ? "var(--ink-2)" : "var(--ink-3)",
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
    <section className="card overflow-hidden">
      <div
        className="flex items-start justify-between gap-4 px-5 py-4"
        style={{
          borderBottom: hasHeaderDivider ? "1px solid var(--hairline)" : "none"
        }}
      >
        <div className="min-w-0">
          <h4
            className="text-[16px] font-semibold"
            style={{ color: "var(--ink)", margin: 0, letterSpacing: "-0.01em" }}
          >
            {title}
          </h4>
          {description ? (
            <p
              className="mt-1 max-w-[62ch] text-[14px] leading-[1.5]"
              style={{ color: "var(--ink-3)", margin: "4px 0 0" }}
            >
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="px-5 py-4">{children}</div>
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
  "Pending size": "accent",
  "Unknown size impact": "accent",
  "Personal project": "accent",
  Completed: "neutral",
  "Size ready": "neutral",
  Healthy: "ok",
  Client: "ok",
  "Unknown impact": "info",
  Unassigned: "info",
  "Personal folder": "muted"
};

const LABEL_SHOWS_DOT: Record<string, boolean> = {
  Missing: true,
  Duplicate: true,
  "Move pending": true,
  Unassigned: true,
  Overcommitted: true,
  "Near capacity": true,
  Running: true,
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
      className="rounded-[12px] border px-5 py-6"
      style={{
        background: "var(--surface)",
        borderColor: "var(--hairline)"
      }}
    >
      <p className="text-[14px] font-semibold" style={{ color: "var(--ink)", margin: 0 }}>
        {title}
      </p>
      <p
        className="text-[14px] leading-[1.5]"
        style={{ color: "var(--ink-3)", margin: "4px 0 0" }}
      >
        {description}
      </p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="py-6 text-center">
      <p className="text-[14px]" style={{ color: "var(--ink-3)", margin: 0 }}>
        {label}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loaders — hairline bounded, no decorative tint.
// ---------------------------------------------------------------------------

export function DriveCardSkeleton() {
  return (
    <div
      className="card flex flex-col overflow-hidden"
      style={{ padding: 0 }}
      aria-hidden="true"
    >
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
      <div
        className="flex gap-3 border-t px-4 py-2.5"
        style={{ borderColor: "var(--hairline)" }}
      >
        <div className="skeleton h-3 w-8 rounded" />
        <div className="skeleton h-3 w-12 rounded" />
      </div>
    </div>
  );
}

export function ProjectRowSkeleton() {
  return (
    <div
      className="flex items-center gap-3 border-b px-3 py-2.5"
      style={{ borderColor: "var(--hairline)" }}
      aria-hidden="true"
    >
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

export function MetricCardSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="skeleton h-2.5 w-14 rounded" />
      <div className="skeleton mt-1.5 h-4 w-20 rounded" />
    </div>
  );
}

export function ScanRowSkeleton() {
  return (
    <article
      className="border-b px-4 py-3"
      style={{ borderColor: "var(--hairline)" }}
      aria-hidden="true"
    >
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

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(29, 29, 31, 0.48)" }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-[480px] rounded-[12px]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        tabIndex={-1}
        style={{
          background: "var(--graphite)",
          color: "#ffffff",
          padding: 40,
          boxShadow: "0 24px 56px rgba(0, 0, 0, 0.32)"
        }}
      >
        <h3
          id="confirm-modal-title"
          style={{
            margin: 0,
            fontSize: 40,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: "-0.015em",
            color: "#ffffff"
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: "16px 0 0",
            fontSize: 17,
            lineHeight: 1.47,
            color: "rgba(255, 255, 255, 0.78)"
          }}
        >
          {description}
        </p>
        <div className="mt-8 flex justify-end gap-2">
          <button
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
// MetricCard — DESIGN.md §3 type scale.
// ---------------------------------------------------------------------------
// Inline label + value. Label uses control-label (14/500 ink-3), value uses
// body-primary tabular. No uppercase, no tiny 10.5px label.
// ---------------------------------------------------------------------------

export function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p
        className="text-[14px] font-medium"
        style={{ color: "var(--ink-3)", margin: 0, letterSpacing: 0 }}
      >
        {label}
      </p>
      <p
        className="tnum truncate text-[17px]"
        style={{ color: "var(--ink)", margin: "4px 0 0" }}
      >
        {value}
      </p>
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
  const usedPctStr = pct !== null ? `${Math.max(1, pct)}%` : "28%";
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
      className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px]"
      style={{ color: "var(--ink-3)" }}
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--ink)" }} />
        {usedLabel}
      </span>
      {reservedLabel ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: "var(--ink-3)" }}
          />
          {reservedLabel}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--ink-4)" }} />
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
      className="rounded-[8px] border px-4 py-3"
      style={{
        background,
        borderColor: "var(--hairline)",
        color: "var(--ink)"
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-5 w-5 shrink-0 items-center justify-center"
          style={{ color: iconColor }}
          aria-hidden="true"
        >
          <FeedbackIcon tone={tone} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold" style={{ color: "var(--ink)" }}>
            {title}
          </p>
          <div className="mt-1 space-y-1">
            {messages.map((message) => (
              <p
                key={message}
                className="text-[14px] leading-[1.5]"
                style={{ color: "var(--ink-2)" }}
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
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M5 8l2 2 4-4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (tone === "warning") {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 6.5V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
      </svg>
    );
  }
  if (tone === "error") {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  // info
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7.5V11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="5" r="0.75" fill="currentColor" />
    </svg>
  );
}
