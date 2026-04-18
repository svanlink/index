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
    { path: "/", value: "Inbox" },
    { path: "/projects", value: "Projects" },
    { path: "/drives", value: "Drives" },
    { path: "/projects/project-240401-apple-shoot", value: "Project" },
    { path: "/drives/drive-a", value: "Drive" }
  ])("renders $path", async ({ path, value }) => {
    const router = createTestRouter([path]);

    render(
      <AppProviders>
        <ScanWorkflowProvider>
          <RouterProvider router={router} />
        </ScanWorkflowProvider>
      </AppProviders>
    );

    expect(await screen.findByRole("heading", { name: value, level: 2 })).toBeInTheDocument();
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

    const [searchInput] = await screen.findAllByPlaceholderText("Search projects…");
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

  it("combines page search with active filters and clears cleanly", async () => {
    const router = createTestRouter(["/projects?category=design"]);

    render(
      <AppProviders>
        <ScanWorkflowProvider>
          <RouterProvider router={router} />
        </ScanWorkflowProvider>
      </AppProviders>
    );

    const pageSearch = await screen.findByPlaceholderText("Search by name, client, date, drive…");
    fireEvent.change(pageSearch, { target: { value: "ad" } });

    await waitFor(() => {
      expect(router.state.location.search).toContain("category=design");
      expect(router.state.location.search).toContain("q=ad");
      expect(screen.getAllByText("Adidas Social").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("Apple Product Shoot")).toHaveLength(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    await waitFor(() => {
      expect(router.state.location.search).toBe("?category=design");
      expect(screen.getAllByText("Adidas Social").length).toBeGreaterThan(0);
      expect(screen.getAllByText("ClientX").length).toBeGreaterThan(0);
    });
  });

  it("shows suggestions that respect active filters", async () => {
    const router = createTestRouter(["/projects?drive=__unassigned__&movePending=1"]);

    render(
      <AppProviders>
        <ScanWorkflowProvider>
          <RouterProvider router={router} />
        </ScanWorkflowProvider>
      </AppProviders>
    );

    const pageSearch = await screen.findByPlaceholderText("Search by name, client, date, drive…");
    fireEvent.focus(pageSearch);
    fireEvent.change(pageSearch, { target: { value: "ad" } });

    await waitFor(() => {
      expect(screen.getAllByText("Clients").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Projects").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Adidas").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Adidas Social").length).toBeGreaterThan(0);
      expect(screen.queryByText("Apple")).not.toBeInTheDocument();
    });
  });
});
