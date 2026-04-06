import type { ReactNode } from "react";
import type { NavItem } from "./SidebarNav";
import { SidebarNav } from "./SidebarNav";
import { TopUtilityBar } from "./TopUtilityBar";

interface AppShellProps {
  navItems: NavItem[];
  title: string;
  toolbarAction?: ReactNode;
  children: ReactNode;
}

export function AppShell({ navItems, title, toolbarAction, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-transparent text-[color:var(--color-text)]">
      <SidebarNav items={navItems} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <TopUtilityBar title={title} action={toolbarAction} />
        <main className="flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-7 xl:px-10 xl:py-9">
          <div className="mx-auto w-full max-w-[1500px]">{children}</div>
        </main>
        <nav
          className="sticky bottom-0 z-10 border-t px-4 py-3 lg:hidden"
          style={{ borderColor: "var(--color-border)", background: "rgba(251, 250, 248, 0.96)", backdropFilter: "blur(14px)" }}
        >
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
            {navItems.map((item) => (
              <a
                key={item.to}
                href={item.to}
                className="rounded-[14px] px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em]"
                style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
              >
                {item.label}
              </a>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
