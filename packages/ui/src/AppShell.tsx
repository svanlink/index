import { type ReactNode } from "react";
import { SidebarNav, type NavItem } from "./SidebarNav";
import { TopUtilityBar } from "./TopUtilityBar";

export interface AppShellProps {
  navItems: NavItem[];
  footerNavItems?: NavItem[];
  section: string;
  sectionDetail?: string;
  /** Slot for a primary action button in the top bar (e.g. "+ New project"). */
  toolbarAction?: ReactNode;
  brandLabel?: string;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?(value: string): void;
  onSearchSubmit?(value: string): void;
  children: ReactNode;
}

/**
 * Root chrome — sidebar + top utility bar + content area.
 * No MUI. Uses design tokens from globals.css.
 * DESIGN.md §4: sidebar left, topbar sticky, main scrolls.
 */
export function AppShell({
  navItems,
  footerNavItems = [],
  section,
  sectionDetail,
  toolbarAction,
  brandLabel = "Catalog",
  searchValue,
  searchPlaceholder,
  onSearchChange,
  onSearchSubmit,
  children
}: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <SidebarNav
        items={navItems}
        footerItems={footerNavItems}
        brandLabel={brandLabel}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopUtilityBar
          section={section}
          sectionDetail={sectionDetail}
          action={toolbarAction}
          searchValue={searchValue}
          searchPlaceholder={searchPlaceholder}
          onSearchChange={onSearchChange}
          onSearchSubmit={onSearchSubmit}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
