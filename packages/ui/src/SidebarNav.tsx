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
  items: NavItem[];
  footerItems?: NavItem[];
  brandLabel?: string;
}

/**
 * Full-height sidebar. Two-column shell pattern (Things 3 / macOS).
 * Own 52px header carries the drag region and "Catalog" wordmark —
 * traffic lights from Tauri macOSPrivateApi land in that region.
 * Glass material via backdrop-filter; no hard opaque background.
 */
export function SidebarNav({
  items,
  footerItems = [],
  brandLabel = "Catalog"
}: SidebarNavProps) {
  return (
    <aside
      className="sidebar-aside"
      style={{
        width: "var(--sidebar-width, 220px)",
        background: "var(--glass-sidebar)",
        backdropFilter: "var(--glass-sidebar-filter)",
        WebkitBackdropFilter: "var(--glass-sidebar-filter)"
      }}
    >
      {/* App header — traffic lights from Tauri land top-left of this region */}
      <header
        data-tauri-drag-region
        style={{
          height: 52,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          flexShrink: 0,
          borderBottom: "1px solid var(--hairline)"
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
            userSelect: "none"
          }}
        >
          {brandLabel}
        </span>
      </header>

      <div style={{ padding: "8px 8px 12px", flex: 1, display: "flex", flexDirection: "column" }}>
        <nav className="flex flex-col" style={{ gap: 2 }} aria-label="Primary">
          {items.map((item) => (
            <SideItem key={item.label} item={item} />
          ))}
        </nav>

        <div className="flex-1" />

        {footerItems.length > 0 ? (
          <nav
            className="flex flex-col"
            style={{ gap: 2, borderTop: "1px solid var(--hairline)", paddingTop: 8 }}
            aria-label="Secondary"
          >
            {footerItems.map((item) => (
              <SideItem key={item.label} item={item} />
            ))}
          </nav>
        ) : null}
      </div>
    </aside>
  );
}

function SideItem({ item }: { item: NavItem }) {
  const iconNode = (active: boolean) =>
    item.scanActive ? (
      <span className="relative flex shrink-0 items-center justify-center" style={{ height: 17, width: 17 }}>
        <span
          className="pulse-ring absolute inline-flex rounded-full"
          style={{ height: 8, width: 8, background: "var(--action)", opacity: 0.6 }}
        />
        <span
          className="relative inline-flex rounded-full"
          style={{ height: 8, width: 8, background: "var(--action)" }}
        />
      </span>
    ) : (
      <Icon
        name={item.icon}
        size={16}
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
        to={item.to}
        end={item.to === "/"}
        className={({ isActive }) => "side-item" + (isActive ? " active" : "")}
      >
        {({ isActive }) => inner(isActive)}
      </NavLink>
    );
  }

  return (
    <button type="button" className="side-item" onClick={item.onClick}>
      {inner(false)}
    </button>
  );
}
