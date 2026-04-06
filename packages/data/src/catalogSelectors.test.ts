import { describe, expect, it } from "vitest";
import { buildDashboardSnapshot } from "./catalogSelectors";
import { mockCatalogSnapshot } from "./mockData";

describe("catalogSelectors", () => {
  it("uses persisted scan sessions for recent dashboard scans", () => {
    const snapshot = structuredClone(mockCatalogSnapshot);
    snapshot.scanSessions = [
      {
        ...snapshot.scanSessions[0]!,
        scanId: "scan-interrupted-latest",
        driveName: "Ghost Drive",
        requestedDriveId: null,
        requestedDriveName: "Ghost Drive",
        status: "interrupted",
        startedAt: "2026-04-06T09:00:00.000Z",
        finishedAt: "2026-04-06T09:02:00.000Z",
        summary: null
      },
      ...snapshot.scanSessions
    ];

    const dashboard = buildDashboardSnapshot(snapshot);

    expect(dashboard.recentScans[0]?.id).toBe("scan-interrupted-latest");
    expect(dashboard.recentScans[0]?.driveName).toBe("Ghost Drive");
  });
});
