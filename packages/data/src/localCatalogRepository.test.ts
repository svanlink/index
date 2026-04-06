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
import { getDefaultSyncState, type SyncAdapter, type SyncOperation, type SyncPullResult, type SyncRecoveryResult, type SyncResult, type SyncState } from "./sync";

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

  it("rejects same-drive move planning at the repository boundary", async () => {
    const repository = new LocalCatalogRepository(
      new InMemoryLocalPersistence(mockCatalogSnapshot),
      new InMemorySyncAdapter()
    );

    await expect(repository.planProjectMove("project-240401-apple-shoot", "drive-a")).rejects.toThrow(
      "The target drive matches the current drive."
    );
  });

  it("compacts repeated edits for the same project in the sync queue", async () => {
    const repository = new LocalCatalogRepository(
      new InMemoryLocalPersistence(mockCatalogSnapshot),
      new InMemorySyncAdapter()
    );
    const project = await repository.getProjectById("project-240401-apple-shoot");

    expect(project).not.toBeNull();

    await repository.saveProject({
      ...project!,
      correctedClient: "Apple Corp",
      updatedAt: "2026-04-06T12:00:00.000Z"
    });
    await repository.saveProject({
      ...project!,
      correctedClient: "Apple Creative",
      updatedAt: "2026-04-06T12:01:00.000Z"
    });

    const queue = await repository.listPendingSyncOperations();

    expect(queue).toHaveLength(1);
    expect(queue[0]?.recordId).toBe("project-240401-apple-shoot");
    expect((queue[0]?.payload as { correctedClient?: string }).correctedClient).toBe("Apple Creative");
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

  it("keeps scan-ingestion queue entries deduplicated across repeated session updates", async () => {
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
    await repository.ingestScanSnapshot({
      scanId: "scan-drive-a-running",
      rootPath: "/Volumes/Drive A",
      driveName: "Drive A",
      status: "completed",
      startedAt: "2026-04-06T10:00:00.000Z",
      finishedAt: "2026-04-06T10:03:00.000Z",
      foldersScanned: 12,
      matchesFound: 1,
      error: null,
      sizeJobsPending: 0,
      createdAt: "2026-04-06T10:00:00.000Z",
      updatedAt: "2026-04-06T10:03:00.000Z",
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
          scanTimestamp: "2026-04-06T10:02:00.000Z",
          sizeStatus: "ready",
          sizeBytes: 125_000_000_000,
          sizeError: null
        }
      ]
    });

    const queue = await repository.listPendingSyncOperations();
    const keys = queue.map((operation) => `${operation.entity}:${operation.recordId}`);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("scan:scan-drive-a-running");
    expect(keys).toContain("scanSession:scan-drive-a-running");
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

  it("applies newer pulled remote project changes during syncNow", async () => {
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const repository = new LocalCatalogRepository(
      persistence,
      new StubSyncAdapter({
        changes: [
          {
            entity: "project",
            change: "upsert",
            remoteUpdatedAt: "2026-04-06T14:00:00.000Z",
            payload: {
              ...mockCatalogSnapshot.projects[0]!,
              correctedProject: "Apple Global Campaign",
              updatedAt: "2026-04-06T14:00:00.000Z"
            }
          }
        ]
      })
    );

    const result = await repository.syncNow();
    const project = await repository.getProjectById("project-240401-apple-shoot");

    expect(result.pulled).toBe(1);
    expect(project?.correctedProject).toBe("Apple Global Campaign");
  });

  it("keeps newer local data when pulled records tie or trail updatedAt", async () => {
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const localProject = {
      ...mockCatalogSnapshot.projects[0]!,
      correctedProject: "Local Winner",
      updatedAt: "2026-04-06T14:00:00.000Z"
    };
    await persistence.upsertProject(localProject);

    const repository = new LocalCatalogRepository(
      persistence,
      new StubSyncAdapter({
        changes: [
          {
            entity: "project",
            change: "upsert",
            remoteUpdatedAt: "2026-04-06T14:00:00.000Z",
            payload: {
              ...localProject,
              correctedProject: "Remote Loser"
            }
          }
        ]
      })
    );

    const result = await repository.syncNow();
    const project = await repository.getProjectById(localProject.id);

    expect(result.pulled).toBe(0);
    expect(project?.correctedProject).toBe("Local Winner");
  });

  it("remains stable across repeated sync cycles for the same remote change", async () => {
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const remoteProject = {
      ...mockCatalogSnapshot.projects[0]!,
      correctedProject: "Remote Stable",
      updatedAt: "2026-04-06T14:00:00.000Z"
    };
    const sync = new StubSyncAdapter({
      changes: [
        {
          entity: "project",
          change: "upsert",
          remoteUpdatedAt: remoteProject.updatedAt,
          payload: remoteProject
        }
      ]
    });
    const repository = new LocalCatalogRepository(persistence, sync);

    const first = await repository.syncNow();
    const second = await repository.syncNow();

    expect(first.pulled).toBe(1);
    expect(second.pulled).toBe(0);
  });

  it("skips startup sync when sync is disabled", async () => {
    const repository = new LocalCatalogRepository(
      new InMemoryLocalPersistence(mockCatalogSnapshot),
      new StubSyncAdapter({
        state: {
          ...getDefaultSyncState(),
          mode: "local-only"
        }
      })
    );

    const result = await repository.startupSync({ isOnline: true });

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("disabled");
  });

  it("runs startup sync when recovery or queue state needs it", async () => {
    const repository = new LocalCatalogRepository(
      new InMemoryLocalPersistence(mockCatalogSnapshot),
      new StubSyncAdapter({
        state: {
          ...getDefaultSyncState(),
          mode: "remote-ready",
          pendingCount: 1,
          queuedCount: 1
        },
        recovery: {
          recoveredCount: 1,
          state: {
            ...getDefaultSyncState(),
            mode: "remote-ready",
            failedCount: 1,
            queuedCount: 1
          }
        }
      })
    );

    const result = await repository.startupSync({ isOnline: true });

    expect(result.status).toBe("completed");
    expect(result.reason).toBe("recovered-and-ran");
  });

  it("recovers stale sync-in-progress state before a manual sync cycle", async () => {
    const repository = new LocalCatalogRepository(
      new InMemoryLocalPersistence(mockCatalogSnapshot),
      new RecoveringSyncAdapter()
    );

    const result = await repository.syncNow();

    expect(result.pushed).toBe(1);
    expect(result.pulled).toBe(0);
    expect(result.state.syncInProgress).toBe(false);
  });
});

class StubSyncAdapter implements SyncAdapter {
  #state: SyncState = {
    ...getDefaultSyncState(),
    mode: "remote-ready"
  };
  #pullResult: SyncPullResult;
  #recovery: SyncRecoveryResult | null;

  constructor(params: { changes?: SyncPullResult["changes"]; state?: SyncState; recovery?: SyncRecoveryResult }) {
    this.#pullResult = {
      changes: params.changes ?? [],
      remoteCursor: "cursor-1"
    };
    this.#state = params.state ?? this.#state;
    this.#recovery = params.recovery ?? null;
  }

  async enqueue(_operation: SyncOperation): Promise<void> {}

  async listPending(): Promise<SyncOperation[]> {
    return [];
  }

  async listQueue(): Promise<SyncOperation[]> {
    return [];
  }

  async flush(): Promise<SyncResult> {
    this.#state = {
      ...this.#state,
      lastPushAt: "2026-04-06T15:00:00.000Z",
      syncInProgress: false
    };
    return {
      pushed: 0,
      pending: 0
    };
  }

  async pull(): Promise<SyncPullResult> {
    this.#state = {
      ...this.#state,
      lastPullAt: "2026-04-06T15:01:00.000Z",
      remoteCursor: this.#pullResult.remoteCursor
    };
    return this.#pullResult;
  }

  async getState(): Promise<SyncState> {
    return this.#state;
  }

  async recoverInterruptedState(): Promise<SyncRecoveryResult> {
    if (this.#recovery) {
      this.#state = this.#recovery.state;
      return this.#recovery;
    }

    return {
      recoveredCount: 0,
      state: this.#state
    };
  }
}

class RecoveringSyncAdapter implements SyncAdapter {
  #state: SyncState = {
    ...getDefaultSyncState(),
    mode: "remote-ready",
    syncInProgress: true,
    pendingCount: 1,
    queuedCount: 1,
    inFlightCount: 1
  };

  async enqueue(_operation: SyncOperation): Promise<void> {}

  async listPending(): Promise<SyncOperation[]> {
    return [];
  }

  async listQueue(): Promise<SyncOperation[]> {
    return [];
  }

  async flush(): Promise<SyncResult> {
    this.#state = {
      ...this.#state,
      syncInProgress: false,
      inFlightCount: 0,
      pendingCount: 0,
      queuedCount: 0,
      lastPushAt: "2026-04-06T15:00:00.000Z"
    };
    return { pushed: 1, pending: 0 };
  }

  async pull(): Promise<SyncPullResult> {
    this.#state = {
      ...this.#state,
      lastPullAt: "2026-04-06T15:01:00.000Z"
    };
    return { changes: [], remoteCursor: "cursor-1" };
  }

  async getState(): Promise<SyncState> {
    return this.#state;
  }

  async recoverInterruptedState(): Promise<SyncRecoveryResult> {
    this.#state = {
      ...this.#state,
      syncInProgress: false,
      inFlightCount: 0,
      failedCount: 1,
      queuedCount: 1
    };

    return {
      recoveredCount: 1,
      state: this.#state
    };
  }
}

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
