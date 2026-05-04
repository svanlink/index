import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppShell, type NavItem, type NavSection } from "@drive-project-catalog/ui";
import { getDisplayProject } from "@drive-project-catalog/domain";
import { useCatalogStore } from "./providers";
import { useScanWorkflow } from "./scanWorkflow";
import { useShortcut } from "./useShortcut";
import { CommandPalette } from "./commandPalette/CommandPalette";
import { CommandPaletteProvider } from "./commandPalette/CommandPaletteContext";
import { getDriveColor } from "../pages/driveColor";

const sectionLabels: Record<string, string> = {
  "/projects": "Projects",
  "/drives": "Drives"
};

export function RootLayout() {
  return (
    <CommandPaletteProvider>
      <RootLayoutShell />
      <CommandPalette />
    </CommandPaletteProvider>
  );
}

function RootLayoutShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const [globalSearch, setGlobalSearch] = useState(searchParams.get("q") ?? "");
  const { refresh, projects, drives } = useCatalogStore();
  const { activeSession } = useScanWorkflow();

  const projectsPerDrive = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of projects) {
      if (p.currentDriveId) {
        counts[p.currentDriveId] = (counts[p.currentDriveId] ?? 0) + 1;
      }
    }
    return counts;
  }, [projects]);

  const navSections: NavSection[] = useMemo(() => {
    const libraryItems: NavItem[] = [
      { label: "All projects", to: "/projects", icon: "folder", count: projects.length }
    ];

    const driveItems: NavItem[] = drives.map((drive) => ({
      label: drive.displayName,
      to: `/drives/${drive.id}`,
      icon: "hardDrive",
      count: projectsPerDrive[drive.id] ?? 0,
      accentColor: getDriveColor(drive.id),
      scanActive: activeSession?.requestedDriveId === drive.id && activeSession?.status === "running"
    }));

    const sections: NavSection[] = [
      { eyebrow: "Library", items: libraryItems }
    ];

    if (drives.length > 0) {
      sections.push({ eyebrow: "Drives", items: driveItems });
    }

    return sections;
  }, [projects.length, drives, projectsPerDrive, activeSession?.requestedDriveId, activeSession?.status]);

  /* Keep flat navItems for backward compat (AppShell fallback when no sections) */
  const navItems: NavItem[] = useMemo(
    () => [
      { label: "Projects", to: "/projects", icon: "folder", count: projects.length },
      {
        label: "Drives",
        to: "/drives",
        icon: "hardDrive",
        count: drives.length,
        scanActive: activeSession?.status === "running"
      }
    ],
    [projects.length, drives.length, activeSession?.status]
  );

  const { section, sectionDetail } = useMemo(() => {
    const path = location.pathname;

    if (path.startsWith("/projects/")) {
      const project = projects.find((c) => c.id === params.projectId);
      return {
        section: "Projects",
        sectionDetail: project ? getDisplayProject(project) : "Project"
      };
    }

    if (path.startsWith("/drives/")) {
      const drive = drives.find((c) => c.id === params.driveId);
      return {
        section: "Drives",
        sectionDetail: drive?.displayName ?? drive?.volumeName ?? "Drive"
      };
    }

    return {
      section: sectionLabels[path] ?? "Catalog",
      sectionDetail: undefined as string | undefined
    };
  }, [location.pathname, params.projectId, params.driveId, projects, drives]);

  useEffect(() => {
    if (location.pathname === "/projects") {
      setGlobalSearch(searchParams.get("q") ?? "");
      return;
    }
    setGlobalSearch("");
  }, [location.pathname, searchParams]);

  function navigateSearch(value: string, opts: { replace: boolean }) {
    const nextQuery = value.trim();
    if (location.pathname === "/projects") {
      const nextParams = new URLSearchParams(searchParams);
      if (nextQuery) {
        nextParams.set("q", nextQuery);
      } else {
        nextParams.delete("q");
      }
      const nextSearch = nextParams.toString();
      navigate(nextSearch ? `/projects?${nextSearch}` : "/projects", opts);
      return;
    }
    navigate(nextQuery ? `/projects?q=${encodeURIComponent(nextQuery)}` : "/projects", opts);
  }

  function handleSearchChange(value: string) {
    setGlobalSearch(value);
    navigateSearch(value, { replace: true });
  }

  function handleSearchSubmit(value: string) {
    navigateSearch(value, { replace: false });
  }

  useShortcut({ key: "r", meta: true, onTrigger: () => void refresh() });

  return (
    <AppShell
      navItems={navItems}
      navSections={navSections}
      section={section}
      sectionDetail={sectionDetail}
      brandLabel="Catalog"
      searchValue={globalSearch}
      searchPlaceholder="Search projects, drives, or folders"
      onSearchChange={handleSearchChange}
      onSearchSubmit={handleSearchSubmit}
    >
      <Outlet />
    </AppShell>
  );
}
