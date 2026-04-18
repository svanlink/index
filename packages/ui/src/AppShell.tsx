import type { ReactNode } from "react";
import type { NavItem } from "./SidebarNav";
import { SidebarNav } from "./SidebarNav";
import { TopUtilityBar } from "./TopUtilityBar";

interface AppShellProps {
  navItems: NavItem[];
  footerNavItems?: NavItem[];
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
  footerNavItems,
  title,
  toolbarAction,
  searchValue,
  searchPlaceholder,
  onSearchChange,
  onSearchSubmit,
  children
}: AppShellProps) {
  return (
    <div className="flex h-screen bg-transparent text-[color:var(--ink)]">
      <SidebarNav items={navItems} footerItems={footerNavItems} />
      <div className="flex h-screen min-w-0 flex-1 flex-col">
        <TopUtilityBar
          title={title}
          action={toolbarAction}
          searchValue={searchValue}
          searchPlaceholder={searchPlaceholder}
          onSearchChange={onSearchChange}
          onSearchSubmit={onSearchSubmit}
        />
        <main
          className="flex-1 overflow-y-auto"
          style={{ background: "var(--surface)" }}
        >
          <div className="mx-auto w-full max-w-[1200px] px-8 py-6 pb-12">{children}</div>
        </main>
      </div>
    </div>
  );
}
