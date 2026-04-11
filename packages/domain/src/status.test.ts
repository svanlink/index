import { describe, expect, it } from "vitest";
import type { Drive } from "./drive";
import type { Project } from "./project";
import {
  applyDerivedProjectStates,
  calculateReservedIncomingBytes,
  getDisplayClient,
  getDisplayDate,
  getDisplayProject,
  getDriveCapacitySnapshot,
  getParsedFolderName,
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
  folderType: "client",
  isStandardized: true,
  folderName: "240401_Apple_Shoot",
  folderPath: null,
  parsedDate: "240401",
  parsedClient: "Apple",
  parsedProject: "Shoot",
  correctedDate: null,
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

const personalFolderProject: Project = {
  ...baseProject,
  id: "project-tutorials",
  folderType: "personal_folder",
  isStandardized: false,
  folderName: "Tutorials",
  parsedDate: null,
  parsedClient: null,
  parsedProject: null,
  correctedDate: null,
  correctedClient: null,
  correctedProject: null
};

// ---------------------------------------------------------------------------
// Display helpers — null parsed fields must not crash or render garbage
// ---------------------------------------------------------------------------

describe("display helpers with null parsed fields (personal_folder)", () => {
  it("getDisplayDate returns null when both correctedDate and parsedDate are null", () => {
    expect(getDisplayDate(personalFolderProject)).toBeNull();
  });

  it("getDisplayDate prefers correctedDate over parsedDate", () => {
    const withCorrected: Project = { ...baseProject, correctedDate: "260101", parsedDate: "240101" };
    expect(getDisplayDate(withCorrected)).toBe("260101");
  });

  it("getDisplayDate falls back to parsedDate when correctedDate is null", () => {
    const withParsed: Project = { ...baseProject, correctedDate: null, parsedDate: "240101" };
    expect(getDisplayDate(withParsed)).toBe("240101");
  });

  it("getDisplayClient falls back to folderName when parsedClient is null", () => {
    expect(getDisplayClient(personalFolderProject)).toBe("Tutorials");
  });

  it("getDisplayClient prefers correctedClient over parsedClient", () => {
    const corrected: Project = { ...baseProject, correctedClient: "Apple Inc", parsedClient: "Apple" };
    expect(getDisplayClient(corrected)).toBe("Apple Inc");
  });

  it("getDisplayProject returns folderName when parsedProject and correctedProject are null", () => {
    expect(getDisplayProject(personalFolderProject)).toBe(personalFolderProject.folderName);
  });

  it("getDisplayProject prefers correctedProject over parsedProject", () => {
    const corrected: Project = { ...baseProject, correctedProject: "Apple Product Shoot", parsedProject: "ProductShoot" };
    expect(getDisplayProject(corrected)).toBe("Apple Product Shoot");
  });

  it("getParsedFolderName returns folderName for personal_folder", () => {
    expect(getParsedFolderName(personalFolderProject)).toBe("Tutorials");
  });

  it("getParsedFolderName returns YYMMDD_Client_Project for structured entries", () => {
    expect(getParsedFolderName(baseProject)).toBe("240401_Apple_Shoot");
  });
});

// ---------------------------------------------------------------------------
// Duplicate bucketing — personal_folder uses folderName key
// ---------------------------------------------------------------------------

describe("duplicate detection with mixed folder types", () => {
  it("does not flag two personal_folders with different names as duplicates", () => {
    const tutorials: Project = {
      ...personalFolderProject,
      id: "project-tutorials",
      currentDriveId: "drive-a"
    };
    const luts: Project = {
      ...personalFolderProject,
      id: "project-luts",
      folderName: "LUTs",
      currentDriveId: "drive-b"
    };

    const result = applyDerivedProjectStates([tutorials, luts]);
    expect(result.every((p) => p.duplicateStatus === "normal")).toBe(true);
  });

  it("flags two personal_folders with the same name on different drives as duplicates", () => {
    const onDriveA: Project = { ...personalFolderProject, id: "project-tutorials-a", currentDriveId: "drive-a" };
    const onDriveB: Project = { ...personalFolderProject, id: "project-tutorials-b", currentDriveId: "drive-b" };

    const result = applyDerivedProjectStates([onDriveA, onDriveB]);
    expect(result.every((p) => p.duplicateStatus === "duplicate")).toBe(true);
  });

  it("does not flag two copies on the same drive as duplicates", () => {
    const onDriveA1: Project = { ...personalFolderProject, id: "project-tutorials-a1", currentDriveId: "drive-a" };
    const onDriveA2: Project = { ...personalFolderProject, id: "project-tutorials-a2", currentDriveId: "drive-a" };

    const result = applyDerivedProjectStates([onDriveA1, onDriveA2]);
    expect(result.every((p) => p.duplicateStatus === "normal")).toBe(true);
  });
});

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
