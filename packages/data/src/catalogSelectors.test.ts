import { describe, expect, it } from "vitest";
import {
  buildDashboardSnapshot,
  buildDriveNameMap,
  filterProjects,
  getDriveNameFromMap
} from "./catalogSelectors";
import { mockCatalogSnapshot, mockDrives, mockProjects } from "./mockData";

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

  describe("buildDriveNameMap / getDriveNameFromMap", () => {
    it("builds a driveId → displayName lookup", () => {
      const map = buildDriveNameMap(mockDrives);

      for (const drive of mockDrives) {
        expect(map.get(drive.id)).toBe(drive.displayName);
      }
    });

    it("returns 'Unassigned' for null driveId", () => {
      const map = buildDriveNameMap(mockDrives);
      expect(getDriveNameFromMap(map, null)).toBe("Unassigned");
    });

    it("returns 'Unknown drive' for an unrecognised id", () => {
      const map = buildDriveNameMap(mockDrives);
      expect(getDriveNameFromMap(map, "drive-does-not-exist")).toBe("Unknown drive");
    });
  });

  describe("filterProjects search (H13)", () => {
    it("matches projects by their current drive's displayName via the drive-name map", () => {
      const targetDrive = mockDrives[0];
      expect(targetDrive).toBeDefined();

      const query = targetDrive!.displayName.toLowerCase();
      const filtered = filterProjects(mockProjects, mockDrives, { search: query });

      // Every match must belong to the drive whose displayName we searched for,
      // OR have it as a target drive — i.e. the drive name ended up in the haystack.
      expect(filtered.length).toBeGreaterThan(0);
      for (const project of filtered) {
        const hits =
          project.currentDriveId === targetDrive!.id ||
          project.targetDriveId === targetDrive!.id;
        expect(hits).toBe(true);
      }
    });

    it("search still works when drives array is empty (haystack gracefully degrades)", () => {
      const filtered = filterProjects(mockProjects, [], {
        search: mockProjects[0]!.folderName.slice(0, 4).toLowerCase()
      });
      expect(filtered.length).toBeGreaterThan(0);
    });
  });
});
