import { createBrowserRouter, createMemoryRouter } from "react-router-dom";
import { DrivesPage } from "../pages/DrivesPage";
import { DashboardPage } from "../pages/DashboardPage";
import { DriveDetailPage } from "../pages/DriveDetailPage";
import { ComparePage } from "../pages/ComparePage";
import { ProjectDetailPage } from "../pages/ProjectDetailPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { RenamePage } from "../pages/RenamePage";
import { SettingsPage } from "../pages/SettingsPage";
import { TasksPage } from "../pages/TasksPage";
import { RootLayout } from "./RootLayout";

const appRoutes = [
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "projects/:projectId", element: <ProjectDetailPage /> },
      { path: "drives", element: <DrivesPage /> },
      { path: "drives/:driveId", element: <DriveDetailPage /> },
      { path: "compare", element: <ComparePage /> },
      { path: "rename", element: <RenamePage /> },
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
