import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

export interface NavItem {
  label: string;
  /**
   * When set, the item renders as a <NavLink to={to}> for active-state styling.
   * Leave undefined and provide `onClick` for action-style items.
   */
  to?: string;
  icon: IconName;
  /** Tight tabular count shown right-aligned inside the item. */
  count?: number;
  /** Invoked on click when `to` is undefined — for non-route items. */
  onClick?(): void;
  /** When true, renders an animated pulse dot in place of the icon. */
  scanActive?: boolean;
  /** Optional key shortcut shown on hover (e.g. "⌘1"). */
  shortcut?: string;
}

interface SidebarNavProps {
  /** Primary nav items — the core surfaces (Inbox, Projects, Drives). */
  items: NavItem[];
  /** Secondary items pinned to the bottom — typically Settings. */
  footerItems?: NavItem[];
  /** Brand label shown as the wordmark. */
  brandLabel?: string;
}

/**
 * Minimal sidebar. DESIGN.md §4: 220px, vibrancy background, hairline
 * right edge, app mark + wordmark (no sub-label, no boxed brand tile).
 * Active row gets macOS-style filled blue via `.side-item.active`.
 * Search lives in the top bar so the sidebar stays quiet and focused on
 * navigation.
 */
export function SidebarNav({
  items,
  footerItems = [],
  brandLabel = "Project Catalog"
}: SidebarNavProps) {
  return (
    <aside
      className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col overflow-y-auto border-r px-3 pb-4 pt-3 lg:flex"
      style={{
        background: "rgba(246, 246, 246, 0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderColor: "var(--hairline)"
      }}
    >
      {/* Drag handle spacer aligned to the top-nav height so the window
          can be dragged from the whole top edge. */}
      <div
        data-app-drag-region
        data-tauri-drag-region
        className="h-5"
        aria-hidden="true"
      />

      <div
        data-app-drag-region
        data-tauri-drag-region
        className="flex items-center gap-2 px-3 pb-5 pt-2"
      >
        <img
          data-app-drag-region
          data-tauri-drag-region
          src="/favicon.png"
          alt=""
          className="h-7 w-7 shrink-0 select-none"
          draggable={false}
        />
        <span
          data-app-drag-region
          data-tauri-drag-region
          className="block truncate text-[15px] font-semibold"
          style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}
        >
          {brandLabel}
        </span>
      </div>

      <nav
        data-app-no-drag
        className="flex flex-col gap-[2px]"
        aria-label="Primary"
      >
        {items.map((item) => (
          <SideItem key={item.label} item={item} />
        ))}
      </nav>

      <div data-app-drag-region data-tauri-drag-region className="flex-1" />

      {footerItems.length > 0 ? (
        <nav
          data-app-no-drag
          className="flex flex-col gap-[2px] border-t pt-3"
          style={{ borderColor: "var(--hairline)" }}
          aria-label="Secondary"
        >
          {footerItems.map((item) => (
            <SideItem key={item.label} item={item} />
          ))}
        </nav>
      ) : null}
    </aside>
  );
}

function SideItem({ item }: { item: NavItem }) {
  const iconNode = (active: boolean) =>
    item.scanActive ? (
      <span className="relative flex h-[17px] w-[17px] shrink-0 items-center justify-center">
        <span
          className="absolute inline-flex h-2 w-2 animate-ping rounded-full opacity-60"
          style={{ background: "var(--action)" }}
        />
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ background: "var(--action)" }}
        />
      </span>
    ) : (
      <Icon
        name={item.icon}
        size={17}
        color={active ? "var(--action)" : "var(--ink-3)"}
        className="side-icon"
      />
    );

  const inner = (active: boolean) => (
    <>
      {iconNode(active)}
      <span className="truncate">{item.label}</span>
      {item.count != null && item.count > 0 ? (
        <span className="side-count tnum">{item.count}</span>
      ) : null}
      {item.shortcut ? (
        <span className="side-shortcut tnum" aria-hidden="true">
          {item.shortcut}
        </span>
      ) : null}
    </>
  );

  if (item.to) {
    return (
      <NavLink
        data-app-no-drag
        to={item.to}
        end={item.to === "/"}
        className={({ isActive }) => "side-item" + (isActive ? " active" : "")}
      >
        {({ isActive }) => inner(isActive)}
      </NavLink>
    );
  }

  return (
    <button
      data-app-no-drag
      type="button"
      className="side-item"
      onClick={item.onClick}
    >
      {inner(false)}
    </button>
  );
}
