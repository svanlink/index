import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "../app/providers";
import { createTestRouter } from "../app/router";
import { ScanWorkflowProvider } from "../app/scanWorkflow";

// ---------------------------------------------------------------------------
// DrivesPage — S6/H11
// ---------------------------------------------------------------------------
//
// H11: Before S6, `handleCreateDrive` swallowed every createDrive error with
// a bare `catch {}` and only reopened the form — the user had no feedback
// about what went wrong. This test verifies the fix: a failed createDrive
// now renders a `FeedbackNotice` with the error message, and a successful
// create both navigates and renders a success notice.
//
// The repository mock wraps the real MockCatalogRepository and replaces
// `createDrive` with a spy whose behaviour is controlled per-test via
// `driveCreateBehaviour`. Vi.mock is hoisted, so the closure is built via
// module-level mutable state.
// ---------------------------------------------------------------------------

type DriveCreateBehaviour =
  | { kind: "pass-through" }
  | { kind: "reject-with"; error: Error };

let driveCreateBehaviour: DriveCreateBehaviour = { kind: "pass-through" };

vi.mock("../app/catalogRepository", async () => {
  const { MockCatalogRepository } = await import("@drive-project-catalog/data/testing");
  const base = new MockCatalogRepository();
  const realCreate = base.createDrive.bind(base);
  base.createDrive = async (input) => {
    if (driveCreateBehaviour.kind === "reject-with") {
      throw driveCreateBehaviour.error;
    }
    return realCreate(input);
  };
  return { repository: base };
});

function renderDrivesPage() {
  const router = createTestRouter(["/drives"]);
  const utils = render(
    <AppProviders>
      <ScanWorkflowProvider>
        <RouterProvider router={router} />
      </ScanWorkflowProvider>
    </AppProviders>
  );
  return { router, ...utils };
}

async function openCreateForm(): Promise<void> {
  // Wait for the page to mount.
  await screen.findByRole("heading", { name: "Drives", level: 2 });
  fireEvent.click(screen.getByRole("button", { name: "Add drive" }));
  await screen.findByRole("button", { name: /create drive/i });
}

async function submitDrive(volumeName: string): Promise<void> {
  const volumeInput = screen.getByPlaceholderText("Archive Drive");
  fireEvent.change(volumeInput, { target: { value: volumeName } });
  fireEvent.click(screen.getByRole("button", { name: /create drive/i }));
}

describe("DrivesPage — H11 feedback on createDrive", () => {
  it("surfaces an error FeedbackNotice when createDrive rejects", async () => {
    driveCreateBehaviour = {
      kind: "reject-with",
      error: new Error("Volume already exists")
    };

    renderDrivesPage();
    await openCreateForm();
    await submitDrive("Duplicate Drive");

    // The error title comes from the DrivesPage fix; the message comes from
    // the Error thrown by the mocked repository.
    await waitFor(() => {
      expect(screen.getByText("Could not add drive")).toBeInTheDocument();
      expect(screen.getByText("Volume already exists")).toBeInTheDocument();
    });

    // The form stays open so the user can correct and retry — prior
    // behaviour silently reopened the form with no explanation.
    expect(screen.getByRole("button", { name: /create drive/i })).toBeInTheDocument();
  });

  it("renders a success FeedbackNotice when createDrive resolves", async () => {
    driveCreateBehaviour = { kind: "pass-through" };

    const { router } = renderDrivesPage();
    await openCreateForm();
    await submitDrive("New Archive");

    await waitFor(() => {
      expect(screen.getByText("Drive added")).toBeInTheDocument();
      // Navigation happens on success — the test router moves to /drives/:id.
      expect(router.state.location.pathname.startsWith("/drives/")).toBe(true);
      expect(router.state.location.pathname).not.toBe("/drives");
    });
  });
});
