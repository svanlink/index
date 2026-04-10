import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import type { NavItem } from "./SidebarNav";
import { SidebarNav } from "./SidebarNav";
import { TopUtilityBar } from "./TopUtilityBar";

interface AppShellProps {
  navItems: NavItem[];
  title: string;
  toolbarAction?: ReactNode;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?(value: string): void;
  onSearchSubmit?(): void;
  children: ReactNode;
}

export function AppShell({
  navItems,
  title,
  toolbarAction,
  searchValue,
  searchPlaceholder,
  onSearchChange,
  onSearchSubmit,
  children
}: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-transparent text-[color:var(--color-text)]">
      <SidebarNav items={navItems} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <TopUtilityBar
          title={title}
          action={toolbarAction}
          searchValue={searchValue}
          searchPlaceholder={searchPlaceholder}
          onSearchChange={onSearchChange}
          onSearchSubmit={onSearchSubmit}
        />
        <main className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
        <nav
          className="sticky bottom-0 z-10 border-t px-3 py-2 lg:hidden"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className="rounded-md px-2 py-1.5 text-center text-[11px] font-medium"
                style={{ color: "var(--color-text-muted)" }}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
