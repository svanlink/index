import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { InMemoryLocalPersistence } from "./inMemoryLocalPersistence";
import { InMemorySyncAdapter } from "./inMemorySyncAdapter";
import { LocalCatalogRepository } from "./localCatalogRepository";
import { mockCatalogSnapshot } from "./mockData";
import { SqliteLocalPersistence, type SqlDatabase } from "./sqliteLocalPersistence";

describe("LocalCatalogRepository", () => {
  it("supports filtered project reads from local persistence", async () => {
    const repository = new LocalCatalogRepository(
      new InMemoryLocalPersistence(mockCatalogSnapshot),
      new InMemorySyncAdapter()
    );

    const missingProjects = await repository.listProjects({ status: "missing" });

    expect(missingProjects).toHaveLength(1);
    expect(missingProjects[0]?.missingStatus).toBe("missing");
  });

  it("flushes queued sync operations after local writes", async () => {
    const repository = new LocalCatalogRepository(
      new InMemoryLocalPersistence(mockCatalogSnapshot),
      new InMemorySyncAdapter()
    );

    const drive = await repository.getDriveById("drive-c");
    expect(drive).not.toBeNull();

    await repository.saveDrive({
      ...drive!,
      displayName: "Archive Freezer"
    });

    expect(await repository.listPendingSyncOperations()).toHaveLength(1);
    await expect(repository.flushSync()).resolves.toEqual({ pushed: 1, pending: 0 });
    await expect(repository.listPendingSyncOperations()).resolves.toHaveLength(0);
  });

  it("supports local move planning and confirmation", async () => {
    const repository = new LocalCatalogRepository(
      new InMemoryLocalPersistence(mockCatalogSnapshot),
      new InMemorySyncAdapter()
    );

    await repository.planProjectMove("project-240401-apple-shoot", "drive-c");
    let project = await repository.getProjectById("project-240401-apple-shoot");

    expect(project?.moveStatus).toBe("pending");
    expect(project?.targetDriveId).toBe("drive-c");

    const drivesAfterPlan = await repository.listDrives();
    expect(drivesAfterPlan.find((drive) => drive.id === "drive-c")?.reservedIncomingBytes).toBeGreaterThan(0);

    await repository.confirmProjectMove("project-240401-apple-shoot");
    project = await repository.getProjectById("project-240401-apple-shoot");

    expect(project?.currentDriveId).toBe("drive-c");
    expect(project?.targetDriveId).toBeNull();
    expect(project?.moveStatus).toBe("none");
  });

  it("creates manual projects and drives through the repository boundary", async () => {
    const repository = new LocalCatalogRepository(
      new InMemoryLocalPersistence(mockCatalogSnapshot),
      new InMemorySyncAdapter()
    );

    const drive = await repository.createDrive({
      volumeName: "Archive Dock",
      displayName: "Archive Dock",
      totalCapacityBytes: 4_000_000_000_000
    });
    const project = await repository.createProject({
      parsedDate: "240501",
      parsedClient: "Canon",
      parsedProject: "Campaign",
      category: "photo"
    });

    expect(drive.createdManually).toBe(true);
    expect(project.isManual).toBe(true);
    expect(project.isUnassigned).toBe(true);
    expect(project.sizeStatus).toBe("unknown");
  });

  it("ingests scan snapshots into persisted catalog state", async () => {
    const repository = new LocalCatalogRepository(
      new InMemoryLocalPersistence(mockCatalogSnapshot),
      new InMemorySyncAdapter()
    );

    await repository.ingestScanSnapshot({
      scanId: "scan-drive-a-running",
      rootPath: "/Volumes/Drive A",
      driveName: "Drive A",
      status: "running",
      startedAt: "2026-04-06T10:00:00.000Z",
      finishedAt: null,
      foldersScanned: 10,
      matchesFound: 1,
      error: null,
      sizeJobsPending: 1,
      createdAt: "2026-04-06T10:00:00.000Z",
      updatedAt: "2026-04-06T10:00:00.000Z",
      projects: [
        {
          id: "scan-project-running",
          folderName: "240401_Apple_ProductShoot",
          folderPath: "/Volumes/Drive A/240401_Apple_ProductShoot",
          relativePath: "240401_Apple_ProductShoot",
          parsedDate: "240401",
          parsedClient: "Apple",
          parsedProject: "ProductShoot",
          sourceDriveName: "Drive A",
          scanTimestamp: "2026-04-06T10:01:00.000Z",
          sizeStatus: "pending",
          sizeBytes: null,
          sizeError: null
        }
      ]
    });

    const session = await repository.getScanSession("scan-drive-a-running");
    const project = await repository.getProjectById("project-240401-apple-shoot");

    expect(session?.status).toBe("running");
    expect(project?.sizeStatus).toBe("pending");
  });

  it("remains compatible with the SQLite persistence adapter", async () => {
    const directory = mkdtempSync(join(tmpdir(), "drive-project-catalog-repository-"));

    try {
      const repository = new LocalCatalogRepository(
        new SqliteLocalPersistence({
          loadDatabase: async () => openNodeSqlDatabase(join(directory, "catalog.db")),
          seed: mockCatalogSnapshot
        }),
        new InMemorySyncAdapter()
      );

      await repository.planProjectMove("project-240401-apple-shoot", "drive-c");
      await repository.saveScanSession({
        scanId: "scan-restart-test",
        rootPath: "/Volumes/Drive C",
        driveName: "Drive C",
        status: "interrupted",
        startedAt: "2026-04-06T12:00:00.000Z",
        finishedAt: "2026-04-06T12:01:00.000Z",
        foldersScanned: 12,
        matchesFound: 1,
        error: "Recovered after restart",
        sizeJobsPending: 0,
        projects: [],
        requestedDriveId: "drive-c",
        requestedDriveName: "Freezer Drive",
        summary: null,
        createdAt: "2026-04-06T12:00:00.000Z",
        updatedAt: "2026-04-06T12:01:00.000Z"
      });

      const project = await repository.getProjectById("project-240401-apple-shoot");
      const session = await repository.getScanSession("scan-restart-test");

      expect(project?.moveStatus).toBe("pending");
      expect(session?.status).toBe("interrupted");
      expect(session?.requestedDriveName).toBe("Freezer Drive");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function openNodeSqlDatabase(databasePath: string): SqlDatabase {
  const database = new DatabaseSync(databasePath);

  return {
    async execute(query: string, bindValues: unknown[] = []) {
      const result = database.prepare(query).run(...toSqlParameters(bindValues));
      return {
        rowsAffected: Number(result.changes ?? 0),
        lastInsertId:
          result.lastInsertRowid === undefined
            ? undefined
            : Number(result.lastInsertRowid)
      };
    },
    async select<T>(query: string, bindValues: unknown[] = []) {
      return database.prepare(query).all(...toSqlParameters(bindValues)) as T[];
    }
  };
}

function toSqlParameters(bindValues: unknown[]) {
  return bindValues as Parameters<ReturnType<DatabaseSync["prepare"]>["run"]>;
}
