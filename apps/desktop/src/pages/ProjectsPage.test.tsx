import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../app/providers";
import { createTestRouter } from "../app/router";
import { ScanWorkflowProvider } from "../app/scanWorkflow";

describe("ProjectsPage", () => {
  it("filters projects immediately as the search input changes", async () => {
    const router = createTestRouter(["/projects"]);

    render(
      <AppProviders>
        <ScanWorkflowProvider>
          <RouterProvider router={router} />
        </ScanWorkflowProvider>
      </AppProviders>
    );

    const searchInput = await screen.findByPlaceholderText("Client, project, date, drive, category");
    expect(await screen.findByText("Adidas Social")).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "apple" } });

    await waitFor(() => {
      expect(screen.getByText("Apple Product Shoot")).toBeInTheDocument();
      expect(screen.queryByText("Adidas Social")).not.toBeInTheDocument();
    });
  });
});
