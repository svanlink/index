import { describe, expect, it } from "vitest";
import type { Drive, Project } from "@drive-project-catalog/domain";
import { buildStoragePlanningRows, buildStoragePlanningSummary } from "./storagePlanningSelectors";

function makeDrive(overrides: Partial<Drive>): Drive {
  return {
    id: "drive-default",
    volumeName: "Drive",
    displayName: "Drive",
    totalCapacityBytes: 1_000,
    usedBytes: 500,
    freeBytes: 500,
    reservedIncomingBytes: 0,
    lastScannedAt: null,
    createdManually: false,
    createdAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:00.000Z",
    ...overrides
  };
}

function makeProject(overrides: Partial<Project>): Project {
  return {
    id: "project-default",
    parsedDate: "260406",
    parsedClient: "Client",
    parsedProject: "Project",
    correctedClient: null,
    correctedProject: null,
    category: "photo",
    sizeBytes: 100,
    sizeStatus: "ready",
    currentDriveId: "drive-a",
    targetDriveId: null,
    moveStatus: "none",
    missingStatus: "normal",
    duplicateStatus: "normal",
    isUnassigned: true,
    isManual: false,
    lastSeenAt: null,
    lastScannedAt: null,
    createdAt: "2026-04-06T00:00:00.000Z",
    updatedAt: "2026-04-06T00:00:00.000Z",
    ...overrides
  };
}

describe("storagePlanningSelectors", () => {
  it("sorts overcommitted drives first and includes move breakdowns", () => {
    const drives = [
      makeDrive({ id: "drive-a", displayName: "Drive A", freeBytes: 400 }),
      makeDrive({ id: "drive-b", displayName: "Drive B", freeBytes: 50 })
    ];
    const projects = [
      makeProject({ id: "incoming-a-1", currentDriveId: "drive-b", targetDriveId: "drive-a", moveStatus: "pending", sizeBytes: 150, isUnassigned: false }),
      makeProject({ id: "incoming-a-2", currentDriveId: "drive-b", targetDriveId: "drive-a", moveStatus: "pending", sizeBytes: null, sizeStatus: "unknown", isUnassigned: false }),
      makeProject({ id: "incoming-b", currentDriveId: "drive-a", targetDriveId: "drive-b", moveStatus: "pending", sizeBytes: 80, isUnassigned: false }),
      makeProject({ id: "outgoing-a", currentDriveId: "drive-a", targetDriveId: "drive-b", moveStatus: "pending", sizeBytes: 25, isUnassigned: false })
    ];

    const rows = buildStoragePlanningRows(drives, projects);

    expect(rows[0]?.drive.id).toBe("drive-b");
    expect(rows[0]?.health).toBe("overcommitted");
    expect(rows[1]?.drive.id).toBe("drive-a");
    expect(rows[1]?.unknownIncomingCount).toBe(1);
    expect(rows[1]?.pendingIncomingMoveCount).toBe(2);
    expect(rows[1]?.pendingOutgoingMoveCount).toBe(2);
  });

  it("builds the planning summary from rows and projects", () => {
    const drives = [
      makeDrive({ id: "drive-a", displayName: "Drive A", freeBytes: 400 }),
      makeDrive({ id: "drive-b", displayName: "Drive B", freeBytes: 50 })
    ];
    const projects = [
      makeProject({ id: "incoming-a", currentDriveId: "drive-a", targetDriveId: "drive-a", moveStatus: "pending", sizeBytes: null, sizeStatus: "unknown", isUnassigned: false }),
      makeProject({ id: "incoming-b", currentDriveId: "drive-b", targetDriveId: "drive-b", moveStatus: "pending", sizeBytes: 80, isUnassigned: false }),
      makeProject({ id: "unassigned", currentDriveId: null, isUnassigned: true })
    ];

    const rows = buildStoragePlanningRows(drives, projects);
    const summary = buildStoragePlanningSummary(rows, projects);

    expect(summary.totalDrives).toBe(2);
    expect(summary.overcommittedCount).toBe(1);
    expect(summary.unknownImpactCount).toBe(1);
    expect(summary.unassignedProjectCount).toBe(1);
  });
});
