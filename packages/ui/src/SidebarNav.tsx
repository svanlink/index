import { NavLink } from "react-router-dom";

export interface NavItem {
  label: string;
  to: string;
  /** When true, renders an animated pulse dot to signal background activity (e.g. active scan). */
  scanActive?: boolean;
}

interface SidebarNavProps {
  items: NavItem[];
}

export function SidebarNav({ items }: SidebarNavProps) {
  return (
    <aside
      className="hidden h-screen w-[248px] shrink-0 flex-col border-r px-3 py-4 lg:flex sticky top-0 overflow-y-auto"
      style={{ background: "var(--color-sidebar)", borderColor: "var(--color-sidebar-border)" }}
    >
      <div className="mb-6 px-2">
        <h1
          className="text-[15px] font-semibold leading-tight"
          style={{ color: "var(--color-text)" }}
        >
          Index
        </h1>
        <p
          className="mt-0.5 text-[12px] leading-snug"
          style={{ color: "var(--color-text-muted)" }}
        >
          Desktop Catalog
        </p>
      </div>

      <nav className="space-y-0.5 pb-4">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors",
                isActive
                  ? "bg-[color:var(--color-sidebar-active)] text-[color:var(--color-text)]"
                  : "text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-sidebar-hover)]"
              ].join(" ")
            }
          >
            {/* Activity dot — pulses when scanActive, static when idle */}
            <span className="relative flex h-1.5 w-1.5 shrink-0 items-center justify-center">
              {item.scanActive ? (
                <>
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                    style={{ background: "var(--color-accent)" }}
                  />
                  <span
                    className="relative inline-flex h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--color-accent)" }}
                  />
                </>
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
              )}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
