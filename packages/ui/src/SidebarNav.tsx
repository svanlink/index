import { NavLink } from "react-router-dom";

export interface NavItem {
  label: string;
  to: string;
}

interface SidebarNavProps {
  items: NavItem[];
}

export function SidebarNav({ items }: SidebarNavProps) {
  return (
    <aside className="hidden min-h-screen w-[284px] shrink-0 flex-col border-r px-6 py-7 lg:flex" style={{ background: "var(--color-sidebar)", borderColor: "var(--color-sidebar-border)" }}>
      <div className="mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em]" style={{ color: "var(--color-sidebar-muted)" }}>
          Drive Project Catalog
        </p>
        <h1 className="mt-3 text-[28px] font-semibold leading-none text-stone-50">Desktop Catalog</h1>
        <p className="mt-3 max-w-[14rem] text-sm leading-6" style={{ color: "var(--color-sidebar-muted)" }}>
          A calm production workspace for project archives, drive planning, and catalog clarity.
        </p>
      </div>

      <nav className="space-y-2.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                "group flex items-center gap-3 rounded-[16px] px-4 py-3 text-sm font-medium transition",
                isActive
                  ? "bg-white/10 text-stone-50 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                  : "text-stone-300 hover:bg-white/6 hover:text-stone-50"
              ].join(" ")
            }
          >
            <span className="h-2 w-2 rounded-full bg-current opacity-75 transition group-hover:opacity-100" />
            <span className="tracking-[0.01em]">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto rounded-[20px] border px-4 py-4 text-sm" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "var(--color-sidebar-muted)" }}>
        <p className="font-medium text-stone-50">Catalog workspace</p>
        <p className="mt-2 leading-6">Project-first structure, refined navigation, and a desktop layout designed for long archive sessions.</p>
      </div>
    </aside>
  );
}
