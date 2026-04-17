import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Startup failure contract
// ---------------------------------------------------------------------------
//
// Product rule: empty state and failed state must never share the same visual
// result. When the initial local catalog load rejects, AppProviders must:
//   1. Render the StartupFailureScreen instead of children.
//   2. Show a clear, non-ambiguous failure heading (not an empty dashboard).
//   3. Offer a Retry action that re-invokes the boot path.
//   4. Preserve the raw error detail for diagnostics.
//
// These tests lock that contract so future refactors cannot quietly regress
// the failure path back into a silent empty state.
//
// The repository is mocked at module level with mutable implementations so a
// single test can walk the full fail → retry → succeed cycle.
// ---------------------------------------------------------------------------

const emptySyncState = {
  mode: "local-only" as const,
  pendingCount: 0,
  queuedCount: 0,
  failedCount: 0,
  inFlightCount: 0,
  syncInProgress: false,
  lastPushAt: null,
  lastPullAt: null,
  lastError: null,
  lastSyncError: null,
  remoteCursor: null,
  conflictPolicy: "updated-at-last-write-wins-local-tie-break" as const
};

const emptyDashboard = {
  recentScans: [],
  recentProjects: [],
  moveReminders: [],
  statusAlerts: []
};

// vi.mock is hoisted to the top of the module; vi.hoisted lets us declare the
// mock functions in the same hoisted phase so they are defined by the time the
// mock factory runs.
const {
  listProjectsMock,
  listDrivesMock,
  listScansMock,
  listScanSessionsMock,
  getDashboardSnapshotMock,
  getSyncStateMock,
  startupSyncMock
} = vi.hoisted(() => ({
  listProjectsMock: vi.fn(),
  listDrivesMock: vi.fn(),
  listScansMock: vi.fn(),
  listScanSessionsMock: vi.fn(),
  getDashboardSnapshotMock: vi.fn(),
  getSyncStateMock: vi.fn(),
  startupSyncMock: vi.fn()
}));

vi.mock("./catalogRepository", () => ({
  repository: {
    listProjects: listProjectsMock,
    listDrives: listDrivesMock,
    listScans: listScansMock,
    listScanSessions: listScanSessionsMock,
    getDashboardSnapshot: getDashboardSnapshotMock,
    getSyncState: getSyncStateMock,
    startupSync: startupSyncMock
  }
}));

import { AppProviders } from "./providers";

describe("AppProviders startup failure", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    listProjectsMock.mockReset();
    listDrivesMock.mockReset().mockResolvedValue([]);
    listScansMock.mockReset().mockResolvedValue([]);
    listScanSessionsMock.mockReset().mockResolvedValue([]);
    getDashboardSnapshotMock.mockReset().mockResolvedValue(emptyDashboard);
    getSyncStateMock.mockReset().mockResolvedValue(emptySyncState);
    startupSyncMock.mockReset().mockResolvedValue({ executed: false });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders the failure screen instead of children when initial load rejects", async () => {
    listProjectsMock.mockRejectedValue(new Error("SQLite disk image is malformed"));

    render(
      <AppProviders>
        <p data-testid="catalog-children">app content</p>
      </AppProviders>
    );

    // Heading distinguishes failure from empty state in plain language.
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: /couldn't load your library/i
    });
    expect(heading).toBeInTheDocument();

    // Failure framing uses an alert landmark so assistive tech announces it.
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Retry + Reload escape hatches must both be present.
    expect(screen.getByRole("button", { name: /^retry$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload window/i })).toBeInTheDocument();

    // Children must NOT render under the failure screen — the empty-vs-failed
    // product rule fails the moment a user sees an empty dashboard here.
    expect(screen.queryByTestId("catalog-children")).not.toBeInTheDocument();

    // Raw error detail must survive for diagnostics (inside the collapsed
    // <details> block but still present in the DOM).
    expect(screen.getByText("SQLite disk image is malformed")).toBeInTheDocument();
  });

  it("recovers to children when Retry succeeds on a second attempt", async () => {
    listProjectsMock
      .mockRejectedValueOnce(new Error("first-attempt failure"))
      .mockResolvedValue([]);

    render(
      <AppProviders>
        <p data-testid="catalog-children">app content</p>
      </AppProviders>
    );

    // First attempt: failure screen shown.
    await screen.findByRole("heading", { level: 1, name: /couldn't load your library/i });
    expect(screen.queryByTestId("catalog-children")).not.toBeInTheDocument();

    // Retry invokes the SAME boot path — no drift between initial and retry.
    fireEvent.click(screen.getByRole("button", { name: /^retry$/i }));

    // After the retry resolves, children render.
    await waitFor(() => {
      expect(screen.getByTestId("catalog-children")).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: /couldn't load your library/i })).not.toBeInTheDocument();
  });

  it("keeps the failure screen and refreshes detail when Retry fails again", async () => {
    listProjectsMock
      .mockRejectedValueOnce(new Error("first-attempt failure"))
      .mockRejectedValueOnce(new Error("second-attempt failure"));

    render(
      <AppProviders>
        <p data-testid="catalog-children">app content</p>
      </AppProviders>
    );

    // Wait for the initial failure render.
    await waitFor(() => {
      expect(screen.getByText("first-attempt failure")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^retry$/i }));

    // Failure screen remains, but the detail is updated to the new error.
    await waitFor(() => {
      expect(screen.getByText("second-attempt failure")).toBeInTheDocument();
    });
    expect(screen.queryByText("first-attempt failure")).not.toBeInTheDocument();
    expect(screen.queryByTestId("catalog-children")).not.toBeInTheDocument();
  });

  it("treats startup sync failure as non-fatal and still renders children", async () => {
    listProjectsMock.mockResolvedValue([]);
    startupSyncMock.mockRejectedValue(new Error("supabase unreachable"));

    render(
      <AppProviders>
        <p data-testid="catalog-children">app content</p>
      </AppProviders>
    );

    // Children render — local-first: sync failure must not block the app.
    await waitFor(() => {
      expect(screen.getByTestId("catalog-children")).toBeInTheDocument();
    });

    // No failure screen.
    expect(screen.queryByRole("heading", { name: /couldn't load your library/i })).not.toBeInTheDocument();
  });
});
