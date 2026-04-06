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
  searchPlaceholder = "Client, project, or date",
  onSearchChange,
  onSearchSubmit
}: TopUtilityBarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearchSubmit?.();
  }

  return (
    <header className="sticky top-0 z-10 flex flex-col gap-4 border-b px-5 py-4 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: "var(--color-border)", background: "rgba(251, 250, 248, 0.88)", backdropFilter: "blur(14px)" }}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em]" style={{ color: "var(--color-text-soft)" }}>
          Desktop-first workspace
        </p>
        <h2 className="mt-1 text-[28px] font-semibold leading-none" style={{ color: "var(--color-text)" }}>{title}</h2>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form onSubmit={handleSubmit} className="min-w-0 flex-1">
          <label className="field-shell flex min-w-[320px] items-center gap-3 text-sm" style={{ color: "var(--color-text-soft)" }}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "var(--color-surface-subtle)", color: "var(--color-accent)" }}>
              <span className="h-2.5 w-2.5 rounded-full border-2 border-current border-r-0 border-t-0 rotate-45" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>Search</span>
            <input
              type="text"
              value={searchValue}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-[color:var(--color-text)] outline-none placeholder:text-[color:var(--color-text-soft)]"
            />
          </label>
        </form>
        {action ?? (
          <button type="button" className="button-secondary min-w-[116px]">
            Scan drive
          </button>
        )}
      </div>
    </header>
  );
}
