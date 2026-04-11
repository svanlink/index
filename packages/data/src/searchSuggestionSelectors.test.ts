import { describe, expect, it } from "vitest";
import type { Drive, Project } from "@drive-project-catalog/domain";
import { buildProjectSearchSuggestions, mockDrives, mockProjects, UNASSIGNED_DRIVE_FILTER_VALUE } from "./index";

// ---------------------------------------------------------------------------
// Fixtures for personal_folder tests
// ---------------------------------------------------------------------------

const basePersonalFolder: Project = {
  id: "project-tutorials",
  folderType: "personal_folder",
  isStandardized: false,
  folderName: "Tutorials",
  folderPath: "/Volumes/Drive A/Tutorials",
  parsedDate: null,
  parsedClient: null,
  parsedProject: null,
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

const testDrive: Drive = {
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

describe("searchSuggestionSelectors", () => {
  it("prioritizes prefix matches and groups suggestions", () => {
    const groups = buildProjectSearchSuggestions(mockProjects, mockDrives, "ad", {});

    expect(groups.map((group) => group.label)).toEqual(["Clients", "Projects"]);
    expect(groups[0]?.suggestions[0]?.label).toBe("Adidas");
    expect(groups[0]?.suggestions[0]?.matchType).toBe("prefix");
    expect(groups[1]?.suggestions.some((suggestion) => suggestion.label === "Adidas Social")).toBe(true);
  });

  it("respects active non-search filters when building suggestions", () => {
    const groups = buildProjectSearchSuggestions(mockProjects, mockDrives, "ad", {
      currentDriveId: UNASSIGNED_DRIVE_FILTER_VALUE,
      showMovePending: true
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]?.suggestions.every((suggestion) => suggestion.label.includes("Adidas"))).toBe(true);
    expect(groups[1]?.suggestions.every((suggestion) => suggestion.label.includes("Adidas"))).toBe(true);
  });
});

describe("searchSuggestionSelectors — personal_folder handling", () => {
  it("surfaces personal_folder folderName in the Projects group, not Clients", () => {
    const groups = buildProjectSearchSuggestions([basePersonalFolder], [testDrive], "tut", {});

    const clientGroup = groups.find((g) => g.key === "clients");
    const projectGroup = groups.find((g) => g.key === "projects");

    // folderName must NOT appear as a client suggestion
    expect(clientGroup).toBeUndefined();

    // folderName MUST appear as a project suggestion
    expect(projectGroup).toBeDefined();
    expect(projectGroup!.suggestions.some((s) => s.label === "Tutorials")).toBe(true);
  });

  it("does not emit a client suggestion for any personal_folder entry", () => {
    const personalFolders: Project[] = ["Tutorials", "LUTs", "Exports_old", "RandomFolder"].map(
      (name, i) => ({ ...basePersonalFolder, id: `pf-${i}`, folderName: name })
    );

    for (const project of personalFolders) {
      const groups = buildProjectSearchSuggestions([project], [testDrive], project.folderName.toLowerCase().slice(0, 3), {});
      const clientGroup = groups.find((g) => g.key === "clients");
      expect(clientGroup).toBeUndefined();
    }
  });

  it("still emits a client suggestion for a reclassified personal_folder with correctedClient", () => {
    const reclassified: Project = {
      ...basePersonalFolder,
      correctedClient: "Sony Pictures"
    };

    const groups = buildProjectSearchSuggestions([reclassified], [testDrive], "sony", {});
    const clientGroup = groups.find((g) => g.key === "clients");

    expect(clientGroup).toBeDefined();
    expect(clientGroup!.suggestions.some((s) => s.label === "Sony Pictures")).toBe(true);
  });

  it("emits a project suggestion for a personal_folder with correctedProject", () => {
    const reclassified: Project = {
      ...basePersonalFolder,
      correctedProject: "Motion Graphics Library"
    };

    const groups = buildProjectSearchSuggestions([reclassified], [testDrive], "motion", {});
    const projectGroup = groups.find((g) => g.key === "projects");

    expect(projectGroup).toBeDefined();
    expect(projectGroup!.suggestions.some((s) => s.label === "Motion Graphics Library")).toBe(true);
  });

  it("includes personal_folder entries in search results alongside structured entries", () => {
    const structured: Project = {
      ...basePersonalFolder,
      id: "project-structured",
      folderType: "client",
      isStandardized: true,
      folderName: "240401_Apple_ProductShoot",
      parsedDate: "240401",
      parsedClient: "Apple",
      parsedProject: "ProductShoot"
    };

    // Search for something only "Tutorials" matches
    const tutGroups = buildProjectSearchSuggestions([structured, basePersonalFolder], [testDrive], "tut", {});
    const tutProject = tutGroups.find((g) => g.key === "projects")?.suggestions.find((s) => s.label === "Tutorials");
    expect(tutProject).toBeDefined();

    // Search for something only "Apple" matches
    const appleGroups = buildProjectSearchSuggestions([structured, basePersonalFolder], [testDrive], "app", {});
    const appleClient = appleGroups.find((g) => g.key === "clients")?.suggestions.find((s) => s.label === "Apple");
    expect(appleClient).toBeDefined();
  });
});
