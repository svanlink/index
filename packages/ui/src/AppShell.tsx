import type { ReactNode } from "react";
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
    <div className="flex h-screen bg-transparent text-[color:var(--color-text)]">
      <SidebarNav items={navItems} />
      <div className="flex h-screen min-w-0 flex-1 flex-col">
        <TopUtilityBar
          title={title}
          action={toolbarAction}
          searchValue={searchValue}
          searchPlaceholder={searchPlaceholder}
          onSearchChange={onSearchChange}
          onSearchSubmit={onSearchSubmit}
        />
        <main className="flex-1 overflow-y-auto px-6 py-5 pb-10">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
