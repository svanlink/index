import { createBrowserRouter, createMemoryRouter } from "react-router-dom";
import { DrivesPage } from "../pages/DrivesPage";
import { DashboardPage } from "../pages/DashboardPage";
import { DriveDetailPage } from "../pages/DriveDetailPage";
import { ProjectDetailPage } from "../pages/ProjectDetailPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { RootLayout } from "./RootLayout";

const appRoutes = [
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "projects/:projectId", element: <ProjectDetailPage /> },
      { path: "drives", element: <DrivesPage /> },
      { path: "drives/:driveId", element: <DriveDetailPage /> },
      { path: "settings", element: <SettingsPage /> }
    ]
  }
];

export function createAppRouter() {
  return createBrowserRouter(appRoutes);
}

export function createTestRouter(initialEntries: string[]) {
  return createMemoryRouter(appRoutes, { initialEntries });
}
