import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

export interface NavItem {
  label: string;
  /**
   * When set, the item renders as a <NavLink to={to}> for active-state styling.
   * Leave undefined and provide `onClick` for action-style items (e.g. "Scan"
   * that opens a workflow modal instead of navigating).
   */
  to?: string;
  icon: IconName;
  /** Tight tabular count shown right-aligned inside the item. */
  count?: number;
  /** Invoked on click when `to` is undefined — for non-route items. */
  onClick?(): void;
  /** When true, renders an animated pulse dot to signal background activity. */
  scanActive?: boolean;
}

interface SidebarNavProps {
  /** Primary nav items — the 3 core surfaces: Projects, Drives, Scan. */
  items: NavItem[];
  /** Secondary items tucked at the bottom — typically just Settings. */
  footerItems?: NavItem[];
}

/**
 * Things-3 style minimal sidebar. The layout is intentionally spare: a brand
 * mark at the top, a short stack of primary items with a thin accent bar on
 * the active row, flex-spacer, then the footer stack (Settings) pinned to the
 * bottom. No counts badges unless the caller supplies them.
 */
export function SidebarNav({ items, footerItems = [] }: SidebarNavProps) {
  return (
    <aside
      data-tauri-drag-region
      className="sticky top-0 hidden h-screen w-[200px] shrink-0 flex-col overflow-y-auto border-r px-[10px] pb-3 pt-[14px] lg:flex"
      style={{
        background: "var(--sidebar)",
        borderColor: "var(--hairline)"
      }}
    >
      {/* Brand — 20×20 black square with an 8×8 white inner square + wordmark */}
      <div className="flex items-center gap-[9px] pb-[22px] pl-[10px] pr-[10px] pt-[4px]">
        <span
          className="inline-flex h-5 w-5 items-center justify-center rounded-[5px]"
          style={{ background: "var(--ink)" }}
          aria-hidden="true"
        >
          <span className="h-2 w-2 rounded-[2px]" style={{ background: "#fff" }} />
        </span>
        <span
          className="text-[14px] font-semibold"
          style={{ color: "var(--ink)", letterSpacing: "-0.01em" }}
        >
          Index
        </span>
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col gap-[2px] pt-1">
        {items.map((item) => (
          <SideItem key={item.label} item={item} />
        ))}
      </nav>

      <div className="flex-1" />

      {/* Footer nav — Settings */}
      {footerItems.length > 0 ? (
        <div className="flex flex-col gap-[2px]">
          {footerItems.map((item) => (
            <SideItem key={item.label} item={item} />
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function SideItem({ item }: { item: NavItem }) {
  const content = (active: boolean) => (
    <>
      {item.scanActive ? (
        <span className="relative flex h-[17px] w-[17px] shrink-0 items-center justify-center">
          <span
            className="absolute inline-flex h-2 w-2 animate-ping rounded-full opacity-60"
            style={{ background: "var(--accent)" }}
          />
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{ background: "var(--accent)" }}
          />
        </span>
      ) : (
        <Icon
          name={item.icon}
          size={17}
          color={active ? "var(--ink)" : "var(--ink-3)"}
          className="side-icon"
        />
      )}
      <span>{item.label}</span>
      {item.count != null ? (
        <span className="side-count tnum">{item.count}</span>
      ) : null}
    </>
  );

  if (item.to) {
    return (
      <NavLink
        to={item.to}
        end={item.to === "/"}
        className={({ isActive }) => "side-item" + (isActive ? " active" : "")}
      >
        {({ isActive }) => content(isActive)}
      </NavLink>
    );
  }

  return (
    <button type="button" className="side-item" onClick={item.onClick}>
      {content(false)}
    </button>
  );
}
