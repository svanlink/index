import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "./providers";
import { createTestRouter } from "./router";
import { ScanWorkflowProvider } from "./scanWorkflow";

vi.mock("./catalogRepository", async () => {
  const { MockCatalogRepository } = await import("@drive-project-catalog/data/testing");
  return { repository: new MockCatalogRepository() };
});

describe("desktop routes", () => {
  it.each([
    { path: "/projects", value: "Projects" },
    { path: "/drives", value: "Drives" },
    { path: "/projects/project-240401-apple-shoot", value: "Apple Product Shoot" },
    { path: "/drives/drive-a", value: "Drive A" }
  ])("renders $path", async ({ path, value }) => {
    const router = createTestRouter([path]);

    render(
      <AppProviders>
        <ScanWorkflowProvider>
          <RouterProvider router={router} />
        </ScanWorkflowProvider>
      </AppProviders>
    );

    expect(await screen.findByRole("heading", { name: value, level: 1 })).toBeInTheDocument();
  });

  it("routes shell search into the projects page and keeps the query visible", async () => {
    const router = createTestRouter(["/"]);

    render(
      <AppProviders>
        <ScanWorkflowProvider>
          <RouterProvider router={router} />
        </ScanWorkflowProvider>
      </AppProviders>
    );

    const searchInput = await screen.findByPlaceholderText("Search projects, drives, or folders");
    fireEvent.change(searchInput, { target: { value: "adidas" } });
    fireEvent.submit(searchInput.closest("form") as HTMLFormElement);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/projects");
      expect(router.state.location.search).toBe("?q=adidas");
      expect(screen.getAllByDisplayValue("adidas").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Adidas Social").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("Apple Product Shoot")).toHaveLength(0);
    });
  });

  it("combines the omnibox search with active project filters and clears cleanly", async () => {
    const router = createTestRouter(["/projects?category=design"]);

    render(
      <AppProviders>
        <ScanWorkflowProvider>
          <RouterProvider router={router} />
        </ScanWorkflowProvider>
      </AppProviders>
    );

    const searchInput = await screen.findByPlaceholderText("Search projects, drives, or folders");
    fireEvent.change(searchInput, { target: { value: "ad" } });
    fireEvent.submit(searchInput.closest("form") as HTMLFormElement);

    await waitFor(() => {
      expect(router.state.location.search).toContain("category=design");
      expect(router.state.location.search).toContain("q=ad");
      expect(screen.getAllByText("Adidas Social").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("Apple Product Shoot")).toHaveLength(0);
    });

    fireEvent.change(searchInput, { target: { value: "" } });
    fireEvent.submit(searchInput.closest("form") as HTMLFormElement);

    await waitFor(() => {
      expect(router.state.location.search).toBe("?category=design");
      expect(screen.getAllByText("Adidas Social").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Concept").length).toBeGreaterThan(0);
    });
  });

  it("shows breadcrumb context on project detail routes", async () => {
    const router = createTestRouter(["/projects/project-240401-apple-shoot"]);

    render(
      <AppProviders>
        <ScanWorkflowProvider>
          <RouterProvider router={router} />
        </ScanWorkflowProvider>
      </AppProviders>
    );

    expect((await screen.findAllByText("Projects")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Apple Product Shoot")).length).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe("/projects/project-240401-apple-shoot");
  });
});
