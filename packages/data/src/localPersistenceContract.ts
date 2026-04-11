import { describe, expect, it, beforeEach } from "vitest";
import type {
  Drive,
  Project,
  ProjectScanEvent,
  ScanRecord,
  ScanSessionSnapshot
} from "@drive-project-catalog/domain";
import type { CatalogSnapshot, LocalPersistenceAdapter } from "./localPersistence";

/**
 * Shared contract-test suite for LocalPersistenceAdapter implementations.
 *
 * All three adapters (InMemoryLocalPersistence, StorageLocalPersistence,
 * SqliteLocalPersistence) must pass these tests identically. This enforces
 * behavioural parity across storage backends and guards against drift
 * regressions like H3 (scan_session cascade mismatch on deleteDrive).
 *
 * Usage:
 *   describeLocalPersistenceContract("InMemory", async (seed) =>
 *     new InMemoryLocalPersistence(seed));
 *
 * The factory receives a freshly-cloned deterministic seed and returns an
 * adapter whose state is that seed. It runs once per test.
 */
export function describeLocalPersistenceContract(
  factoryName: string,
  createAdapter: (seed: CatalogSnapshot) => Promise<LocalPersistenceAdapter>
): void {
  describe(`LocalPersistenceAdapter contract — ${factoryName}`, () => {
    let adapter: LocalPersistenceAdapter;

    beforeEach(async () => {
      adapter = await createAdapter(buildContractFixture());
    });

    describe("readSnapshot / replaceSnapshot", () => {
      it("returns every entity the factory was seeded with", async () => {
        const snapshot = await adapter.readSnapshot();

        expect(snapshot.drives.map((d) => d.id).sort()).toEqual([
          "drive-alpha",
          "drive-beta"
        ]);
        expect(snapshot.projects.map((p) => p.id).sort()).toEqual([
          "project-alpha-1",
          "project-alpha-2",
          "project-beta-1"
        ]);
        expect(snapshot.scans.map((s) => s.id).sort()).toEqual([
          "scan-alpha-1",
          "scan-beta-1"
        ]);
        expect(snapshot.projectScanEvents.map((e) => e.id).sort()).toEqual([
          "event-alpha-1",
          "event-beta-1"
        ]);
        expect(snapshot.scanSessions.map((s) => s.scanId).sort()).toEqual([
          "session-alpha",
          "session-beta",
          "session-orphan"
        ]);
      });

      it("replaceSnapshot overwrites the entire catalog atomically", async () => {
        const nextDrive: Drive = {
          id: "drive-omega",
          volumeName: "Omega",
          displayName: "Omega Drive",
          totalCapacityBytes: 2_000_000,
          usedBytes: 100_000,
          freeBytes: 1_900_000,
          reservedIncomingBytes: 0,
          lastScannedAt: null,
          createdManually: false,
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:00:00.000Z"
        };

        await adapter.replaceSnapshot({
          drives: [nextDrive],
          projects: [],
          scans: [],
          projectScanEvents: [],
          scanSessions: []
        });

        const snapshot = await adapter.readSnapshot();
        expect(snapshot.drives).toHaveLength(1);
        expect(snapshot.drives[0]?.id).toBe("drive-omega");
        expect(snapshot.projects).toEqual([]);
        expect(snapshot.scans).toEqual([]);
        expect(snapshot.projectScanEvents).toEqual([]);
        expect(snapshot.scanSessions).toEqual([]);
      });
    });

    describe("list* and get*ById", () => {
      it("listDrives / listProjects / listScans return the expected ids", async () => {
        expect((await adapter.listDrives()).map((d) => d.id).sort()).toEqual([
          "drive-alpha",
          "drive-beta"
        ]);
        expect((await adapter.listProjects()).map((p) => p.id).sort()).toEqual([
          "project-alpha-1",
          "project-alpha-2",
          "project-beta-1"
        ]);
        expect((await adapter.listScans()).map((s) => s.id).sort()).toEqual([
          "scan-alpha-1",
          "scan-beta-1"
        ]);
      });

      it("listProjectScanEvents filters by projectId when provided", async () => {
        const allEvents = await adapter.listProjectScanEvents();
        expect(allEvents.map((e) => e.id).sort()).toEqual([
          "event-alpha-1",
          "event-beta-1"
        ]);

        const alphaOnly = await adapter.listProjectScanEvents("project-alpha-1");
        expect(alphaOnly).toHaveLength(1);
        expect(alphaOnly[0]?.id).toBe("event-alpha-1");

        const missing = await adapter.listProjectScanEvents("project-does-not-exist");
        expect(missing).toEqual([]);
      });

      it("listScanSessions returns every seeded session with its embedded projects", async () => {
        const sessions = await adapter.listScanSessions();
        const byId = new Map(sessions.map((s) => [s.scanId, s] as const));

        expect(byId.size).toBe(3);

        const alpha = byId.get("session-alpha");
        expect(alpha?.requestedDriveId).toBe("drive-alpha");
        expect(alpha?.projects.map((p) => p.id)).toEqual([
          "session-alpha-project-1"
        ]);

        const beta = byId.get("session-beta");
        expect(beta?.requestedDriveId).toBe("drive-beta");
        expect(beta?.projects.map((p) => p.id)).toEqual([
          "session-beta-project-1"
        ]);

        const orphan = byId.get("session-orphan");
        expect(orphan?.requestedDriveId).toBeNull();
        expect(orphan?.projects.map((p) => p.id)).toEqual([
          "session-orphan-project-1"
        ]);
      });

      it("getDriveById / getProjectById / getScanSession return null for missing ids", async () => {
        expect(await adapter.getDriveById("drive-alpha")).not.toBeNull();
        expect(await adapter.getDriveById("drive-missing")).toBeNull();

        expect(await adapter.getProjectById("project-alpha-1")).not.toBeNull();
        expect(await adapter.getProjectById("project-missing")).toBeNull();

        expect(await adapter.getScanSession("session-alpha")).not.toBeNull();
        expect(await adapter.getScanSession("session-missing")).toBeNull();
      });
    });

    describe("upsert* round-trips", () => {
      it("upsertDrive inserts new and updates existing", async () => {
        const existing = (await adapter.getDriveById("drive-alpha"))!;
        await adapter.upsertDrive({ ...existing, displayName: "Alpha Renamed" });

        const updated = await adapter.getDriveById("drive-alpha");
        expect(updated?.displayName).toBe("Alpha Renamed");

        const brandNew: Drive = {
          ...existing,
          id: "drive-new",
          volumeName: "NewVol",
          displayName: "New Drive"
        };
        await adapter.upsertDrive(brandNew);

        const fetched = await adapter.getDriveById("drive-new");
        expect(fetched?.displayName).toBe("New Drive");
      });

      it("upsertDrives bulk-writes and is order-independent", async () => {
        const alpha = (await adapter.getDriveById("drive-alpha"))!;
        const beta = (await adapter.getDriveById("drive-beta"))!;

        await adapter.upsertDrives([
          { ...alpha, displayName: "Alpha Bulk" },
          { ...beta, displayName: "Beta Bulk" }
        ]);

        expect((await adapter.getDriveById("drive-alpha"))?.displayName).toBe("Alpha Bulk");
        expect((await adapter.getDriveById("drive-beta"))?.displayName).toBe("Beta Bulk");
      });

      it("upsertProject and upsertProjects round-trip", async () => {
        const existing = (await adapter.getProjectById("project-alpha-1"))!;
        await adapter.upsertProject({ ...existing, correctedClient: "Renamed Client" });

        const updated = await adapter.getProjectById("project-alpha-1");
        expect(updated?.correctedClient).toBe("Renamed Client");

        await adapter.upsertProjects([
          { ...existing, id: "project-bulk-a", folderName: "BulkA" },
          { ...existing, id: "project-bulk-b", folderName: "BulkB" }
        ]);

        expect((await adapter.getProjectById("project-bulk-a"))?.folderName).toBe("BulkA");
        expect((await adapter.getProjectById("project-bulk-b"))?.folderName).toBe("BulkB");
      });

      it("upsertScan round-trips and surfaces via listScans", async () => {
        const newScan: ScanRecord = {
          id: "scan-new",
          driveId: "drive-alpha",
          startedAt: "2026-04-10T12:00:00.000Z",
          finishedAt: "2026-04-10T12:05:00.000Z",
          status: "completed",
          foldersScanned: 10,
          matchesFound: 2,
          notes: null,
          createdAt: "2026-04-10T12:00:00.000Z",
          updatedAt: "2026-04-10T12:05:00.000Z"
        };
        await adapter.upsertScan(newScan);

        const scans = await adapter.listScans();
        expect(scans.map((s) => s.id).sort()).toEqual([
          "scan-alpha-1",
          "scan-beta-1",
          "scan-new"
        ]);
      });

      it("upsertProjectScanEvent and upsertProjectScanEvents round-trip", async () => {
        const event: ProjectScanEvent = {
          id: "event-extra",
          projectId: "project-alpha-1",
          scanId: "scan-alpha-1",
          observedFolderName: "AlphaFolder",
          observedDriveName: "Alpha",
          observedFolderType: "client",
          observedAt: "2026-04-10T12:00:00.000Z",
          createdAt: "2026-04-10T12:00:00.000Z",
          updatedAt: "2026-04-10T12:00:00.000Z"
        };
        await adapter.upsertProjectScanEvent(event);

        const alphaEvents = await adapter.listProjectScanEvents("project-alpha-1");
        expect(alphaEvents.map((e) => e.id).sort()).toEqual([
          "event-alpha-1",
          "event-extra"
        ]);

        await adapter.upsertProjectScanEvents([
          { ...event, id: "event-bulk-a" },
          { ...event, id: "event-bulk-b" }
        ]);

        const allEvents = await adapter.listProjectScanEvents();
        expect(allEvents.map((e) => e.id).sort()).toEqual([
          "event-alpha-1",
          "event-beta-1",
          "event-bulk-a",
          "event-bulk-b",
          "event-extra"
        ]);
      });

      it("upsertScanSession writes session + embedded projects", async () => {
        const existing = (await adapter.getScanSession("session-alpha"))!;
        const updated: ScanSessionSnapshot = {
          ...existing,
          status: "interrupted",
          error: "Recovered after restart",
          projects: [
            ...existing.projects,
            {
              id: "session-alpha-project-2",
              folderType: "client",
              folderName: "NewFolder",
              folderPath: "/Volumes/Alpha/NewFolder",
              relativePath: "NewFolder",
              parsedDate: null,
              parsedClient: null,
              parsedProject: null,
              sourceDriveName: "Alpha",
              scanTimestamp: "2026-04-10T13:00:00.000Z",
              sizeStatus: "ready",
              sizeBytes: 123,
              sizeError: null
            }
          ]
        };
        await adapter.upsertScanSession(updated);

        const fetched = await adapter.getScanSession("session-alpha");
        expect(fetched?.status).toBe("interrupted");
        expect(fetched?.error).toBe("Recovered after restart");
        expect(fetched?.projects.map((p) => p.id).sort()).toEqual([
          "session-alpha-project-1",
          "session-alpha-project-2"
        ]);
      });
    });

    describe("deleteProject", () => {
      it("removes the project and its project_scan_events", async () => {
        await adapter.deleteProject("project-alpha-1");

        expect(await adapter.getProjectById("project-alpha-1")).toBeNull();
        const remainingEvents = await adapter.listProjectScanEvents();
        expect(remainingEvents.map((e) => e.id)).not.toContain("event-alpha-1");
      });

      it("leaves unrelated projects and events untouched", async () => {
        await adapter.deleteProject("project-alpha-1");

        expect(await adapter.getProjectById("project-beta-1")).not.toBeNull();
        const betaEvents = await adapter.listProjectScanEvents("project-beta-1");
        expect(betaEvents.map((e) => e.id)).toEqual(["event-beta-1"]);
      });
    });

    describe("deleteDrive (H3 cascade regression)", () => {
      it("removes the drive row", async () => {
        await adapter.deleteDrive("drive-alpha");

        expect(await adapter.getDriveById("drive-alpha")).toBeNull();
        expect(await adapter.getDriveById("drive-beta")).not.toBeNull();
      });

      it("nullifies currentDriveId and targetDriveId on projects but keeps them", async () => {
        await adapter.deleteDrive("drive-alpha");

        const projects = await adapter.listProjects();
        const projectMap = new Map(projects.map((p) => [p.id, p] as const));

        // Projects must survive drive deletion.
        expect(projectMap.size).toBe(3);

        const p1 = projectMap.get("project-alpha-1");
        expect(p1?.currentDriveId).toBeNull();
        expect(p1?.targetDriveId).toBeNull();

        // project-alpha-2 targeted drive-beta, which is untouched.
        const p2 = projectMap.get("project-alpha-2");
        expect(p2?.currentDriveId).toBeNull();
        expect(p2?.targetDriveId).toBe("drive-beta");

        // project-beta-1 is completely untouched.
        const p3 = projectMap.get("project-beta-1");
        expect(p3?.currentDriveId).toBe("drive-beta");
        expect(p3?.targetDriveId).toBeNull();
      });

      it("cascades scans and their project_scan_events", async () => {
        await adapter.deleteDrive("drive-alpha");

        const scans = await adapter.listScans();
        expect(scans.map((s) => s.id)).toEqual(["scan-beta-1"]);

        const events = await adapter.listProjectScanEvents();
        expect(events.map((e) => e.id)).toEqual(["event-beta-1"]);
      });

      it("cascades scan sessions whose requestedDriveId matches, and drops their embedded projects", async () => {
        await adapter.deleteDrive("drive-alpha");

        const sessions = await adapter.listScanSessions();
        const sessionIds = sessions.map((s) => s.scanId).sort();

        // session-alpha targeted drive-alpha → must be gone with its embedded projects.
        // session-beta targeted drive-beta → untouched.
        // session-orphan had requestedDriveId=null → preserved.
        expect(sessionIds).toEqual(["session-beta", "session-orphan"]);

        // Direct lookup confirms the cascade.
        expect(await adapter.getScanSession("session-alpha")).toBeNull();

        // The surviving session's embedded projects are intact.
        const beta = await adapter.getScanSession("session-beta");
        expect(beta?.projects.map((p) => p.id)).toEqual(["session-beta-project-1"]);

        const orphan = await adapter.getScanSession("session-orphan");
        expect(orphan?.projects.map((p) => p.id)).toEqual([
          "session-orphan-project-1"
        ]);
      });

      it("is a no-op for a driveId that doesn't exist", async () => {
        await adapter.deleteDrive("drive-does-not-exist");

        const snapshot = await adapter.readSnapshot();
        expect(snapshot.drives).toHaveLength(2);
        expect(snapshot.projects).toHaveLength(3);
        expect(snapshot.scans).toHaveLength(2);
        expect(snapshot.projectScanEvents).toHaveLength(2);
        expect(snapshot.scanSessions).toHaveLength(3);
      });
    });
  });
}

/**
 * Deterministic fixture used by every contract test. Designed so that:
 *  - `drive-alpha` has at least one project, one scan, one event, one session.
 *  - `drive-beta` has at least one project, one scan, one event, one session.
 *  - `project-alpha-2` has `currentDriveId=drive-alpha` but `targetDriveId=drive-beta`
 *    so we can verify targetDriveId is not wiped when only the current drive is deleted.
 *  - `session-orphan` has `requestedDriveId=null` so we can verify the cascade
 *    does not sweep up sessions unrelated to the deleted drive.
 */
function buildContractFixture(): CatalogSnapshot {
  const ts = "2026-04-10T00:00:00.000Z";

  const drives: Drive[] = [
    {
      id: "drive-alpha",
      volumeName: "Alpha",
      displayName: "Alpha Drive",
      totalCapacityBytes: 1_000_000,
      usedBytes: 100_000,
      freeBytes: 900_000,
      reservedIncomingBytes: 0,
      lastScannedAt: null,
      createdManually: false,
      createdAt: ts,
      updatedAt: ts
    },
    {
      id: "drive-beta",
      volumeName: "Beta",
      displayName: "Beta Drive",
      totalCapacityBytes: 2_000_000,
      usedBytes: 200_000,
      freeBytes: 1_800_000,
      reservedIncomingBytes: 0,
      lastScannedAt: null,
      createdManually: false,
      createdAt: ts,
      updatedAt: ts
    }
  ];

  const baseProject: Omit<Project, "id" | "folderName" | "currentDriveId" | "targetDriveId"> = {
    folderType: "client",
    isStandardized: true,
    folderPath: null,
    parsedDate: "240401",
    parsedClient: "Contract",
    parsedProject: "Fixture",
    correctedDate: null,
    correctedClient: null,
    correctedProject: null,
    category: null,
    sizeBytes: null,
    sizeStatus: "unknown",
    moveStatus: "none",
    missingStatus: "normal",
    duplicateStatus: "normal",
    isUnassigned: false,
    isManual: false,
    lastSeenAt: null,
    lastScannedAt: null,
    createdAt: ts,
    updatedAt: ts
  };

  const projects: Project[] = [
    {
      id: "project-alpha-1",
      folderName: "240401_Contract_FixtureAlpha1",
      currentDriveId: "drive-alpha",
      targetDriveId: null,
      ...baseProject
    },
    {
      id: "project-alpha-2",
      folderName: "240402_Contract_FixtureAlpha2",
      currentDriveId: "drive-alpha",
      targetDriveId: "drive-beta",
      ...baseProject
    },
    {
      id: "project-beta-1",
      folderName: "240403_Contract_FixtureBeta1",
      currentDriveId: "drive-beta",
      targetDriveId: null,
      ...baseProject
    }
  ];

  const scans: ScanRecord[] = [
    {
      id: "scan-alpha-1",
      driveId: "drive-alpha",
      startedAt: ts,
      finishedAt: ts,
      status: "completed",
      foldersScanned: 1,
      matchesFound: 1,
      notes: null,
      createdAt: ts,
      updatedAt: ts
    },
    {
      id: "scan-beta-1",
      driveId: "drive-beta",
      startedAt: ts,
      finishedAt: ts,
      status: "completed",
      foldersScanned: 1,
      matchesFound: 1,
      notes: null,
      createdAt: ts,
      updatedAt: ts
    }
  ];

  const projectScanEvents: ProjectScanEvent[] = [
    {
      id: "event-alpha-1",
      projectId: "project-alpha-1",
      scanId: "scan-alpha-1",
      observedFolderName: "240401_Contract_FixtureAlpha1",
      observedDriveName: "Alpha",
      observedFolderType: "client",
      observedAt: ts,
      createdAt: ts,
      updatedAt: ts
    },
    {
      id: "event-beta-1",
      projectId: "project-beta-1",
      scanId: "scan-beta-1",
      observedFolderName: "240403_Contract_FixtureBeta1",
      observedDriveName: "Beta",
      observedFolderType: "client",
      observedAt: ts,
      createdAt: ts,
      updatedAt: ts
    }
  ];

  const scanSessions: ScanSessionSnapshot[] = [
    {
      scanId: "session-alpha",
      rootPath: "/Volumes/Alpha",
      driveName: "Alpha",
      requestedDriveId: "drive-alpha",
      requestedDriveName: "Alpha Drive",
      status: "completed",
      startedAt: ts,
      finishedAt: ts,
      foldersScanned: 1,
      matchesFound: 1,
      error: null,
      sizeJobsPending: 0,
      summary: null,
      createdAt: ts,
      updatedAt: ts,
      projects: [
        {
          id: "session-alpha-project-1",
          folderType: "client",
          folderName: "240401_Contract_FixtureAlpha1",
          folderPath: "/Volumes/Alpha/240401_Contract_FixtureAlpha1",
          relativePath: "240401_Contract_FixtureAlpha1",
          parsedDate: "240401",
          parsedClient: "Contract",
          parsedProject: "FixtureAlpha1",
          sourceDriveName: "Alpha",
          scanTimestamp: ts,
          sizeStatus: "ready",
          sizeBytes: 1000,
          sizeError: null
        }
      ]
    },
    {
      scanId: "session-beta",
      rootPath: "/Volumes/Beta",
      driveName: "Beta",
      requestedDriveId: "drive-beta",
      requestedDriveName: "Beta Drive",
      status: "completed",
      startedAt: ts,
      finishedAt: ts,
      foldersScanned: 1,
      matchesFound: 1,
      error: null,
      sizeJobsPending: 0,
      summary: null,
      createdAt: ts,
      updatedAt: ts,
      projects: [
        {
          id: "session-beta-project-1",
          folderType: "client",
          folderName: "240403_Contract_FixtureBeta1",
          folderPath: "/Volumes/Beta/240403_Contract_FixtureBeta1",
          relativePath: "240403_Contract_FixtureBeta1",
          parsedDate: "240403",
          parsedClient: "Contract",
          parsedProject: "FixtureBeta1",
          sourceDriveName: "Beta",
          scanTimestamp: ts,
          sizeStatus: "ready",
          sizeBytes: 2000,
          sizeError: null
        }
      ]
    },
    {
      scanId: "session-orphan",
      rootPath: "/Volumes/Orphan",
      driveName: "Orphan",
      requestedDriveId: null,
      requestedDriveName: null,
      status: "completed",
      startedAt: ts,
      finishedAt: ts,
      foldersScanned: 1,
      matchesFound: 0,
      error: null,
      sizeJobsPending: 0,
      summary: null,
      createdAt: ts,
      updatedAt: ts,
      projects: [
        {
          id: "session-orphan-project-1",
          folderType: "personal_folder",
          folderName: "Notes",
          folderPath: "/Volumes/Orphan/Notes",
          relativePath: "Notes",
          parsedDate: null,
          parsedClient: null,
          parsedProject: null,
          sourceDriveName: "Orphan",
          scanTimestamp: ts,
          sizeStatus: "ready",
          sizeBytes: 500,
          sizeError: null
        }
      ]
    }
  ];

  return {
    drives,
    projects,
    scans,
    projectScanEvents,
    scanSessions
  };
}
