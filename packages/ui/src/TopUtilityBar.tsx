import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export interface SearchResultItem {
  id: string;
  icon: IconName;
  label: string;
  detail: string;
  onSelect(): void;
}

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
  searchResults?: SearchResultItem[];
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
  searchResults = [],
  searchShortcutEnabled = true
}: TopUtilityBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

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
  const showResults = isSearchFocused && searchValue.trim().length > 0 && searchResults.length > 0;

  return (
    <header
      data-app-drag-region
      className="app-titlebar sticky top-0 z-20 flex h-[52px] items-center border-b px-4"
      style={{
        borderColor: "var(--hairline)",
        background: "rgba(246, 246, 246, 0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)"
      }}
    >
      <div
        data-app-drag-region
        className="grid min-w-0 flex-1 items-center gap-6"
        style={{
          gridTemplateColumns: showSearch
            ? "minmax(140px, 1fr) minmax(280px, 420px) minmax(72px, auto)"
            : "minmax(0, 1fr) auto"
        }}
      >
        {/* Breadcrumb — plain text, no pill, no border. */}
        <div
          data-app-drag-region
          data-tauri-drag-region
          className="flex min-w-0 items-center gap-2"
        >
          <span
            data-app-drag-region
            data-tauri-drag-region
            className="truncate text-[14px] font-semibold"
            style={{ color: "var(--ink)", letterSpacing: "-0.005em" }}
          >
            {section}
          </span>
          {sectionDetail ? (
            <>
              <span
                data-app-drag-region
                data-tauri-drag-region
                aria-hidden="true"
                className="shrink-0"
                style={{ color: "var(--ink-4)" }}
              >
                <Icon name="chevron" size={11} color="currentColor" />
              </span>
              <span
                data-app-drag-region
                data-tauri-drag-region
                className="truncate text-[14px]"
                style={{ color: "var(--ink-2)" }}
                title={sectionDetail}
              >
                {sectionDetail}
              </span>
            </>
          ) : null}
        </div>

        {showSearch ? (
          <form
            data-app-no-drag
            onSubmit={handleSubmit}
            className="relative min-w-0"
            role="search"
          >
            <label
              className="field flex w-full items-center gap-2"
              style={{ height: 32 }}
            >
              <Icon name="search" size={14} color="var(--ink-3)" />
              <span className="sr-only">{searchPlaceholder}</span>
              <input
                ref={inputRef}
                type="search"
                value={searchValue}
                onChange={(event) => onSearchChange?.(event.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => window.setTimeout(() => setIsSearchFocused(false), 120)}
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
            {showResults ? (
              <div
                className="absolute left-0 right-0 top-[38px] z-50 overflow-hidden rounded-[10px] border bg-[color:var(--surface)] shadow-[var(--sh-pop)]"
                style={{ borderColor: "var(--hairline)" }}
              >
                <ul className="max-h-[340px] overflow-y-auto p-1" role="listbox">
                  {searchResults.map((result) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--surface-container-low)]"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setIsSearchFocused(false);
                          result.onSelect();
                        }}
                      >
                        <Icon name={result.icon} size={15} color="var(--ink-3)" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                            {result.label}
                          </span>
                          <span className="block truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                            {result.detail}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </form>
        ) : (
          <div data-app-drag-region data-tauri-drag-region aria-hidden="true" />
        )}

        <div
          data-app-no-drag
          className="titlebar-actions ml-auto flex shrink-0 items-center justify-end gap-2"
        >
          {action}
        </div>
      </div>
    </header>
  );
}
