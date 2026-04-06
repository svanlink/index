import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
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
});
