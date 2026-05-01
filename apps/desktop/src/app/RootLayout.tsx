import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppShell, type NavItem, type SearchResultItem } from "@drive-project-catalog/ui";
import { getDisplayClient, getDisplayProject } from "@drive-project-catalog/domain";
import { useCatalogStore } from "./providers";
import { useScanWorkflow } from "./scanWorkflow";
import { useShortcut } from "./useShortcut";
import { useVolumeMountedListener } from "./useVolumeMountedListener";
import { useWindowDragRegions } from "./useWindowDragRegions";

/**
 * Sections are routes that belong to one of the top-level nav entries. Detail
 * routes inherit the section label of their list parent and surface the entity
 * name as a breadcrumb detail, so the top bar stays coherent across the
 * list → detail path without needing a bespoke title for every entity kind.
 */
const sectionLabels: Record<string, string> = {
  "/": "Inbox",
  "/tasks": "Tasks",
  "/projects": "Projects",
  "/drives": "Drives",
  "/compare": "Compare Discs",
  "/rename": "Rename Review",
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
      { label: "Tasks", to: "/tasks", icon: "command" },
      { label: "Projects", to: "/projects", icon: "folder", count: projects.length },
      {
        label: "Drives",
        to: "/drives",
        icon: "hardDrive",
        count: drives.length,
        scanActive: activeSession?.status === "running"
      },
      { label: "Rename Review", to: "/rename", icon: "edit" },
      { label: "Compare Discs", to: "/compare", icon: "duplicate" }
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

  const searchResults = useMemo<SearchResultItem[]>(() => {
    const query = globalSearch.trim().toLowerCase();
    if (!query) return [];

    const results: SearchResultItem[] = [];
    const remember = new Set<string>();
    const push = (item: SearchResultItem) => {
      if (remember.has(item.id) || results.length >= 10) return;
      remember.add(item.id);
      results.push(item);
    };

    for (const project of projects) {
      const haystack = [
        getDisplayProject(project),
        getDisplayClient(project),
        project.folderName,
        project.folderPath,
        project.parsedDate,
        project.correctedDate,
        project.category,
        project.namingStatus,
        project.missingStatus,
        project.duplicateStatus
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) continue;
      const drive = drives.find((candidate) => candidate.id === project.currentDriveId);
      push({
        id: `project:${project.id}`,
        icon: "folder",
        label: getDisplayProject(project),
        detail: `${getDisplayClient(project)} · ${drive?.displayName ?? "Unassigned"}`,
        onSelect: () => navigate(`/projects/${project.id}`)
      });
    }

    for (const drive of drives) {
      const label = drive.displayName || drive.volumeName;
      const haystack = `${label} ${drive.volumeName} ${drive.mountPath ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) continue;
      push({
        id: `drive:${drive.id}`,
        icon: "hardDrive",
        label,
        detail: drive.mountPath ?? (drive.volumeName ? `/Volumes/${drive.volumeName}` : "Drive"),
        onSelect: () => navigate(`/drives/${drive.id}`)
      });
    }

    if ("rename review".includes(query) || "rename".includes(query)) {
      push({
        id: "route:rename",
        icon: "edit",
        label: "Rename Review",
        detail: "Review folder rename suggestions",
        onSelect: () => navigate("/rename")
      });
    }

    if ("tasks task center operations run preview history".includes(query) || "task".includes(query)) {
      push({
        id: "route:tasks",
        icon: "command",
        label: "Tasks",
        detail: "Run catalog operations and review task state",
        onSelect: () => navigate("/tasks")
      });
    }

    if ("compare discs mirror".includes(query) || "compare".includes(query) || "mirror".includes(query)) {
      push({
        id: "route:compare",
        icon: "duplicate",
        label: "Compare Discs",
        detail: "Check mirror differences between two drives",
        onSelect: () => navigate("/compare")
      });
    }

    push({
      id: "search:projects",
      icon: "search",
      label: `Search all projects for "${globalSearch.trim()}"`,
      detail: "Open project list with this query",
      onSelect: () => navigate(`/projects?q=${encodeURIComponent(globalSearch.trim())}`)
    });

    return results;
  }, [drives, globalSearch, navigate, projects]);

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

  // Background "Watch Mode" — listens for /Volumes mount events from the Rust
  // FSEvents watcher and routes the user to the new drive automatically.
  useVolumeMountedListener();
  useWindowDragRegions();

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
      searchResults={searchResults}
    >
      <Outlet />
    </AppShell>
  );
}
