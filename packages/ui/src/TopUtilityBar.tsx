import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { Icon } from "./Icon";

export interface TopUtilityBarProps {
  /** Human label for the current route section (e.g. "Projects"). */
  section: string;
  /** Optional trailing breadcrumb (project name, drive name, etc.). */
  sectionDetail?: string;
  /** Optional slot for a page-level action (e.g. "+ New project"). */
  action?: ReactNode;
  /** Controlled search input value. */
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?(value: string): void;
  onSearchSubmit?(value: string): void;
  /** Focus the omnibox on `/` when true. */
  searchShortcutEnabled?: boolean;
}

/**
 * Top nav — DESIGN.md §4.
 *
 * A single 56px glass strip. Sidebar + top nav + page is the chrome
 * limit. The breadcrumb is plain text, not a bordered pill, because a
 * pill would create the banned third chrome layer. Layout is a three
 * column grid: breadcrumb left, global omnibox center, primary action
 * right. The drag region covers the strip so the window can be moved
 * from any blank spot.
 */
export function TopUtilityBar({
  section,
  sectionDetail,
  action,
  searchValue = "",
  searchPlaceholder = "Search projects, drives, or folders",
  onSearchChange,
  onSearchSubmit,
  searchShortcutEnabled = true
}: TopUtilityBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!searchShortcutEnabled || !onSearchChange) return;

    function handle(event: KeyboardEvent) {
      if (event.key !== "/") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [searchShortcutEnabled, onSearchChange]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearchSubmit?.(searchValue);
  }

  const showSearch = Boolean(onSearchChange);

  return (
    <header
      data-tauri-drag-region
      className="sticky z-20 flex items-center"
      style={{
        top: 0,
        height: 48,
        padding: "0 20px",
        borderBottom: "1px solid var(--hairline)",
        background: "var(--glass-toolbar)",
        backdropFilter: "var(--glass-toolbar-filter)",
        WebkitBackdropFilter: "var(--glass-toolbar-filter)"
      }}
    >
      <div
        className="grid min-w-0 flex-1 items-center"
        style={{
          gap: 24,
          gridTemplateColumns: showSearch
            ? "minmax(140px, 1fr) minmax(280px, 420px) minmax(72px, auto)"
            : "minmax(0, 1fr) auto"
        }}
      >
        {/* Breadcrumb — plain text, no pill, no border. */}
        <div
          data-tauri-drag-region
          className="flex min-w-0 items-center"
          style={{ gap: 8 }}
        >
          <span
            data-tauri-drag-region
            className="truncate font-semibold"
            style={{ fontSize: 14, color: "var(--ink)", letterSpacing: "-0.005em" }}
          >
            {section}
          </span>
          {sectionDetail ? (
            <>
              <span
                data-tauri-drag-region
                aria-hidden="true"
                className="shrink-0"
                style={{ color: "var(--ink-4)" }}
              >
                <Icon name="chevron" size={11} color="currentColor" />
              </span>
              <span
                data-tauri-drag-region
                className="truncate"
                style={{ fontSize: 14, color: "var(--ink-2)" }}
                title={sectionDetail}
              >
                {sectionDetail}
              </span>
            </>
          ) : null}
        </div>

        {showSearch ? (
          <form
            onSubmit={handleSubmit}
            className="relative min-w-0"
            role="search"
          >
            <label
              className="field flex w-full items-center"
              style={{ gap: 8, height: 32 }}
            >
              <Icon name="search" size={14} color="var(--ink-3)" />
              <span className="sr-only">{searchPlaceholder}</span>
              <input
                ref={inputRef}
                type="search"
                value={searchValue}
                onChange={(event) => onSearchChange?.(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full bg-transparent outline-none"
                style={{
                  fontSize: 14,
                  color: "var(--ink)"
                }}
              />
              <span className="kbd" aria-hidden="true">
                /
              </span>
            </label>
          </form>
        ) : (
          <div data-tauri-drag-region aria-hidden="true" />
        )}

        <div className="flex shrink-0 items-center justify-end" style={{ marginLeft: "auto", gap: 8 }}>
          {action}
        </div>
      </div>
    </header>
  );
}
