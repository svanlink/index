import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "../app/providers";
import { createTestRouter } from "../app/router";
import { ScanWorkflowProvider } from "../app/scanWorkflow";

vi.mock("../app/catalogRepository", async () => {
  const { MockCatalogRepository } = await import("@drive-project-catalog/data/testing");
  return { repository: new MockCatalogRepository() };
});

describe("ProjectsPage", () => {
  it("filters projects after submitting the global omnibox", async () => {
    const router = createTestRouter(["/projects"]);

    render(
      <AppProviders>
        <ScanWorkflowProvider>
          <RouterProvider router={router} />
        </ScanWorkflowProvider>
      </AppProviders>
    );

    const searchInput = await screen.findByPlaceholderText("Search projects, drives, or folders");
    expect(await screen.findByText("Adidas Social")).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "apple" } });
    fireEvent.submit(searchInput.closest("form")!);

    await waitFor(() => {
      expect(screen.getAllByText("Apple Product Shoot").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("Adidas Social")).toHaveLength(0);
      expect(router.state.location.search).toBe("?q=apple");
    });
  });
});
