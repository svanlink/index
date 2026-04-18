import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AppShell, type NavItem } from "@drive-project-catalog/ui";
import { useCatalogStore } from "./providers";
import { useScanWorkflow } from "./scanWorkflow";
import { useShortcut } from "./useShortcut";

const routeTitles: Record<string, string> = {
  "/": "Inbox",
  "/projects": "Projects",
  "/drives": "Drives",
  "/settings": "Settings"
};

/**
 * Things-3 style nav: primary surfaces are Projects, Drives, and Scan.
 * Scan routes to the drives page where the user picks a target — the real
 * scan machinery lives in the drive detail view. Settings is tucked at the
 * bottom via `footerNavItems`. Dashboard remains at `/` for direct links but
 * is not in the sidebar.
 */
export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [globalSearch, setGlobalSearch] = useState(searchParams.get("q") ?? "");
  const { refresh, projects, drives } = useCatalogStore();
  const { activeSession } = useScanWorkflow();

  const navItems: NavItem[] = useMemo(
    () => [
      { label: "Projects", to: "/projects", icon: "folder", count: projects.length },
      {
        label: "Drives",
        to: "/drives",
        icon: "hardDrive",
        count: drives.length,
        scanActive: activeSession?.status === "running"
      },
      { label: "Scan", icon: "scan", onClick: () => navigate("/drives") }
    ],
    [projects.length, drives.length, activeSession?.status, navigate]
  );

  const footerNavItems: NavItem[] = useMemo(
    () => [{ label: "Settings", to: "/settings", icon: "settings" }],
    []
  );

  const title = location.pathname.startsWith("/projects/")
    ? "Project"
    : location.pathname.startsWith("/drives/")
      ? "Drive"
      : routeTitles[location.pathname] ?? "Index";

  useEffect(() => {
    if (location.pathname === "/projects") {
      setGlobalSearch(searchParams.get("q") ?? "");
      return;
    }
    setGlobalSearch("");
  }, [location.pathname, searchParams]);

  function submitGlobalSearch() {
    const nextQuery = globalSearch.trim();
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
      title={title}
      searchValue={globalSearch}
      searchPlaceholder="Search projects…"
      onSearchChange={setGlobalSearch}
      onSearchSubmit={submitGlobalSearch}
    >
      <Outlet />
    </AppShell>
  );
}
