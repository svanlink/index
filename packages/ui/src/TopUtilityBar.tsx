import type { FormEvent, ReactNode } from "react";
import { Icon } from "./Icon";

interface TopUtilityBarProps {
  title: string;
  action?: ReactNode;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?(value: string): void;
  onSearchSubmit?(): void;
}

/**
 * Slim top bar in the 2026 refresh. Title is smaller and recedes; the bar acts
 * primarily as a drag region for Tauri's native window controls. An optional
 * global search sits on the right for quick jumping to projects, and the
 * caller can slot any page-level action beside it.
 */
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
      data-tauri-drag-region
      className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b px-6 py-[10px]"
      style={{
        borderColor: "var(--hairline)",
        background: "var(--surface)"
      }}
    >
      <h2
        className="text-[14px] font-semibold"
        style={{ color: "var(--ink-2)", letterSpacing: "-0.005em" }}
      >
        {title}
      </h2>

      <div className="flex items-center gap-2">
        {onSearchChange ? (
          <form onSubmit={handleSubmit} className="min-w-0">
            <label
              className="field flex w-[220px] items-center"
              style={{ height: 28 }}
            >
              <Icon name="search" size={13} color="var(--ink-3)" />
              <span className="sr-only">{searchPlaceholder}</span>
              <input
                type="text"
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full bg-transparent outline-none"
                style={{
                  fontSize: 12.5,
                  marginLeft: 6,
                  color: "var(--ink)"
                }}
              />
            </label>
          </form>
        ) : null}
        {action}
      </div>
    </header>
  );
}
