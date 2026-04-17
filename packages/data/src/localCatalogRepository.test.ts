import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { InMemoryLocalPersistence } from "./inMemoryLocalPersistence";
import { InMemorySyncAdapter } from "./inMemorySyncAdapter";
import { LocalCatalogRepository } from "./localCatalogRepository";
import { mockCatalogSnapshot } from "./testing/mockData";
import { SqliteLocalPersistence, type SqlDatabase } from "./sqliteLocalPersistence";
import { SqliteSyncAdapter } from "./sqliteSyncAdapter";
import { getDefaultSyncState, type RemoteSyncAdapter, type SyncableCatalogEntity, type SyncAdapter, type SyncOperation, type SyncPullResult, type SyncRecoveryResult, type SyncResult, type SyncState } from "./sync";

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

  // F1 — outbound delete propagation. After deleteProject / deleteDrive, the
  // sync queue must contain a single delete op for the target record, and no
  // stale upsert should survive to re-create it on the remote.
  it("enqueues a project.delete op and cancels pending upserts for the same record", async () => {
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const sync = new InMemorySyncAdapter();
    const repository = new LocalCatalogRepository(persistence, sync);

    const project = (await repository.getProjectById("project-240401-apple-shoot"))!;
    // Queue an upsert first so we can verify it gets cancelled by deleteProject.
    await repository.saveProject({
      ...project,
      correctedClient: "Apple Creative",
      updatedAt: "2026-04-06T12:00:00.000Z"
    });

    await repository.deleteProject("project-240401-apple-shoot");

    const queue = await repository.listPendingSyncOperations();
    const projectOps = queue.filter(
      (op) => op.entity === "project" && op.recordId === "project-240401-apple-shoot"
    );

    expect(projectOps).toHaveLength(1);
    expect(projectOps[0]!.type).toBe("project.delete");
    expect(projectOps[0]!.change).toBe("delete");
    expect(projectOps[0]!.payload).toMatchObject({ id: "project-240401-apple-shoot" });
  });

  it("enqueues a drive.delete op and cancels pending upserts for the same record", async () => {
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const sync = new InMemorySyncAdapter();
    const repository = new LocalCatalogRepository(persistence, sync);

    const drive = (await repository.getDriveById("drive-c"))!;
    await repository.saveDrive({ ...drive, displayName: "Archive Freezer" });

    await repository.deleteDrive("drive-c");

    const queue = await repository.listPendingSyncOperations();
    const driveOps = queue.filter((op) => op.entity === "drive" && op.recordId === "drive-c");

    expect(driveOps).toHaveLength(1);
    expect(driveOps[0]!.type).toBe("drive.delete");
    expect(driveOps[0]!.change).toBe("delete");
    expect(driveOps[0]!.payload).toMatchObject({ id: "drive-c" });
  });

  it("keeps upsert and delete ops independent when compacting a mixed queue", async () => {
    // compactSyncQueue keys on (entity, recordId, change), so a later upsert
    // for the same record after a delete must not merge with the delete. This
    // would only happen if a caller bypassed the repository's
    // cancelPendingForRecord call before enqueueDelete, but the compactor's
    // invariant should be verifiable end-to-end.
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const sync = new InMemorySyncAdapter();
    const repository = new LocalCatalogRepository(persistence, sync);

    await repository.deleteProject("project-240401-apple-shoot");
    // Directly enqueue a fresh upsert for the same record (simulating a
    // resurrection scenario) — bypass the repository save flow to avoid
    // re-triggering cancellation logic.
    const resurrected = mockCatalogSnapshot.projects.find(
      (p) => p.id === "project-240401-apple-shoot"
    )!;
    await sync.enqueue({
      id: "project.upsert:resurrect",
      type: "project.upsert",
      entity: "project",
      recordId: "project-240401-apple-shoot",
      change: "upsert",
      occurredAt: "2026-04-06T12:05:00.000Z",
      recordUpdatedAt: "2026-04-06T12:05:00.000Z",
      payload: resurrected,
      source: "manual",
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      lastError: null
    });

    const queue = await sync.listQueue();
    const kinds = queue
      .filter((op) => op.recordId === "project-240401-apple-shoot")
      .map((op) => op.change)
      .sort();
    expect(kinds).toEqual(["delete", "upsert"]);
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
          folderType: "client" as const,
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
          folderType: "client" as const,
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
          folderType: "client" as const,
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

  // -------------------------------------------------------------------------
  // Pass 3 / F5 — inbound-delete → outbound-queue cancellation.
  //
  // When a pull delivers a delete for a record that still has a pending
  // outbound upsert locally, the repository must surgically drop the upsert
  // so the next flush does not resurrect the record on the remote. These
  // tests exercise the runSyncCycle wiring end-to-end — the pure helper and
  // adapter delegations are covered elsewhere.
  // -------------------------------------------------------------------------

  it("F5: calls cancelPendingForRecord for every applied inbound delete", async () => {
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const driveId = mockCatalogSnapshot.drives[0]!.id;
    const projectId = mockCatalogSnapshot.projects[0]!.id;

    const sync = new StubSyncAdapter({
      changes: [
        {
          entity: "drive",
          change: "delete",
          remoteUpdatedAt: "2999-01-01T00:00:00.000Z",
          payload: { id: driveId }
        },
        {
          entity: "project",
          change: "delete",
          remoteUpdatedAt: "2999-01-01T00:00:00.000Z",
          payload: { id: projectId }
        }
      ]
    });
    const repository = new LocalCatalogRepository(persistence, sync);

    await repository.syncNow();

    // F5 (parents) + F7 (cascade). drive-a cascades the scan on that drive
    // and the event linked to it; project cascades the same event (deduped
    // across the batch by the merge's Set). Net: 4 cancel calls.
    expect(sync.cancelCalls).toEqual(
      expect.arrayContaining([
        { entity: "drive", recordId: driveId },
        { entity: "project", recordId: projectId },
        { entity: "scan", recordId: "scan-drive-a-20260405" },
        { entity: "projectScanEvent", recordId: "event-project-apple-drive-a" }
      ])
    );
    expect(sync.cancelCalls).toHaveLength(4);
  });

  it("F5: does NOT call cancelPendingForRecord when LWW rejects the inbound delete", async () => {
    // Local record is newer than the inbound delete — LWW keeps the local
    // record, the delete never enters `appliedDeletes`, so the cancellation
    // loop must stay silent. This is the primary defense against a
    // misbehaving/out-of-order remote wiping a local queue entry.
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const localProject = mockCatalogSnapshot.projects[0]!;
    await persistence.upsertProject({ ...localProject, updatedAt: "2026-04-06T15:00:00.000Z" });

    const sync = new StubSyncAdapter({
      changes: [
        {
          entity: "project",
          change: "delete",
          remoteUpdatedAt: "2026-04-06T14:00:00.000Z",
          payload: { id: localProject.id }
        }
      ]
    });
    const repository = new LocalCatalogRepository(persistence, sync);

    await repository.syncNow();

    expect(sync.cancelCalls).toEqual([]);
    // Local record must still be present after the LWW-rejected delete.
    expect(await repository.getProjectById(localProject.id)).not.toBeNull();
  });

  it("F5: does NOT call cancelPendingForRecord for inbound upserts", async () => {
    // Only applied deletes drive the handshake. A batch of upserts must
    // never touch the cancel path — otherwise unrelated queue entries could
    // be dropped by a plain pull.
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const remoteProject = {
      ...mockCatalogSnapshot.projects[0]!,
      correctedProject: "Remote Wins",
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

    await repository.syncNow();

    expect(sync.cancelCalls).toEqual([]);
  });

  it("F5: does NOT call cancelPendingForRecord for inbound deletes of unknown records", async () => {
    // Record missing locally — the merge does not increment `appliedCount`
    // and does not add the id to `appliedDeletes`. The cancel loop should
    // see nothing to do. (A pedantic caller might still want to clear any
    // queue entry for an unknown id, but the repository contract here is
    // strict: cancel only what we actually applied.)
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const sync = new StubSyncAdapter({
      changes: [
        {
          entity: "project",
          change: "delete",
          remoteUpdatedAt: "2999-01-01T00:00:00.000Z",
          payload: { id: "project-does-not-exist" }
        }
      ]
    });
    const repository = new LocalCatalogRepository(persistence, sync);

    await repository.syncNow();

    expect(sync.cancelCalls).toEqual([]);
  });

  it("F5 end-to-end: a pending outbound upsert is dropped when an inbound delete for the same record is applied", async () => {
    // This is the race-closure test. Without F5, the queue would still hold
    // the upsert after the sync cycle and the NEXT flush would resurrect
    // the just-deleted record on the remote.
    //
    // The `QueuedPullableSyncAdapter`'s flush is a no-op by design, so a
    // cleared queue here uniquely attributes the removal to
    // `cancelPendingForRecord` — not to the push phase silently draining it.
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const localProject = mockCatalogSnapshot.projects[0]!;

    const sync = new QueuedPullableSyncAdapter([
      {
        entity: "project",
        change: "delete",
        remoteUpdatedAt: "2999-01-01T00:00:00.000Z",
        payload: { id: localProject.id }
      }
    ]);
    const repository = new LocalCatalogRepository(persistence, sync);

    await repository.saveProject({
      ...localProject,
      correctedProject: "Stale Edit",
      updatedAt: "2026-04-06T12:00:00.000Z"
    });
    expect(await repository.listPendingSyncOperations()).toHaveLength(1);

    await repository.syncNow();

    // Stale upsert must be gone after the inbound delete lands.
    const remaining = await repository.listPendingSyncOperations();
    expect(remaining).toEqual([]);
    // And the removal must be attributed to F5/F7's cancellation, not
    // flush. F5 cancels the project itself; F7 cancels the one event
    // cascaded by project-240401-apple-shoot (see mockProjectScanEvents).
    expect(sync.cancelCalls).toEqual(
      expect.arrayContaining([
        { entity: "project", recordId: localProject.id },
        { entity: "projectScanEvent", recordId: "event-project-apple-drive-a" }
      ])
    );
    expect(sync.cancelCalls).toHaveLength(2);
  });

  it("F5 end-to-end: unrelated pending upserts survive an inbound delete for a different record", async () => {
    // Narrow-scope invariant: the cancellation is (entity, recordId)-scoped.
    // A pending upsert for project B must not be touched by an inbound
    // delete for project A.
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const projectA = mockCatalogSnapshot.projects[0]!;
    const projectB = mockCatalogSnapshot.projects[1]!;

    const sync = new QueuedPullableSyncAdapter([
      {
        entity: "project",
        change: "delete",
        remoteUpdatedAt: "2999-01-01T00:00:00.000Z",
        payload: { id: projectA.id }
      }
    ]);
    const repository = new LocalCatalogRepository(persistence, sync);

    await repository.saveProject({
      ...projectA,
      correctedProject: "A edit",
      updatedAt: "2026-04-06T12:00:00.000Z"
    });
    await repository.saveProject({
      ...projectB,
      correctedProject: "B edit",
      updatedAt: "2026-04-06T12:01:00.000Z"
    });

    await repository.syncNow();

    const remaining = await repository.listPendingSyncOperations();
    expect(remaining.map((op) => op.recordId)).toEqual([projectB.id]);
  });

  it("F5 end-to-end: LWW-rejected inbound delete leaves the pending upsert untouched", async () => {
    // Companion to the unit-level spy test: verify the end-to-end flow
    // through a real queue. Local record is newer than the inbound delete,
    // so LWW rejects it and the queue must be preserved verbatim. A bug
    // that cancelled on every inbound delete attempt (not just applied ones)
    // would silently drop a legitimate local edit.
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const localProject = mockCatalogSnapshot.projects[0]!;
    const newerUpdatedAt = "2026-04-06T15:00:00.000Z";
    await persistence.upsertProject({ ...localProject, updatedAt: newerUpdatedAt });

    const sync = new QueuedPullableSyncAdapter([
      {
        entity: "project",
        change: "delete",
        remoteUpdatedAt: "2026-04-06T14:00:00.000Z", // older than local
        payload: { id: localProject.id }
      }
    ]);
    const repository = new LocalCatalogRepository(persistence, sync);

    await repository.saveProject({
      ...localProject,
      correctedProject: "Should Survive",
      updatedAt: "2026-04-06T16:00:00.000Z"
    });
    expect(await repository.listPendingSyncOperations()).toHaveLength(1);

    await repository.syncNow();

    const remaining = await repository.listPendingSyncOperations();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.recordId).toBe(localProject.id);
    expect(remaining[0]!.change).toBe("upsert");
  });

  // -------------------------------------------------------------------------
  // Pass 4 / F7 — cascade-aware queue cancellation for parent deletes.
  //
  // `persistence.deleteDrive` cascades scans, scanSessions, and
  // projectScanEvents locally; `persistence.deleteProject` cascades
  // projectScanEvents. None of those child entities have an outbound
  // `.delete` variant in `syncOperationTypes`, so a queued *upsert* for a
  // just-cascade-deleted child would be pushed by the next flush against
  // a parent that no longer exists on the remote. These tests close that
  // race at the repository boundary.
  // -------------------------------------------------------------------------

  it("F7 outbound: deleteDrive drops pending child upserts for cascaded scans, sessions, and events", async () => {
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const sync = new InMemorySyncAdapter();
    const repository = new LocalCatalogRepository(persistence, sync);

    // Queue real child upserts by driving them through the repository's
    // own save paths. This mirrors production (scan ingestion, session
    // writes) so the test exercises exactly the queue shape the ordering
    // invariant has to defend against.
    //
    // saveScanSession is used to set requestedDriveId=drive-a explicitly —
    // the baseline mock sessions have an undefined requestedDriveId, so
    // without this write the cascade enumeration would skip sessions
    // entirely and we could not distinguish the "sessions are untouched"
    // case from the "sessions cascade correctly" case.
    const baselineSession = (await persistence.readSnapshot()).scanSessions.find(
      (s) => s.scanId === "scan-drive-a-20260405"
    )!;
    await repository.saveScanSession({
      ...baselineSession,
      requestedDriveId: "drive-a",
      updatedAt: "2026-04-06T12:00:00.000Z"
    });

    const baselineScan = (await persistence.readSnapshot()).scans.find(
      (s) => s.id === "scan-drive-a-20260405"
    )!;
    await repository.saveScan({
      ...baselineScan,
      foldersScanned: 999,
      updatedAt: "2026-04-06T12:01:00.000Z"
    });

    const baselineEvent = (await persistence.readSnapshot()).projectScanEvents.find(
      (e) => e.id === "event-project-apple-drive-a"
    )!;
    await repository.appendProjectScanEvent({
      ...baselineEvent,
      observedFolderName: "Re-observed",
      updatedAt: "2026-04-06T12:02:00.000Z"
    });

    // Sanity: four queued upserts (session, scan, event on drive-a, plus
    // whatever saveScanSession itself queued). Precise count is not the
    // contract — presence of each child entry is.
    const beforeDelete = await repository.listPendingSyncOperations();
    expect(beforeDelete.some((op) => op.entity === "scan" && op.recordId === "scan-drive-a-20260405")).toBe(true);
    expect(beforeDelete.some((op) => op.entity === "scanSession" && op.recordId === "scan-drive-a-20260405")).toBe(true);
    expect(beforeDelete.some((op) => op.entity === "projectScanEvent" && op.recordId === "event-project-apple-drive-a")).toBe(true);

    await repository.deleteDrive("drive-a");

    const afterDelete = await repository.listPendingSyncOperations();

    // No surviving child upsert for cascaded records.
    expect(afterDelete.some((op) => op.entity === "scan" && op.recordId === "scan-drive-a-20260405")).toBe(false);
    expect(afterDelete.some((op) => op.entity === "scanSession" && op.recordId === "scan-drive-a-20260405")).toBe(false);
    expect(afterDelete.some((op) => op.entity === "projectScanEvent" && op.recordId === "event-project-apple-drive-a")).toBe(false);

    // The drive.delete itself is enqueued exactly once.
    const driveOps = afterDelete.filter((op) => op.entity === "drive" && op.recordId === "drive-a");
    expect(driveOps).toHaveLength(1);
    expect(driveOps[0]!.type).toBe("drive.delete");
  });

  it("F7 outbound: deleteDrive preserves pending upserts for unrelated children on other drives", async () => {
    // Scope invariant: the cascade cancellation must be bounded to the
    // just-deleted drive. Scans, sessions, and events on other drives
    // must survive.
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const sync = new InMemorySyncAdapter();
    const repository = new LocalCatalogRepository(persistence, sync);

    // Queue an upsert for a scan on drive-b. drive-a is the one we delete.
    const unrelatedScan = (await persistence.readSnapshot()).scans.find(
      (s) => s.id === "scan-drive-b-20260404"
    )!;
    await repository.saveScan({
      ...unrelatedScan,
      foldersScanned: 42,
      updatedAt: "2026-04-06T12:01:00.000Z"
    });
    const unrelatedEvent = (await persistence.readSnapshot()).projectScanEvents.find(
      (e) => e.id === "event-project-nike-drive-b"
    )!;
    await repository.appendProjectScanEvent({
      ...unrelatedEvent,
      observedFolderName: "Nike re-observed",
      updatedAt: "2026-04-06T12:02:00.000Z"
    });

    await repository.deleteDrive("drive-a");

    const remaining = await repository.listPendingSyncOperations();

    expect(remaining.some((op) => op.entity === "scan" && op.recordId === "scan-drive-b-20260404")).toBe(true);
    expect(remaining.some((op) => op.entity === "projectScanEvent" && op.recordId === "event-project-nike-drive-b")).toBe(true);
  });

  it("F7 outbound: deleteProject drops pending projectScanEvent upserts for the project", async () => {
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const sync = new InMemorySyncAdapter();
    const repository = new LocalCatalogRepository(persistence, sync);

    const baselineEvent = (await persistence.readSnapshot()).projectScanEvents.find(
      (e) => e.projectId === "project-240401-apple-shoot"
    )!;
    await repository.appendProjectScanEvent({
      ...baselineEvent,
      observedFolderName: "Pre-delete edit",
      updatedAt: "2026-04-06T12:00:00.000Z"
    });
    // Sanity: the event upsert is queued.
    const before = await repository.listPendingSyncOperations();
    expect(before.some((op) => op.entity === "projectScanEvent" && op.recordId === baselineEvent.id)).toBe(true);

    await repository.deleteProject("project-240401-apple-shoot");

    const after = await repository.listPendingSyncOperations();

    // Event upsert was cancelled by the cascade.
    expect(after.some((op) => op.entity === "projectScanEvent" && op.recordId === baselineEvent.id)).toBe(false);

    // project.delete is the only surviving op for the project.
    const projectOps = after.filter(
      (op) => op.entity === "project" && op.recordId === "project-240401-apple-shoot"
    );
    expect(projectOps).toHaveLength(1);
    expect(projectOps[0]!.type).toBe("project.delete");
  });

  it("F7 outbound: deleteProject preserves projectScanEvent upserts for other projects", async () => {
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    const sync = new InMemorySyncAdapter();
    const repository = new LocalCatalogRepository(persistence, sync);

    const otherEvent = (await persistence.readSnapshot()).projectScanEvents.find(
      (e) => e.projectId === "project-240320-nike-ad"
    )!;
    await repository.appendProjectScanEvent({
      ...otherEvent,
      observedFolderName: "Nike re-observed",
      updatedAt: "2026-04-06T12:00:00.000Z"
    });

    await repository.deleteProject("project-240401-apple-shoot");

    const remaining = await repository.listPendingSyncOperations();
    expect(remaining.some((op) => op.entity === "projectScanEvent" && op.recordId === otherEvent.id)).toBe(true);
  });

  it("F7 inbound: runSyncCycle cancels pending child upserts on an applied inbound drive.delete", async () => {
    // Architectural-parity test. The Supabase adapter does not emit inbound
    // deletes today (see `mapRowsToRemoteChanges`), but the F7 extension of
    // the F5 handshake keeps the invariant "a cascade-deleted record has
    // no surviving pending upsert" true on both sides regardless.
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);

    const sync = new QueuedPullableSyncAdapter([
      {
        entity: "drive",
        change: "delete",
        remoteUpdatedAt: "2999-01-01T00:00:00.000Z",
        payload: { id: "drive-a" }
      }
    ]);
    const repository = new LocalCatalogRepository(persistence, sync);

    // Seed real pending upserts for a scan, session, and event all on drive-a.
    const baselineSession = (await persistence.readSnapshot()).scanSessions.find(
      (s) => s.scanId === "scan-drive-a-20260405"
    )!;
    await repository.saveScanSession({
      ...baselineSession,
      requestedDriveId: "drive-a",
      updatedAt: "2026-04-06T12:00:00.000Z"
    });
    const baselineScan = (await persistence.readSnapshot()).scans.find(
      (s) => s.id === "scan-drive-a-20260405"
    )!;
    await repository.saveScan({
      ...baselineScan,
      foldersScanned: 999,
      updatedAt: "2026-04-06T12:01:00.000Z"
    });
    const baselineEvent = (await persistence.readSnapshot()).projectScanEvents.find(
      (e) => e.id === "event-project-apple-drive-a"
    )!;
    await repository.appendProjectScanEvent({
      ...baselineEvent,
      observedFolderName: "Re-observed",
      updatedAt: "2026-04-06T12:02:00.000Z"
    });

    await repository.syncNow();

    // The child upserts are gone from the queue, attributable to the F7
    // cancellation path (QueuedPullableSyncAdapter.flush is a no-op, so a
    // vanished entry could not have been quietly drained).
    const afterSync = await repository.listPendingSyncOperations();
    expect(afterSync.some((op) => op.entity === "scan" && op.recordId === "scan-drive-a-20260405")).toBe(false);
    expect(afterSync.some((op) => op.entity === "scanSession" && op.recordId === "scan-drive-a-20260405")).toBe(false);
    expect(afterSync.some((op) => op.entity === "projectScanEvent" && op.recordId === "event-project-apple-drive-a")).toBe(false);

    // And the spy confirms cancelPendingForRecord was called for every
    // cascaded child id (plus the drive itself from the F5 loop).
    const cascadeCalls = sync.cancelCalls.filter(
      (c) => c.entity === "scan" || c.entity === "scanSession" || c.entity === "projectScanEvent"
    );
    expect(cascadeCalls).toEqual(
      expect.arrayContaining([
        { entity: "scan", recordId: "scan-drive-a-20260405" },
        { entity: "scanSession", recordId: "scan-drive-a-20260405" },
        { entity: "projectScanEvent", recordId: "event-project-apple-drive-a" }
      ])
    );
  });

  it("F7 inbound: LWW-rejected drive.delete does NOT cancel child upserts", async () => {
    // Safety rail: the cascade ids are collected only when LWW accepts the
    // inbound delete. A stale (older) inbound delete must leave every child
    // upsert untouched — otherwise an out-of-order remote could silently
    // drop unrelated local work.
    const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
    // Make local drive-a newer than the inbound delete so LWW rejects.
    const baselineDrive = (await persistence.readSnapshot()).drives.find((d) => d.id === "drive-a")!;
    await persistence.upsertDrive({ ...baselineDrive, updatedAt: "2026-04-06T15:00:00.000Z" });

    const sync = new QueuedPullableSyncAdapter([
      {
        entity: "drive",
        change: "delete",
        remoteUpdatedAt: "2026-04-06T14:00:00.000Z", // older than local
        payload: { id: "drive-a" }
      }
    ]);
    const repository = new LocalCatalogRepository(persistence, sync);

    const baselineScan = (await persistence.readSnapshot()).scans.find(
      (s) => s.id === "scan-drive-a-20260405"
    )!;
    await repository.saveScan({
      ...baselineScan,
      foldersScanned: 123,
      updatedAt: "2026-04-06T16:00:00.000Z"
    });

    await repository.syncNow();

    // Scan upsert survives because LWW rejected the inbound delete.
    const remaining = await repository.listPendingSyncOperations();
    expect(remaining.some((op) => op.entity === "scan" && op.recordId === "scan-drive-a-20260405")).toBe(true);

    // And cancelPendingForRecord was never called for the scan id.
    expect(sync.cancelCalls.some((c) => c.entity === "scan")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Pass 5 / F8 — outbound delete must not push on the way out.
  //
  // Regression guard for the pre-Pass-5 behavior of the repository's private
  // `cancelPendingQueueEntriesForRecord` helper. That helper read the queue,
  // called `sync.flush()`, then re-enqueued the survivors. On a remote-ready
  // adapter, `flush()` pushes every dispatchable entry — including both
  // unrelated pending upserts and the very entry the helper was trying to
  // cancel — before the subsequent `enqueueDelete` could land. Pass 5
  // replaced it with `SyncAdapter.cancelPendingForRecord`, a pure local
  // filter that never touches the remote.
  //
  // These tests run the repository against a real `SqliteSyncAdapter` wired
  // to a spy `RemoteSyncAdapter`, so a regression that reintroduces the old
  // helper would be caught as a non-zero push spy count.
  // -------------------------------------------------------------------------

  it("F8: deleteDrive does NOT push to remote even when unrelated pending upserts exist", async () => {
    const directory = mkdtempSync(join(tmpdir(), "drive-project-catalog-f8-"));

    try {
      const pushes: SyncOperation[][] = [];
      const remote: RemoteSyncAdapter = {
        mode: "remote-ready",
        async pushChanges(request) {
          pushes.push([...request.operations]);
          return {
            acceptedOperationIds: request.operations.map((op) => op.id),
            rejected: [],
            remoteCursor: "cursor-after-push"
          };
        },
        async pullChanges() {
          return { changes: [], remoteCursor: null };
        }
      };
      const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
      const sync = new SqliteSyncAdapter({
        loadDatabase: async () => openNodeSqlDatabase(join(directory, "sync.db")),
        remote
      });
      const repository = new LocalCatalogRepository(persistence, sync);

      // Queue an upsert for drive-b — totally unrelated to the drive we delete.
      const driveB = (await repository.getDriveById("drive-b"))!;
      await repository.saveDrive({ ...driveB, displayName: "Unrelated Edit" });
      expect(await repository.listPendingSyncOperations()).toHaveLength(1);

      // And queue an upsert for drive-a itself — the target of the delete.
      const driveA = (await repository.getDriveById("drive-a"))!;
      await repository.saveDrive({ ...driveA, displayName: "About To Be Deleted" });
      expect(await repository.listPendingSyncOperations()).toHaveLength(2);

      // Sanity: no pushes yet.
      expect(pushes).toHaveLength(0);

      await repository.deleteDrive("drive-a");

      // REGRESSION GUARD: the old helper would have pushed both drive-a.upsert
      // (the target it was trying to cancel) and drive-b.upsert (unrelated) to
      // the remote as a side-effect of deleteDrive. Pass 5's primitive must
      // push NOTHING.
      expect(pushes).toHaveLength(0);

      // The unrelated drive-b upsert survives untouched in the queue.
      const remaining = await repository.listPendingSyncOperations();
      expect(remaining.some((op) => op.entity === "drive" && op.recordId === "drive-b" && op.change === "upsert")).toBe(true);

      // The drive-a upsert was cancelled (the whole point of the helper).
      expect(remaining.some((op) => op.entity === "drive" && op.recordId === "drive-a" && op.change === "upsert")).toBe(false);

      // And the drive-a delete is the only surviving op for drive-a.
      const driveAOps = remaining.filter((op) => op.entity === "drive" && op.recordId === "drive-a");
      expect(driveAOps).toHaveLength(1);
      expect(driveAOps[0]!.type).toBe("drive.delete");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("F8: deleteProject does NOT push to remote even when unrelated pending upserts exist", async () => {
    const directory = mkdtempSync(join(tmpdir(), "drive-project-catalog-f8-"));

    try {
      const pushes: SyncOperation[][] = [];
      const remote: RemoteSyncAdapter = {
        mode: "remote-ready",
        async pushChanges(request) {
          pushes.push([...request.operations]);
          return {
            acceptedOperationIds: request.operations.map((op) => op.id),
            rejected: [],
            remoteCursor: "cursor-after-push"
          };
        },
        async pullChanges() {
          return { changes: [], remoteCursor: null };
        }
      };
      const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
      const sync = new SqliteSyncAdapter({
        loadDatabase: async () => openNodeSqlDatabase(join(directory, "sync.db")),
        remote
      });
      const repository = new LocalCatalogRepository(persistence, sync);

      // Queue an upsert for an unrelated project.
      const unrelated = (await repository.getProjectById("project-240320-nike-ad"))!;
      await repository.saveProject({ ...unrelated, correctedProject: "Unrelated Edit" });

      // And an upsert for the project we are about to delete.
      const target = (await repository.getProjectById("project-240401-apple-shoot"))!;
      await repository.saveProject({ ...target, correctedProject: "About To Be Deleted" });

      expect(pushes).toHaveLength(0);

      await repository.deleteProject("project-240401-apple-shoot");

      // REGRESSION GUARD: must not push anything as a side-effect of delete.
      expect(pushes).toHaveLength(0);

      const remaining = await repository.listPendingSyncOperations();
      // Unrelated upsert survived.
      expect(remaining.some((op) => op.entity === "project" && op.recordId === "project-240320-nike-ad" && op.change === "upsert")).toBe(true);
      // Target's upsert was cancelled.
      expect(remaining.some((op) => op.entity === "project" && op.recordId === "project-240401-apple-shoot" && op.change === "upsert")).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("F8: deleteDrive preserves retry history (lastError, attempts) on unrelated failed entries", async () => {
    // Extra regression guard for the re-enqueue branch of the old helper.
    // The pre-Pass-5 helper's re-enqueue path ran survivors through
    // `SyncAdapter.enqueue`, which normalizes incoming ops to
    // `status: "pending", attempts: 0, lastAttemptAt: null, lastError: null`
    // (see `compactSyncQueue` / `normalizeSyncOperation`). So any failed
    // entry with real error context was silently reset — corrupting the
    // sync state machine's diagnostic trail. The Pass 3 primitive never
    // touches non-target entries, so this information survives.
    const directory = mkdtempSync(join(tmpdir(), "drive-project-catalog-f8-"));

    try {
      const persistence = new InMemoryLocalPersistence(mockCatalogSnapshot);
      const pushes: SyncOperation[][] = [];
      const remote: RemoteSyncAdapter = {
        mode: "remote-ready",
        async pushChanges(request) {
          pushes.push([...request.operations]);
          return {
            acceptedOperationIds: request.operations.map((op) => op.id),
            rejected: [],
            remoteCursor: "cursor"
          };
        },
        async pullChanges() {
          return { changes: [], remoteCursor: null };
        }
      };
      const databasePath = join(directory, "sync.db");
      const sync = new SqliteSyncAdapter({
        loadDatabase: async () => openNodeSqlDatabase(databasePath),
        remote
      });
      const repository = new LocalCatalogRepository(persistence, sync);

      // Seed a pre-existing failed op for drive-b (an unrelated record) via
      // the adapter's own enqueue, then mutate its status fields directly in
      // SQLite to simulate "previous push attempt failed with a transport
      // error; we want to retry it later".
      await sync.enqueue({
        id: "pre-existing-failed",
        type: "drive.upsert",
        entity: "drive",
        recordId: "drive-b",
        change: "upsert",
        occurredAt: "2026-04-06T11:00:00.000Z",
        recordUpdatedAt: "2026-04-06T11:00:00.000Z",
        payload: { id: "drive-b", displayName: "Needs Retry" },
        source: "manual",
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        lastError: null
      });
      const rawDatabase = openNodeSqlDatabase(databasePath);
      await rawDatabase.execute(
        "UPDATE sync_queue SET status = 'failed', attempts = 2, last_attempt_at = '2026-04-06T11:05:00.000Z', last_error = 'Transport timeout — retry later' WHERE id = 'pre-existing-failed'"
      );

      await repository.deleteDrive("drive-a");

      // No push happened as a side-effect.
      expect(pushes).toHaveLength(0);

      // The failed op for drive-b is still failed, with attempts and lastError
      // intact — NOT reset to pending/0/null as the old helper would have done.
      const queue = await sync.listQueue();
      const preserved = queue.find((op) => op.id === "pre-existing-failed");
      expect(preserved).toBeDefined();
      expect(preserved!.status).toBe("failed");
      expect(preserved!.attempts).toBe(2);
      expect(preserved!.lastError).toBe("Transport timeout — retry later");
      expect(preserved!.lastAttemptAt).toBe("2026-04-06T11:05:00.000Z");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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

  // -------------------------------------------------------------------------
  // Case E — Edit / update flow
  // -------------------------------------------------------------------------

  it("updateProjectMetadata writes only DB metadata — folderName and folderPath are untouched", async () => {
    const repository = new LocalCatalogRepository(
      new InMemoryLocalPersistence(mockCatalogSnapshot),
      new InMemorySyncAdapter()
    );

    const before = await repository.getProjectById("project-240401-apple-shoot");
    expect(before).not.toBeNull();

    const updated = await repository.updateProjectMetadata({
      projectId: "project-240401-apple-shoot",
      correctedDate: null,
      correctedClient: "Apple Creative",
      correctedProject: "Global Campaign",
      category: "photo",
      folderType: null
    });

    expect(updated.correctedClient).toBe("Apple Creative");
    expect(updated.correctedProject).toBe("Global Campaign");
    // Disk-level identity fields must never change
    expect(updated.folderName).toBe(before!.folderName);
    expect(updated.folderPath).toBe(before!.folderPath);
    expect(updated.parsedDate).toBe(before!.parsedDate);
    expect(updated.parsedClient).toBe(before!.parsedClient);
    expect(updated.parsedProject).toBe(before!.parsedProject);
  });

  it("re-scanning a project after an edit does not overwrite corrected metadata", async () => {
    const repository = new LocalCatalogRepository(
      new InMemoryLocalPersistence(mockCatalogSnapshot),
      new InMemorySyncAdapter()
    );

    // User edits the project
    await repository.updateProjectMetadata({
      projectId: "project-240401-apple-shoot",
      correctedDate: null,
      correctedClient: "Apple Creative",
      correctedProject: "Global Campaign",
      category: "photo",
      folderType: null
    });

    // Drive is re-scanned — same folder observed again
    await repository.ingestScanSnapshot({
      scanId: "scan-drive-a-rescan",
      rootPath: "/Volumes/Drive A",
      driveName: "Drive A",
      status: "completed",
      startedAt: "2026-04-08T10:00:00.000Z",
      finishedAt: "2026-04-08T10:05:00.000Z",
      foldersScanned: 1,
      matchesFound: 1,
      error: null,
      sizeJobsPending: 0,
      createdAt: "2026-04-08T10:00:00.000Z",
      updatedAt: "2026-04-08T10:05:00.000Z",
      projects: [
        {
          id: "scan-project-rescan",
          folderType: "client" as const,
          folderName: "240401_Apple_ProductShoot",
          folderPath: "/Volumes/Drive A/240401_Apple_ProductShoot",
          relativePath: "240401_Apple_ProductShoot",
          parsedDate: "240401",
          parsedClient: "Apple",
          parsedProject: "ProductShoot",
          sourceDriveName: "Drive A",
          scanTimestamp: "2026-04-08T10:01:00.000Z",
          sizeStatus: "ready",
          sizeBytes: 130_000_000_000,
          sizeError: null
        }
      ]
    });

    const project = await repository.getProjectById("project-240401-apple-shoot");

    // Corrections must survive the rescan
    expect(project?.correctedClient).toBe("Apple Creative");
    expect(project?.correctedProject).toBe("Global Campaign");
    // But physical scan data is updated
    expect(project?.sizeBytes).toBe(130_000_000_000);
  });

  it("reclassifies a personal_folder to client when folderType is provided in updateProjectMetadata", async () => {
    const repository = new LocalCatalogRepository(
      new InMemoryLocalPersistence(mockCatalogSnapshot),
      new InMemorySyncAdapter()
    );

    // Inject a personal_folder project
    const personalFolder = mockCatalogSnapshot.projects.find((p) => p.folderType === "personal_project")!;
    const unclassified = await repository.saveProject({
      ...personalFolder,
      id: "project-tutorials",
      folderType: "personal_folder",
      folderName: "Tutorials",
      folderPath: "/Volumes/Drive A/Tutorials",
      parsedDate: null,
      parsedClient: null,
      parsedProject: null,
      correctedDate: null,
      correctedClient: null,
      correctedProject: null,
      isStandardized: false
    });

    expect(unclassified.folderType).toBe("personal_folder");
    expect(unclassified.isStandardized).toBe(false);

    // User reclassifies it via the edit flow
    const reclassified = await repository.updateProjectMetadata({
      projectId: "project-tutorials",
      correctedDate: "240315",
      correctedClient: "Internal",
      correctedProject: "Tutorials",
      category: "personal",
      folderType: "personal_project"
    });

    expect(reclassified.folderType).toBe("personal_project");
    expect(reclassified.isStandardized).toBe(true);
    expect(reclassified.correctedDate).toBe("240315");
    // Disk-level folder name is NOT changed
    expect(reclassified.folderName).toBe("Tutorials");
    expect(reclassified.folderPath).toBe("/Volumes/Drive A/Tutorials");
  });

  describe("reclassifyLegacyFolderTypes", () => {
    async function seedProject(
      repository: LocalCatalogRepository,
      overrides: {
        id: string;
        folderName: string;
        folderType: "client" | "personal_project" | "personal_folder";
        isManual?: boolean;
        isStandardized?: boolean;
        parsedDate?: string | null;
        parsedClient?: string | null;
        parsedProject?: string | null;
      }
    ) {
      const template = mockCatalogSnapshot.projects.find((p) => p.folderType === "personal_project")!;
      return repository.saveProject({
        ...template,
        id: overrides.id,
        folderType: overrides.folderType,
        folderName: overrides.folderName,
        folderPath: `/Volumes/Drive A/${overrides.folderName}`,
        parsedDate: overrides.parsedDate ?? null,
        parsedClient: overrides.parsedClient ?? null,
        parsedProject: overrides.parsedProject ?? null,
        correctedDate: null,
        correctedClient: null,
        correctedProject: null,
        isManual: overrides.isManual ?? false,
        isStandardized: overrides.isStandardized ?? false
      });
    }

    it("upgrades a legacy personal_folder whose name matches the client pattern", async () => {
      const repository = new LocalCatalogRepository(
        new InMemoryLocalPersistence(mockCatalogSnapshot),
        new InMemorySyncAdapter()
      );

      await seedProject(repository, {
        id: "project-legacy-apple",
        folderName: "240401_Apple_ProductShoot",
        folderType: "personal_folder"
      });

      const result = await repository.reclassifyLegacyFolderTypes();

      expect(result.examinedCount).toBe(1);
      expect(result.clientReclassifiedCount).toBe(1);
      expect(result.personalProjectReclassifiedCount).toBe(0);
      expect(result.unchangedCount).toBe(0);

      const upgraded = await repository.getProjectById("project-legacy-apple");
      expect(upgraded?.folderType).toBe("client");
      expect(upgraded?.isStandardized).toBe(true);
      expect(upgraded?.parsedDate).toBe("240401");
      expect(upgraded?.parsedClient).toBe("Apple");
      expect(upgraded?.parsedProject).toBe("ProductShoot");
      // Disk-level folder identity is preserved
      expect(upgraded?.folderName).toBe("240401_Apple_ProductShoot");
    });

    it("upgrades a legacy personal_folder whose name matches the personal_project pattern", async () => {
      const repository = new LocalCatalogRepository(
        new InMemoryLocalPersistence(mockCatalogSnapshot),
        new InMemorySyncAdapter()
      );

      await seedProject(repository, {
        id: "project-legacy-internal",
        folderName: "240401_Internal_Archive",
        folderType: "personal_folder"
      });

      const result = await repository.reclassifyLegacyFolderTypes();

      expect(result.examinedCount).toBe(1);
      expect(result.clientReclassifiedCount).toBe(0);
      expect(result.personalProjectReclassifiedCount).toBe(1);
      expect(result.unchangedCount).toBe(0);

      const upgraded = await repository.getProjectById("project-legacy-internal");
      expect(upgraded?.folderType).toBe("personal_project");
      expect(upgraded?.isStandardized).toBe(true);
      expect(upgraded?.parsedDate).toBe("240401");
      expect(upgraded?.parsedClient).toBeNull();
      expect(upgraded?.parsedProject).toBe("Archive");
    });

    it("counts unchanged personal_folder rows that cannot be upgraded", async () => {
      const repository = new LocalCatalogRepository(
        new InMemoryLocalPersistence(mockCatalogSnapshot),
        new InMemorySyncAdapter()
      );

      await seedProject(repository, {
        id: "project-legacy-unstructured",
        folderName: "Miscellaneous Notes",
        folderType: "personal_folder"
      });

      const result = await repository.reclassifyLegacyFolderTypes();

      expect(result.examinedCount).toBe(1);
      expect(result.unchangedCount).toBe(1);
      expect(result.clientReclassifiedCount).toBe(0);
      expect(result.personalProjectReclassifiedCount).toBe(0);

      const untouched = await repository.getProjectById("project-legacy-unstructured");
      expect(untouched?.folderType).toBe("personal_folder");
    });

    it("skips manually created personal_folder rows even if the name would classify", async () => {
      const repository = new LocalCatalogRepository(
        new InMemoryLocalPersistence(mockCatalogSnapshot),
        new InMemorySyncAdapter()
      );

      await seedProject(repository, {
        id: "project-manual-personal",
        folderName: "240401_Apple_ProductShoot",
        folderType: "personal_folder",
        isManual: true
      });

      const result = await repository.reclassifyLegacyFolderTypes();

      expect(result.examinedCount).toBe(0);
      expect(result.clientReclassifiedCount).toBe(0);

      const untouched = await repository.getProjectById("project-manual-personal");
      expect(untouched?.folderType).toBe("personal_folder");
      expect(untouched?.isManual).toBe(true);
    });

    it("does not downgrade structured rows (client / personal_project are never examined)", async () => {
      const repository = new LocalCatalogRepository(
        new InMemoryLocalPersistence(mockCatalogSnapshot),
        new InMemorySyncAdapter()
      );

      // A client row whose folderName would NOT classify — if we examined it,
      // we would downgrade it to personal_folder. The guard must prevent that.
      await seedProject(repository, {
        id: "project-legacy-client-unstructured",
        folderName: "Miscellaneous Notes",
        folderType: "client",
        parsedDate: "240401",
        parsedClient: "Apple",
        parsedProject: "ProductShoot"
      });

      const result = await repository.reclassifyLegacyFolderTypes();

      expect(result.examinedCount).toBe(0);
      expect(result.clientReclassifiedCount).toBe(0);
      expect(result.personalProjectReclassifiedCount).toBe(0);

      const untouched = await repository.getProjectById("project-legacy-client-unstructured");
      expect(untouched?.folderType).toBe("client");
    });

    it("reports mixed counts across a batch of legacy rows", async () => {
      const repository = new LocalCatalogRepository(
        new InMemoryLocalPersistence(mockCatalogSnapshot),
        new InMemorySyncAdapter()
      );

      await seedProject(repository, {
        id: "project-legacy-a",
        folderName: "240401_Apple_ProductShoot",
        folderType: "personal_folder"
      });
      await seedProject(repository, {
        id: "project-legacy-b",
        folderName: "240402_Nike_Campaign",
        folderType: "personal_folder"
      });
      await seedProject(repository, {
        id: "project-legacy-c",
        folderName: "240403_Internal_Planning",
        folderType: "personal_folder"
      });
      await seedProject(repository, {
        id: "project-legacy-d",
        folderName: "Random Notes",
        folderType: "personal_folder"
      });

      const result = await repository.reclassifyLegacyFolderTypes();

      expect(result.examinedCount).toBe(4);
      expect(result.clientReclassifiedCount).toBe(2);
      expect(result.personalProjectReclassifiedCount).toBe(1);
      expect(result.unchangedCount).toBe(1);
    });

    it("enqueues sync operations for each upgraded row", async () => {
      const repository = new LocalCatalogRepository(
        new InMemoryLocalPersistence(mockCatalogSnapshot),
        new InMemorySyncAdapter()
      );

      await seedProject(repository, {
        id: "project-legacy-sync",
        folderName: "240401_Apple_ProductShoot",
        folderType: "personal_folder"
      });

      // Baseline pending queue before reclassify (the seed itself enqueued one op).
      await repository.flushSync();
      await expect(repository.listPendingSyncOperations()).resolves.toHaveLength(0);

      await repository.reclassifyLegacyFolderTypes();

      const queued = await repository.listPendingSyncOperations();
      expect(queued).toHaveLength(1);
      expect(queued[0]?.recordId).toBe("project-legacy-sync");
    });
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
  cancelCalls: Array<{ entity: string; recordId: string }> = [];

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

  async cancelPendingForRecord(entity: string, recordId: string): Promise<number> {
    this.cancelCalls.push({ entity, recordId });
    return 0;
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

  async cancelPendingForRecord(_entity: string, _recordId: string): Promise<number> {
    return 0;
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

/**
 * Test adapter that combines a real InMemorySyncAdapter-style queue (via
 * delegation) with a configurable pull result. Used for Pass 3 / F5
 * end-to-end tests that verify the inbound-delete → queue-cancellation
 * handshake through a genuine queue round-trip, rather than a pure spy.
 *
 * Why a new class instead of extending StubSyncAdapter: the existing stub
 * is intentionally queue-less (its `enqueue` is a no-op) so it can drive
 * state-transition tests without queue noise. F5 end-to-end needs the
 * opposite — a real queue that observably loses entries when
 * `cancelPendingForRecord` fires.
 *
 * Note on `flush`: intentionally a no-op that preserves the queue. This
 * simulates "remote unavailable / push failed" so the end-to-end test can
 * attribute any queue reduction to `cancelPendingForRecord` rather than
 * to the push phase of the cycle. `InMemorySyncAdapter.flush()` drains
 * the whole queue, which would hide F5's effect.
 */
class QueuedPullableSyncAdapter implements SyncAdapter {
  #inner = new InMemorySyncAdapter();
  #pullResult: SyncPullResult;
  cancelCalls: Array<{ entity: string; recordId: string }> = [];

  constructor(changes: SyncPullResult["changes"] = []) {
    this.#pullResult = { changes, remoteCursor: "cursor-1" };
  }

  async enqueue(operation: SyncOperation): Promise<void> {
    await this.#inner.enqueue(operation);
  }

  async listPending(): Promise<SyncOperation[]> {
    return this.#inner.listPending();
  }

  async listQueue(): Promise<SyncOperation[]> {
    return this.#inner.listQueue();
  }

  async flush(): Promise<SyncResult> {
    const pending = await this.#inner.listPending();
    return { pushed: 0, pending: pending.length };
  }

  async pull(): Promise<SyncPullResult> {
    return this.#pullResult;
  }

  async getState(): Promise<SyncState> {
    return this.#inner.getState();
  }

  async recoverInterruptedState(): Promise<SyncRecoveryResult> {
    return this.#inner.recoverInterruptedState();
  }

  async cancelPendingForRecord(entity: SyncableCatalogEntity, recordId: string): Promise<number> {
    this.cancelCalls.push({ entity, recordId });
    return this.#inner.cancelPendingForRecord(entity, recordId);
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
