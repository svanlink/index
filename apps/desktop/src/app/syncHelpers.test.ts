import { describe, expect, it } from "vitest";
import { getSyncStatusLabel, getSyncSummaryMessages, isSyncEnabled } from "./syncHelpers";

describe("syncHelpers", () => {
  it("reports disabled sync when no remote transport is configured", () => {
    const state = {
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

    expect(isSyncEnabled(state)).toBe(false);
    expect(getSyncStatusLabel(state)).toBe("Sync disabled");
    expect(getSyncSummaryMessages(state)[0]).toContain("disabled");
  });

  it("surfaces retry-needed messaging for failed queued items", () => {
    const state = {
      mode: "remote-ready" as const,
      pendingCount: 2,
      queuedCount: 3,
      failedCount: 1,
      inFlightCount: 0,
      syncInProgress: false,
      lastPushAt: "2026-04-06T15:00:00.000Z",
      lastPullAt: "2026-04-06T15:01:00.000Z",
      lastError: "Network timeout",
      lastSyncError: "Network timeout",
      remoteCursor: "2026-04-06T15:01:00.000Z",
      conflictPolicy: "updated-at-last-write-wins-local-tie-break" as const
    };

    expect(getSyncStatusLabel(state)).toBe("Retry needed");
    expect(getSyncSummaryMessages(state).join(" ")).toContain("failed");
  });
});
