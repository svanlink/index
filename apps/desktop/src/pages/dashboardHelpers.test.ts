import { describe, expect, it } from "vitest";
import type { Drive, Project } from "@drive-project-catalog/domain";
import { getDriveName, getProjectName } from "./dashboardHelpers";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const drive: Drive = {
  id: "drive-a",
  volumeName: "Drive A",
  displayName: "Drive A",
  totalCapacityBytes: null,
  usedBytes: null,
  freeBytes: null,
  reservedIncomingBytes: 0,
  lastScannedAt: null,
  createdManually: false,
  createdAt: "2026-04-08T00:00:00.000Z",
  updatedAt: "2026-04-08T00:00:00.000Z"
};

const baseProject: Project = {
  id: "project-1",
  folderType: "client",
  isStandardized: true,
  folderName: "240401_Apple_ProductShoot",
  folderPath: "/Volumes/Drive A/240401_Apple_ProductShoot",
  parsedDate: "240401",
  parsedClient: "Apple",
  parsedProject: "ProductShoot",
  correctedDate: null,
  correctedClient: null,
  correctedProject: null,
  category: null,
  sizeBytes: null,
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
  createdAt: "2026-04-08T00:00:00.000Z",
  updatedAt: "2026-04-08T00:00:00.000Z"
};

// ---------------------------------------------------------------------------
// Case E — getProjectName must never return blank
// ---------------------------------------------------------------------------

describe("getProjectName — display fallback", () => {
  it("returns parsedProject for a standard client folder", () => {
    expect(getProjectName(baseProject)).toBe("ProductShoot");
  });

  it("returns correctedProject when set, overriding parsedProject", () => {
    const corrected: Project = { ...baseProject, correctedProject: "Apple Product Shoot" };
    expect(getProjectName(corrected)).toBe("Apple Product Shoot");
  });

  it("returns folderName for personal_folder — never blank", () => {
    const personal: Project = {
      ...baseProject,
      folderType: "personal_folder",
      isStandardized: false,
      folderName: "Tutorials",
      parsedDate: null,
      parsedClient: null,
      parsedProject: null
    };
    expect(getProjectName(personal)).toBe("Tutorials");
  });

  it("returns folderName for other non-standard folders (LUTs, Exports_old, RandomFolder)", () => {
    for (const name of ["LUTs", "Exports_old", "RandomFolder"]) {
      const project: Project = {
        ...baseProject,
        folderType: "personal_folder",
        isStandardized: false,
        folderName: name,
        parsedDate: null,
        parsedClient: null,
        parsedProject: null
      };
      expect(getProjectName(project)).toBe(name);
      expect(getProjectName(project)).not.toBe("");
    }
  });

  it("correctedProject wins over folderName for a reclassified personal_folder", () => {
    const reclassified: Project = {
      ...baseProject,
      folderType: "personal_folder",
      isStandardized: false,
      folderName: "Tutorials",
      parsedDate: null,
      parsedClient: null,
      parsedProject: null,
      correctedProject: "Motion Graphics Library"
    };
    expect(getProjectName(reclassified)).toBe("Motion Graphics Library");
  });
});

// ---------------------------------------------------------------------------
// getDriveName — delegation to getDriveNameById
// ---------------------------------------------------------------------------

describe("getDriveName", () => {
  it("returns the drive displayName when found", () => {
    expect(getDriveName([drive], "drive-a")).toBe("Drive A");
  });

  it("returns 'Unassigned' when driveId is null", () => {
    expect(getDriveName([drive], null)).toBe("Unassigned");
  });

  it("returns 'Unknown drive' when driveId is not found", () => {
    expect(getDriveName([drive], "drive-does-not-exist")).toBe("Unknown drive");
  });
});
