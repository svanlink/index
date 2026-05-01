import { createBrowserRouter, createMemoryRouter, Navigate } from "react-router-dom";
import { DrivesPage } from "../pages/DrivesPage";
import { DriveDetailPage } from "../pages/DriveDetailPage";
import { ProjectDetailPage } from "../pages/ProjectDetailPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { RootLayout } from "./RootLayout";

const appRoutes = [
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "projects/:projectId", element: <ProjectDetailPage /> },
      { path: "drives", element: <DrivesPage /> },
      { path: "drives/:driveId", element: <DriveDetailPage /> }
    ]
  }
];

export function createAppRouter() {
  return createBrowserRouter(appRoutes);
}

export function createTestRouter(initialEntries: string[]) {
  return createMemoryRouter(appRoutes, { initialEntries });
}
