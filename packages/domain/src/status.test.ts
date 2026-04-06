import { describe, expect, it } from "vitest";
import type { Drive } from "./drive";
import type { Project } from "./project";
import {
  calculateReservedIncomingBytes,
  getDisplayClient,
  getDisplayProject,
  getDriveCapacitySnapshot,
  getProjectStatusLabels
} from "./status";

const drive: Drive = {
  id: "drive-b",
  volumeName: "Drive B",
  displayName: "Drive B",
  totalCapacityBytes: 1_000,
  usedBytes: 600,
  freeBytes: 400,
  reservedIncomingBytes: 0,
  lastScannedAt: null,
  createdManually: false,
  createdAt: "2026-04-06T00:00:00.000Z",
  updatedAt: "2026-04-06T00:00:00.000Z"
};

const baseProject: Project = {
  id: "project-1",
  parsedDate: "240401",
  parsedClient: "Apple",
  parsedProject: "Shoot",
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
  isUnassigned: false,
  isManual: false,
  lastSeenAt: null,
  lastScannedAt: null,
  createdAt: "2026-04-06T00:00:00.000Z",
  updatedAt: "2026-04-06T00:00:00.000Z"
};

describe("status helpers", () => {
  it("prefers corrected display values", () => {
    const correctedProject: Project = {
      ...baseProject,
      correctedClient: "Apple Inc",
      correctedProject: "Apple Product Shoot"
    };

    expect(getDisplayClient(correctedProject)).toBe("Apple Inc");
    expect(getDisplayProject(correctedProject)).toBe("Apple Product Shoot");
  });

  it("derives project labels from status flags", () => {
    const flaggedProject: Project = {
      ...baseProject,
      isUnassigned: true,
      moveStatus: "pending",
      targetDriveId: "drive-b",
      sizeBytes: null,
      missingStatus: "missing",
      duplicateStatus: "duplicate"
    };

    expect(getProjectStatusLabels(flaggedProject)).toEqual([
      "Unassigned",
      "Move pending",
      "Missing",
      "Duplicate",
      "Unknown size impact"
    ]);
  });

  it("derives drive reservations from pending projects", () => {
    const projects: Project[] = [
      { ...baseProject, targetDriveId: "drive-b", moveStatus: "pending", sizeBytes: 100 },
      { ...baseProject, id: "project-2", targetDriveId: "drive-b", moveStatus: "pending", sizeBytes: null },
      { ...baseProject, id: "project-3", targetDriveId: "drive-c", moveStatus: "pending", sizeBytes: 50 }
    ];

    expect(calculateReservedIncomingBytes(projects, "drive-b")).toBe(100);
    expect(getDriveCapacitySnapshot(drive, projects)).toEqual({
      reservedIncomingBytes: 100,
      remainingFreeBytes: 300,
      hasUnknownIncoming: true
    });
  });
});
