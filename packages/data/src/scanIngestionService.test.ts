import { describe, expect, it } from "vitest";
import type { ScanSessionSnapshot } from "@drive-project-catalog/domain";
import { mockCatalogSnapshot } from "./mockData";
import { ingestScanSessionSnapshot } from "./scanIngestionService";

describe("ingestScanSessionSnapshot", () => {
  it("creates or updates scanned projects and stores the scan session", () => {
    const session: ScanSessionSnapshot = {
      scanId: "scan-drive-a-20260406",
      rootPath: "/Volumes/Drive A",
      driveName: "Drive A",
      status: "completed",
      startedAt: "2026-04-06T09:00:00.000Z",
      finishedAt: "2026-04-06T09:05:00.000Z",
      foldersScanned: 8,
      matchesFound: 1,
      error: null,
      sizeJobsPending: 0,
      createdAt: "2026-04-06T09:00:00.000Z",
      updatedAt: "2026-04-06T09:05:00.000Z",
      projects: [
        {
          id: "scan-project-1",
          folderName: "240401_Apple_ProductShoot",
          folderPath: "/Volumes/Drive A/240401_Apple_ProductShoot",
          relativePath: "240401_Apple_ProductShoot",
          parsedDate: "240401",
          parsedClient: "Apple",
          parsedProject: "ProductShoot",
          sourceDriveName: "Drive A",
          scanTimestamp: "2026-04-06T09:03:00.000Z",
          sizeStatus: "ready",
          sizeBytes: 125_000_000_000,
          sizeError: null
        }
      ]
    };

    const result = ingestScanSessionSnapshot(mockCatalogSnapshot, session);
    const updatedProject = result.snapshot.projects.find((project) => project.id === "project-240401-apple-shoot");

    expect(updatedProject?.sizeBytes).toBe(125_000_000_000);
    expect(updatedProject?.lastSeenAt).toBe("2026-04-06T09:03:00.000Z");
    expect(result.snapshot.scans.some((scan) => scan.id === session.scanId)).toBe(true);
    expect(result.snapshot.scanSessions.some((entry) => entry.scanId === session.scanId)).toBe(true);
    expect(result.snapshot.projectScanEvents.some((event) => event.scanId === session.scanId)).toBe(true);
    expect(result.session.summary?.updatedProjectsCount).toBe(1);
    expect(result.session.summary?.durationMs).toBe(300000);
  });

  it("marks previously seen projects as missing when a drive scan completes without them", () => {
    const session: ScanSessionSnapshot = {
      scanId: "scan-drive-b-20260406",
      rootPath: "/Volumes/Drive B",
      driveName: "Drive B",
      status: "completed",
      startedAt: "2026-04-06T11:00:00.000Z",
      finishedAt: "2026-04-06T11:05:00.000Z",
      foldersScanned: 4,
      matchesFound: 0,
      error: null,
      sizeJobsPending: 0,
      createdAt: "2026-04-06T11:00:00.000Z",
      updatedAt: "2026-04-06T11:05:00.000Z",
      projects: []
    };

    const result = ingestScanSessionSnapshot(mockCatalogSnapshot, session);
    const missingProject = result.snapshot.projects.find((project) => project.id === "project-240320-nike-ad");

    expect(missingProject?.missingStatus).toBe("missing");
    expect(missingProject?.currentDriveId).toBe("drive-b");
    expect(result.session.summary?.missingProjectsCount).toBeGreaterThan(0);
  });
});
