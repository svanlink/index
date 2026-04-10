import type { FormEvent, ReactNode } from "react";

interface TopUtilityBarProps {
  title: string;
  action?: ReactNode;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?(value: string): void;
  onSearchSubmit?(): void;
}

export function TopUtilityBar({
  title,
  action,
  searchValue = "",
  searchPlaceholder = "Search…",
  onSearchChange,
  onSearchSubmit
}: TopUtilityBarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearchSubmit?.();
  }

  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b px-6 py-3"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <h2
        className="text-[20px] font-semibold leading-none tracking-[-0.01em]"
        style={{ color: "var(--color-text)" }}
      >
        {title}
      </h2>

      <div className="flex items-center gap-2">
        {onSearchChange ? (
          <form onSubmit={handleSubmit} className="min-w-0">
            <label
              className="field-shell flex w-[240px] items-center gap-2 text-[13px]"
              style={{ color: "var(--color-text-soft)" }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                style={{ flexShrink: 0, color: "var(--color-text-soft)" }}
              >
                <circle cx="6.5" cy="6.5" r="4.75" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="sr-only">Search the catalog from anywhere</span>
              <input
                type="text"
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full bg-transparent text-[13px] text-[color:var(--color-text)] outline-none placeholder:text-[color:var(--color-text-soft)]"
              />
            </label>
          </form>
        ) : null}
        {action}
      </div>
    </header>
  );
}
