import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { getActiveScanSession } from "@drive-project-catalog/data";
import { AppShell, type NavItem } from "@drive-project-catalog/ui";
import { ShellToolbarActions } from "./ShellToolbarActions";
import { useCatalogStore } from "./providers";
import { useShortcut } from "./useShortcut";

const routeTitles: Record<string, string> = {
  "/": "Dashboard",
  "/projects": "Projects",
  "/scans": "Scans",
  "/storage": "Storage",
  "/drives": "Drives",
  "/settings": "Settings"
};

const BASE_NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/" },
  { label: "Projects", to: "/projects" },
  { label: "Scans", to: "/scans" },
  { label: "Storage", to: "/storage" },
  { label: "Drives", to: "/drives" },
  { label: "Settings", to: "/settings" }
];

export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [globalSearch, setGlobalSearch] = useState(searchParams.get("q") ?? "");
  const { scanSessions, refresh } = useCatalogStore();
  const activeScan = getActiveScanSession(scanSessions);

  const navItems: NavItem[] = BASE_NAV_ITEMS.map((item) => ({
    ...item,
    scanActive: item.to === "/scans" && activeScan != null
  }));

  const title = location.pathname.startsWith("/projects/")
    ? "Project Detail"
    : location.pathname.startsWith("/scans/")
      ? "Scan Detail"
      : location.pathname.startsWith("/storage")
        ? "Storage Planning"
      : location.pathname.startsWith("/drives/")
        ? "Drive Detail"
    : routeTitles[location.pathname] ?? "Drive Project Catalog";

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
      title={title}
      toolbarAction={<ShellToolbarActions />}
      searchValue={globalSearch}
      searchPlaceholder="Search the catalog from anywhere"
      onSearchChange={setGlobalSearch}
      onSearchSubmit={submitGlobalSearch}
    >
      <Outlet />
    </AppShell>
  );
}
