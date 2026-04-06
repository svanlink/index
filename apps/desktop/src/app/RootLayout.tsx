import { Outlet, useLocation } from "react-router-dom";
import { AppShell, type NavItem } from "@drive-project-catalog/ui";
import { DesktopScanPanel } from "./DesktopScanPanel";

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
  const title = location.pathname.startsWith("/projects/")
    ? "Project Detail"
    : location.pathname.startsWith("/scans/")
      ? "Scan Detail"
      : location.pathname.startsWith("/storage")
        ? "Storage Planning"
      : location.pathname.startsWith("/drives/")
        ? "Drive Detail"
    : routeTitles[location.pathname] ?? "Drive Project Catalog";

  return (
    <AppShell navItems={navItems} title={title} toolbarAction={<DesktopScanPanel />}>
      <Outlet />
    </AppShell>
  );
}
