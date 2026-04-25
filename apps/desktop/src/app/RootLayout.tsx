import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppShell, type NavItem } from "@drive-project-catalog/ui";
import { getDisplayProject } from "@drive-project-catalog/domain";
import { useCatalogStore } from "./providers";
import { useScanWorkflow } from "./scanWorkflow";
import { useShortcut } from "./useShortcut";

/**
 * Sections are routes that belong to one of the top-level nav entries. Detail
 * routes inherit the section label of their list parent and surface the entity
 * name as a breadcrumb detail, so the top bar stays coherent across the
 * list → detail path without needing a bespoke title for every entity kind.
 */
const sectionLabels: Record<string, string> = {
  "/": "Inbox",
  "/projects": "Projects",
  "/drives": "Drives",
  "/settings": "Settings"
};

export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const [globalSearch, setGlobalSearch] = useState(searchParams.get("q") ?? "");
  const { refresh, projects, drives } = useCatalogStore();
  const { activeSession } = useScanWorkflow();

  const navItems: NavItem[] = useMemo(
    () => [
      { label: "Inbox", to: "/", icon: "home" },
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

  const footerNavItems: NavItem[] = useMemo(
    () => [{ label: "Settings", to: "/settings", icon: "settings" }],
    []
  );

  // ---------------------------------------------------------------------------
  // Breadcrumb — section + detail
  //
  // For list routes ("/projects", "/drives", "/settings", "/"), the top bar
  // shows just the section label. For detail routes the breadcrumb becomes
  // "Projects › <project name>" or "Drives › <drive name>", so the user always
  // knows both where they are and how they got here. If the entity hasn't
  // loaded yet (navigation faster than the store), we fall back to the stable
  // noun so the bar never flickers empty.
  // ---------------------------------------------------------------------------
  const { section, sectionDetail } = useMemo(() => {
    const path = location.pathname;

    if (path.startsWith("/projects/")) {
      const project = projects.find((candidate) => candidate.id === params.projectId);
      return {
        section: "Projects",
        sectionDetail: project ? getDisplayProject(project) : "Project"
      };
    }

    if (path.startsWith("/drives/")) {
      const drive = drives.find((candidate) => candidate.id === params.driveId);
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

  // Keep the omnibox in lock-step with the URL. On /projects the query mirrors
  // the search param; elsewhere the input is cleared so returning to the page
  // doesn't resurrect a stale search from a previous session.
  useEffect(() => {
    if (location.pathname === "/projects") {
      setGlobalSearch(searchParams.get("q") ?? "");
      return;
    }
    setGlobalSearch("");
  }, [location.pathname, searchParams]);

  function submitGlobalSearch(value: string) {
    const nextQuery = value.trim();
    if (location.pathname === "/projects") {
      const nextParams = new URLSearchParams(searchParams);
      if (nextQuery) {
        nextParams.set("q", nextQuery);
      } else {
        nextParams.delete("q");
      }
      const nextSearch = nextParams.toString();
      navigate(nextSearch ? `/projects?${nextSearch}` : "/projects");
      return;
    }

    if (!nextQuery) {
      navigate("/projects");
      return;
    }

    navigate(`/projects?q=${encodeURIComponent(nextQuery)}`);
  }

  // Global keyboard shortcuts — page-specific shortcuts live in each page component.
  useShortcut({ key: "r", meta: true, onTrigger: () => void refresh() });
  useShortcut({ key: ",", meta: true, onTrigger: () => navigate("/settings") });

  return (
    <AppShell
      navItems={navItems}
      footerNavItems={footerNavItems}
      section={section}
      sectionDetail={sectionDetail}
      brandLabel="Catalog"
      searchValue={globalSearch}
      searchPlaceholder="Search projects, drives, or folders"
      onSearchChange={setGlobalSearch}
      onSearchSubmit={submitGlobalSearch}
    >
      <Outlet />
    </AppShell>
  );
}
