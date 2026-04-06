import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AppShell, type NavItem } from "@drive-project-catalog/ui";
import { ShellToolbarActions } from "./ShellToolbarActions";

const navItems: NavItem[] = [
  { label: "Dashboard", to: "/" },
  { label: "Projects", to: "/projects" },
  { label: "Scans", to: "/scans" },
  { label: "Storage", to: "/storage" },
  { label: "Drives", to: "/drives" },
  { label: "Settings", to: "/settings" }
];

const routeTitles: Record<string, string> = {
  "/": "Dashboard",
  "/projects": "Projects",
  "/scans": "Scans",
  "/storage": "Storage",
  "/drives": "Drives",
  "/settings": "Settings"
};

export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [globalSearch, setGlobalSearch] = useState(searchParams.get("q") ?? "");
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
