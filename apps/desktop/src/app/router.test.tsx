import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppProviders } from "./providers";
import { createTestRouter } from "./router";
import { ScanWorkflowProvider } from "./scanWorkflow";

describe("desktop routes", () => {
  it.each([
    { path: "/", mode: "text", value: "Project-first dashboard" },
    { path: "/projects", mode: "text", value: "Project catalog" },
    { path: "/scans", mode: "text", value: "Scan history" },
    { path: "/storage", mode: "text", value: "Capacity planning" },
    { path: "/drives", mode: "text", value: "Drives overview" },
    { path: "/projects/project-240401-apple-shoot", mode: "heading", value: "Apple Product Shoot" },
    { path: "/scans/scan-drive-a-20260405", mode: "heading", value: "Drive A" },
    { path: "/drives/drive-a", mode: "text", value: "Drive summary" }
  ])("renders $path", async ({ path, mode, value }) => {
    const router = createTestRouter([path]);

    render(
      <AppProviders>
        <ScanWorkflowProvider>
          <RouterProvider router={router} />
        </ScanWorkflowProvider>
      </AppProviders>
    );

    if (mode === "heading") {
      expect(await screen.findByRole("heading", { name: value, level: 3 })).toBeInTheDocument();
      return;
    }

    expect(await screen.findByText(value)).toBeInTheDocument();
  });

  it("routes global shell search into the projects page", async () => {
    const router = createTestRouter(["/"]);

    render(
      <AppProviders>
        <ScanWorkflowProvider>
          <RouterProvider router={router} />
        </ScanWorkflowProvider>
      </AppProviders>
    );

    const [globalSearch] = await screen.findAllByPlaceholderText("Search the catalog from anywhere");
    fireEvent.change(globalSearch, { target: { value: "adidas" } });
    fireEvent.submit(globalSearch.closest("form") as HTMLFormElement);

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

    const pageSearch = await screen.findByPlaceholderText("Client, project, date, drive, category");
    fireEvent.change(pageSearch, { target: { value: "ad" } });

    await waitFor(() => {
      expect(router.state.location.search).toContain("category=design");
      expect(router.state.location.search).toContain("q=ad");
      expect(screen.getAllByText("Adidas Social").length).toBeGreaterThan(0);
      expect(screen.queryAllByText("Apple Product Shoot")).toHaveLength(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

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

    const pageSearch = await screen.findByPlaceholderText("Client, project, date, drive, category");
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
