import type { ReactNode } from "react";
import type { NavItem } from "./SidebarNav";
import { SidebarNav } from "./SidebarNav";
import { TopUtilityBar } from "./TopUtilityBar";

interface AppShellProps {
  navItems: NavItem[];
  footerNavItems?: NavItem[];
  /** Section label shown in the breadcrumb (e.g. "Projects"). */
  section: string;
  /** Optional trailing breadcrumb detail (project/drive name). */
  sectionDetail?: string;
  /** Page-level action slot rendered on the right of the top bar. */
  toolbarAction?: ReactNode;
  /** Brand label shown in the sidebar. Defaults to "Project Catalog". */
  brandLabel?: string;
  /** Global search — anchored in the top bar. */
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?(value: string): void;
  onSearchSubmit?(value: string): void;
  children: ReactNode;
}

/**
 * Application chrome. DESIGN.md §4 Layout: sidebar + top nav + main. No
 * secondary toolbar, no decorative gradient, no tinted wash. The canvas
 * itself is the background; hairlines do the dividing. Content caps at
 * 1200px so dense lists get the full horizontal span without letting
 * prose lines run forever.
 */
export function AppShell({
  navItems,
  footerNavItems,
  section,
  sectionDetail,
  toolbarAction,
  brandLabel,
  searchValue,
  searchPlaceholder,
  onSearchChange,
  onSearchSubmit,
  children
}: AppShellProps) {
  return (
    <div
      className="flex h-screen text-[color:var(--ink)]"
      style={{ background: "var(--canvas)" }}
    >
      <SidebarNav
        items={navItems}
        footerItems={footerNavItems}
        brandLabel={brandLabel}
      />
      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <TopUtilityBar
          section={section}
          sectionDetail={sectionDetail}
          action={toolbarAction}
          searchValue={searchValue}
          searchPlaceholder={searchPlaceholder}
          onSearchChange={onSearchChange}
          onSearchSubmit={onSearchSubmit}
        />
        <main
          className="flex-1 overflow-y-auto"
          style={{ background: "var(--canvas)" }}
        >
          <div className="mx-auto w-full max-w-[1200px] px-10 pt-8 pb-16">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
