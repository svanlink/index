import { describe, expect, it } from "vitest";
import type { Project } from "@drive-project-catalog/domain";
import { mockDrives, mockProjects } from "./mockData";
import { filterProjectCatalog, UNASSIGNED_DRIVE_FILTER_VALUE } from "./projectListSelectors";

// A personal_folder entry used across multiple search/filter tests
const personalFolderProject: Project = {
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
  sizeBytes: 5_000_000,
  sizeStatus: "ready",
  currentDriveId: "drive-a",
  targetDriveId: null,
  moveStatus: "none",
  missingStatus: "normal",
  duplicateStatus: "normal",
  isUnassigned: false,
  isManual: false,
  lastSeenAt: "2026-04-08T09:00:00.000Z",
  lastScannedAt: "2026-04-08T09:00:00.000Z",
  createdAt: "2026-04-08T09:00:00.000Z",
  updatedAt: "2026-04-08T09:00:00.000Z"
};

const allProjects = [...mockProjects, personalFolderProject];

describe("projectListSelectors", () => {
  it("combines drive and move-pending filters", () => {
    const filtered = filterProjectCatalog(mockProjects, mockDrives, {
      currentDriveId: "drive-b",
      showMovePending: true
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("project-240320-nike-ad");
  });

  it("supports search and category filtering together", () => {
    const filtered = filterProjectCatalog(mockProjects, mockDrives, {
      search: "adidas",
      category: "design"
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("project-240215-adidas-social");
  });

  // -------------------------------------------------------------------------
  // M10 — UNASSIGNED_DRIVE_FILTER_VALUE sentinel
  // -------------------------------------------------------------------------

  it("exposes UNASSIGNED_DRIVE_FILTER_VALUE as the shared sentinel", () => {
    expect(UNASSIGNED_DRIVE_FILTER_VALUE).toBe("__unassigned__");
  });

  it("filters to projects with no current drive when currentDriveId is the unassigned sentinel", () => {
    // Synthetic unassigned project so the expectation doesn't depend on
    // whether any mockProjects happen to be null-assigned.
    const unassignedProject: Project = {
      ...personalFolderProject,
      id: "project-unassigned-a",
      folderName: "Unassigned Alpha",
      currentDriveId: null
    };
    const corpus: Project[] = [...mockProjects, unassignedProject];

    const filtered = filterProjectCatalog(corpus, mockDrives, {
      currentDriveId: UNASSIGNED_DRIVE_FILTER_VALUE
    });

    expect(filtered.length).toBeGreaterThan(0);
    for (const project of filtered) {
      expect(project.currentDriveId).toBeNull();
    }
    expect(filtered.some((p) => p.id === "project-unassigned-a")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // folderName search — personal_folder entries must be discoverable
  // -------------------------------------------------------------------------

  it("finds a personal_folder entry by its raw folderName", () => {
    const filtered = filterProjectCatalog(allProjects, mockDrives, {
      search: "Tutorials"
    });

    expect(filtered.some((p) => p.id === "project-tutorials")).toBe(true);
  });

  it("finds a personal_folder entry by a partial folderName match", () => {
    const filtered = filterProjectCatalog(allProjects, mockDrives, {
      search: "torial"
    });

    expect(filtered.some((p) => p.id === "project-tutorials")).toBe(true);
  });

  it("search is case-insensitive for folderName", () => {
    const filtered = filterProjectCatalog(allProjects, mockDrives, {
      search: "TUTORIALS"
    });

    expect(filtered.some((p) => p.id === "project-tutorials")).toBe(true);
  });

  it("does not crash when all parsed fields are null", () => {
    expect(() =>
      filterProjectCatalog([personalFolderProject], mockDrives, { search: "anything" })
    ).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // folderType filter
  // -------------------------------------------------------------------------

  it("filters by folderType: client", () => {
    const filtered = filterProjectCatalog(allProjects, mockDrives, {
      folderType: "client"
    });

    expect(filtered.every((p) => p.folderType === "client")).toBe(true);
    expect(filtered.some((p) => p.folderType === "personal_folder")).toBe(false);
  });

  it("filters by folderType: personal_project", () => {
    const filtered = filterProjectCatalog(allProjects, mockDrives, {
      folderType: "personal_project"
    });

    expect(filtered.every((p) => p.folderType === "personal_project")).toBe(true);
  });

  it("filters by folderType: personal_folder", () => {
    const filtered = filterProjectCatalog(allProjects, mockDrives, {
      folderType: "personal_folder"
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("project-tutorials");
  });

  it("empty folderType string returns all entries", () => {
    const filtered = filterProjectCatalog(allProjects, mockDrives, { folderType: "" });

    expect(filtered).toHaveLength(allProjects.length);
  });

  it("combines folderType filter with search", () => {
    // Only personal_project entries that also match "archive"
    const filtered = filterProjectCatalog(allProjects, mockDrives, {
      folderType: "personal_project",
      search: "archive"
    });

    expect(filtered.every((p) => p.folderType === "personal_project")).toBe(true);
    expect(filtered.every((p) => p.folderName.toLowerCase().includes("archive"))).toBe(true);
  });
});
