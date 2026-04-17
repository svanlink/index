import type {
  Drive,
  Project,
  ProjectScanEvent,
  ScanProjectRecord,
  ScanRecord,
  ScanSessionSnapshot
} from "@drive-project-catalog/domain";
import { describe, expect, it } from "vitest";
import { InMemoryLocalPersistence } from "./inMemoryLocalPersistence";
import type { CatalogSnapshot } from "./localPersistence";
import { applyRemoteSyncChanges } from "./remoteSyncMerge";

// F3 — mergeRemoteScanSession is internal; we test it through applyRemoteSyncChanges
// which is the only public caller. The invariant under test is that a remote pull
// must never wipe out the locally-observed `projects` or `rootPath` on a scan
// session — those fields are local-only by the supabaseSyncMapping contract
// (`localOnlySyncFields.scanSession = ["rootPath", "projects"]`).

function makeEmptySnapshot(): CatalogSnapshot {
  return {
    drives: [],
    projects: [],
    scans: [],
    projectScanEvents: [],
    scanSessions: []
  };
}

function makeScanProject(id: string, overrides: Partial<ScanProjectRecord> = {}): ScanProjectRecord {
  return {
    id,
    folderName: `${id}-folder`,
    folderPath: `/Volumes/Local/${id}`,
    relativePath: `${id}`,
    folderType: "client",
    parsedDate: null,
    parsedClient: null,
    parsedProject: null,
    sourceDriveName: "Local Drive",
    scanTimestamp: "2026-04-06T10:00:00.000Z",
    sizeStatus: "ready",
    sizeBytes: 1_000_000,
    sizeError: null,
    ...overrides
  };
}

function makeDrive(id: string, overrides: Partial<Drive> = {}): Drive {
  return {
    id,
    volumeName: `${id}-volume`,
    displayName: `${id}-display`,
    totalCapacityBytes: 1_000_000_000,
    usedBytes: 500_000_000,
    freeBytes: 500_000_000,
    reservedIncomingBytes: 0,
    lastScannedAt: null,
    createdManually: false,
    createdAt: "2026-04-06T10:00:00.000Z",
    updatedAt: "2026-04-06T10:00:00.000Z",
    ...overrides
  };
}

function makeProject(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    folderType: "client",
    isStandardized: true,
    folderName: `${id}-folder`,
    folderPath: null,
    parsedDate: "260406",
    parsedClient: `${id}-client`,
    parsedProject: `${id}-project`,
    correctedDate: null,
    correctedClient: null,
    correctedProject: null,
    category: null,
    sizeBytes: 1_000_000,
    sizeStatus: "ready",
    currentDriveId: null,
    targetDriveId: null,
    moveStatus: "none",
    missingStatus: "normal",
    duplicateStatus: "normal",
    isUnassigned: true,
    isManual: false,
    lastSeenAt: null,
    lastScannedAt: null,
    createdAt: "2026-04-06T10:00:00.000Z",
    updatedAt: "2026-04-06T10:00:00.000Z",
    ...overrides
  };
}

function makeScanRecord(id: string, overrides: Partial<ScanRecord> = {}): ScanRecord {
  return {
    id,
    driveId: null,
    startedAt: "2026-04-06T10:00:00.000Z",
    finishedAt: "2026-04-06T10:05:00.000Z",
    status: "completed",
    foldersScanned: 1,
    matchesFound: 1,
    notes: null,
    createdAt: "2026-04-06T10:00:00.000Z",
    updatedAt: "2026-04-06T10:05:00.000Z",
    ...overrides
  };
}

function makeProjectScanEvent(
  id: string,
  overrides: Partial<ProjectScanEvent> = {}
): ProjectScanEvent {
  return {
    id,
    projectId: "project-a",
    scanId: "scan-a",
    observedFolderName: "folder",
    observedDriveName: "Drive A",
    observedFolderType: "client",
    observedAt: "2026-04-06T10:00:00.000Z",
    createdAt: "2026-04-06T10:00:00.000Z",
    updatedAt: "2026-04-06T10:00:00.000Z",
    ...overrides
  };
}

function makeSession(
  scanId: string,
  overrides: Partial<ScanSessionSnapshot> = {}
): ScanSessionSnapshot {
  return {
    scanId,
    rootPath: "",
    driveName: "Drive",
    status: "completed",
    startedAt: "2026-04-06T10:00:00.000Z",
    finishedAt: "2026-04-06T10:05:00.000Z",
    foldersScanned: 1,
    matchesFound: 1,
    error: null,
    sizeJobsPending: 0,
    projects: [],
    requestedDriveId: null,
    requestedDriveName: null,
    summary: null,
    createdAt: "2026-04-06T10:00:00.000Z",
    updatedAt: "2026-04-06T10:05:00.000Z",
    ...overrides
  };
}

describe("applyRemoteSyncChanges — scan session merge (F3)", () => {
  it("preserves locally-observed projects when a remote session arrives with projects: []", async () => {
    // This is the load-bearing case under the current adapter: Supabase strips
    // `projects` on push and rehydrates as `[]` on pull, so every remote scan
    // session change carries an empty projects array. The merge must keep the
    // local list intact rather than overwrite it.
    const localProjects = [makeScanProject("sp-local-1"), makeScanProject("sp-local-2")];
    const snapshot = makeEmptySnapshot();
    snapshot.scanSessions = [
      makeSession("scan-a", {
        rootPath: "/Volumes/Local/rootA",
        projects: localProjects,
        updatedAt: "2026-04-06T10:00:00.000Z"
      })
    ];
    const persistence = new InMemoryLocalPersistence(snapshot);

    const result = await applyRemoteSyncChanges({
      persistence,
      changes: [
        {
          entity: "scanSession",
          change: "upsert",
          remoteUpdatedAt: "2026-04-06T12:00:00.000Z",
          payload: makeSession("scan-a", {
            rootPath: "",
            projects: [], // as produced by fromSupabaseScanSessionRow
            updatedAt: "2026-04-06T12:00:00.000Z",
            foldersScanned: 5
          })
        }
      ]
    });

    expect(result.appliedCount).toBe(1);
    const merged = (await persistence.listScanSessions()).find((s) => s.scanId === "scan-a");
    expect(merged).toBeDefined();
    expect(merged!.projects.map((p) => p.id)).toEqual(["sp-local-1", "sp-local-2"]);
    expect(merged!.rootPath).toBe("/Volumes/Local/rootA");
    // Fields that legitimately come from the remote still get applied.
    expect(merged!.foldersScanned).toBe(5);
    expect(merged!.updatedAt).toBe("2026-04-06T12:00:00.000Z");
  });

  it("unions remote-only projects with local projects, keeping local on id conflict", async () => {
    // Defensive behavior for a hypothetical future where remote.projects is
    // populated (e.g. via a dedicated scan_session_projects entity). Today
    // this path is unreachable, but the merge should not regress if reached.
    const localProjects = [
      makeScanProject("sp-shared", { folderName: "local-name" }),
      makeScanProject("sp-local-only")
    ];
    const snapshot = makeEmptySnapshot();
    snapshot.scanSessions = [
      makeSession("scan-b", {
        projects: localProjects,
        updatedAt: "2026-04-06T10:00:00.000Z"
      })
    ];
    const persistence = new InMemoryLocalPersistence(snapshot);

    await applyRemoteSyncChanges({
      persistence,
      changes: [
        {
          entity: "scanSession",
          change: "upsert",
          remoteUpdatedAt: "2026-04-06T12:00:00.000Z",
          payload: makeSession("scan-b", {
            projects: [
              makeScanProject("sp-shared", { folderName: "remote-name" }),
              makeScanProject("sp-remote-only")
            ],
            updatedAt: "2026-04-06T12:00:00.000Z"
          })
        }
      ]
    });

    const merged = (await persistence.listScanSessions()).find((s) => s.scanId === "scan-b");
    expect(merged).toBeDefined();
    const byId = new Map(merged!.projects.map((p) => [p.id, p] as const));
    expect(byId.size).toBe(3);
    // Shared id keeps the local copy.
    expect(byId.get("sp-shared")!.folderName).toBe("local-name");
    // Remote-only id is appended.
    expect(byId.get("sp-remote-only")).toBeDefined();
  });

  it("takes the remote projects when there is no local session yet", async () => {
    // First-time pull: no local record exists, so remote wins by definition.
    const snapshot = makeEmptySnapshot();
    const persistence = new InMemoryLocalPersistence(snapshot);

    await applyRemoteSyncChanges({
      persistence,
      changes: [
        {
          entity: "scanSession",
          change: "upsert",
          remoteUpdatedAt: "2026-04-06T12:00:00.000Z",
          payload: makeSession("scan-c", {
            projects: [makeScanProject("sp-from-remote")],
            updatedAt: "2026-04-06T12:00:00.000Z"
          })
        }
      ]
    });

    const merged = (await persistence.listScanSessions()).find((s) => s.scanId === "scan-c");
    expect(merged).toBeDefined();
    expect(merged!.projects.map((p) => p.id)).toEqual(["sp-from-remote"]);
  });

  it("does not apply a remote session that is older than the local record", async () => {
    // last-write-wins by updated_at applies to the whole session row, so a
    // stale remote must be rejected before the projects union runs.
    const snapshot = makeEmptySnapshot();
    snapshot.scanSessions = [
      makeSession("scan-d", {
        projects: [makeScanProject("sp-local")],
        updatedAt: "2026-04-06T14:00:00.000Z",
        foldersScanned: 99
      })
    ];
    const persistence = new InMemoryLocalPersistence(snapshot);

    const result = await applyRemoteSyncChanges({
      persistence,
      changes: [
        {
          entity: "scanSession",
          change: "upsert",
          remoteUpdatedAt: "2026-04-06T12:00:00.000Z",
          payload: makeSession("scan-d", {
            projects: [],
            updatedAt: "2026-04-06T12:00:00.000Z",
            foldersScanned: 1
          })
        }
      ]
    });

    expect(result.appliedCount).toBe(0);
    const merged = (await persistence.listScanSessions()).find((s) => s.scanId === "scan-d");
    expect(merged!.projects.map((p) => p.id)).toEqual(["sp-local"]);
    expect(merged!.foldersScanned).toBe(99);
  });
});

describe("applyRemoteSyncChanges — inbound delete handling (F4)", () => {
  // F4 — RemoteSyncChange declares `change: "upsert" | "delete"`, but the
  // merge function historically only handled upserts. Supabase's current
  // pull path hardcodes `change: "upsert"` in `mapRowsToRemoteChanges`, so
  // the gap was latent. These tests close the type contract: when any
  // adapter or harness emits a delete, the merge must apply it (with LWW)
  // or skip it (with documented rationale for unsupported entities).

  it("applies an inbound drive delete and cascades to projects via deleteDrive", async () => {
    // Drive X has two projects referencing it (current + target drive). After
    // inbound delete, both references must be nullified (matching the Pass 1
    // outbound deleteDrive cascade) and the drive row itself removed.
    const snapshot = makeEmptySnapshot();
    snapshot.drives = [makeDrive("drive-X", { updatedAt: "2026-04-06T10:00:00.000Z" })];
    snapshot.projects = [
      makeProject("p-current", {
        currentDriveId: "drive-X",
        updatedAt: "2026-04-06T09:00:00.000Z"
      }),
      makeProject("p-target", {
        currentDriveId: null,
        targetDriveId: "drive-X",
        moveStatus: "pending",
        updatedAt: "2026-04-06T09:00:00.000Z"
      }),
      makeProject("p-unrelated", {
        currentDriveId: null,
        updatedAt: "2026-04-06T09:00:00.000Z"
      })
    ];
    const persistence = new InMemoryLocalPersistence(snapshot);

    const result = await applyRemoteSyncChanges({
      persistence,
      changes: [
        {
          entity: "drive",
          change: "delete",
          remoteUpdatedAt: "2026-04-06T12:00:00.000Z",
          payload: { id: "drive-X", updatedAt: "2026-04-06T12:00:00.000Z" }
        }
      ]
    });

    expect(result.appliedCount).toBe(1);
    expect(await persistence.listDrives()).toEqual([]);

    const projects = await persistence.listProjects();
    const byId = new Map(projects.map((p) => [p.id, p] as const));
    expect(byId.get("p-current")!.currentDriveId).toBeNull();
    expect(byId.get("p-target")!.targetDriveId).toBeNull();
    // Unrelated project is untouched.
    expect(byId.get("p-unrelated")).toBeDefined();
  });

  it("applies an inbound project delete and cascades to project scan events", async () => {
    const snapshot = makeEmptySnapshot();
    snapshot.projects = [
      makeProject("p-delete-me", { updatedAt: "2026-04-06T10:00:00.000Z" }),
      makeProject("p-keep", { updatedAt: "2026-04-06T10:00:00.000Z" })
    ];
    snapshot.projectScanEvents = [
      makeProjectScanEvent("evt-1", { projectId: "p-delete-me" }),
      makeProjectScanEvent("evt-2", { projectId: "p-delete-me" }),
      makeProjectScanEvent("evt-3", { projectId: "p-keep" })
    ];
    const persistence = new InMemoryLocalPersistence(snapshot);

    const result = await applyRemoteSyncChanges({
      persistence,
      changes: [
        {
          entity: "project",
          change: "delete",
          remoteUpdatedAt: "2026-04-06T12:00:00.000Z",
          payload: { id: "p-delete-me", updatedAt: "2026-04-06T12:00:00.000Z" }
        }
      ]
    });

    expect(result.appliedCount).toBe(1);

    const projectIds = (await persistence.listProjects()).map((p) => p.id);
    expect(projectIds).toEqual(["p-keep"]);

    const eventIds = (await persistence.listProjectScanEvents()).map((e) => e.id);
    expect(eventIds).toEqual(["evt-3"]);
  });

  it("rejects an inbound delete that is older than the local record (LWW)", async () => {
    // A stale remote delete must not win over a newer local upsert. This is
    // symmetric with the upsert LWW branch.
    const snapshot = makeEmptySnapshot();
    snapshot.projects = [
      makeProject("p-newer", { updatedAt: "2026-04-06T14:00:00.000Z" })
    ];
    const persistence = new InMemoryLocalPersistence(snapshot);

    const result = await applyRemoteSyncChanges({
      persistence,
      changes: [
        {
          entity: "project",
          change: "delete",
          remoteUpdatedAt: "2026-04-06T12:00:00.000Z",
          payload: { id: "p-newer", updatedAt: "2026-04-06T12:00:00.000Z" }
        }
      ]
    });

    expect(result.appliedCount).toBe(0);
    const projectIds = (await persistence.listProjects()).map((p) => p.id);
    expect(projectIds).toEqual(["p-newer"]);
  });

  it("treats an inbound delete of an unknown id as a no-op (not counted as applied)", async () => {
    // The remote and local already agree the record is gone. We must not
    // increment `appliedCount` — that metric feeds into sync state telemetry
    // and a phantom delete would inflate it.
    const snapshot = makeEmptySnapshot();
    const persistence = new InMemoryLocalPersistence(snapshot);

    const result = await applyRemoteSyncChanges({
      persistence,
      changes: [
        {
          entity: "drive",
          change: "delete",
          remoteUpdatedAt: "2026-04-06T12:00:00.000Z",
          payload: { id: "drive-does-not-exist", updatedAt: "2026-04-06T12:00:00.000Z" }
        },
        {
          entity: "project",
          change: "delete",
          remoteUpdatedAt: "2026-04-06T12:00:00.000Z",
          payload: { id: "project-does-not-exist", updatedAt: "2026-04-06T12:00:00.000Z" }
        }
      ]
    });

    expect(result.appliedCount).toBe(0);
    expect(await persistence.listDrives()).toEqual([]);
    expect(await persistence.listProjects()).toEqual([]);
  });

  it("lets a newer upsert supersede a buffered delete in the same batch", async () => {
    // Pull batches normally carry one change per id (PostgREST cursor
    // semantics), but a defensive implementation must not regress if the
    // assumption breaks. Later = newer, regardless of delete vs upsert.
    const snapshot = makeEmptySnapshot();
    snapshot.drives = [makeDrive("drive-X", { updatedAt: "2026-04-06T09:00:00.000Z" })];
    const persistence = new InMemoryLocalPersistence(snapshot);

    const result = await applyRemoteSyncChanges({
      persistence,
      changes: [
        {
          entity: "drive",
          change: "delete",
          remoteUpdatedAt: "2026-04-06T10:00:00.000Z",
          payload: { id: "drive-X", updatedAt: "2026-04-06T10:00:00.000Z" }
        },
        {
          entity: "drive",
          change: "upsert",
          remoteUpdatedAt: "2026-04-06T11:00:00.000Z",
          payload: makeDrive("drive-X", {
            displayName: "Resurrected",
            updatedAt: "2026-04-06T11:00:00.000Z"
          })
        }
      ]
    });

    // Both changes are accepted against the buffered state: delete clears the
    // map, later upsert reinserts. The drive must survive with the upsert
    // payload.
    expect(result.appliedCount).toBe(2);
    const drives = await persistence.listDrives();
    expect(drives).toHaveLength(1);
    expect(drives[0]!.displayName).toBe("Resurrected");
  });

  it("lets a newer delete supersede a buffered upsert in the same batch", async () => {
    const snapshot = makeEmptySnapshot();
    snapshot.drives = [makeDrive("drive-X", { updatedAt: "2026-04-06T09:00:00.000Z" })];
    const persistence = new InMemoryLocalPersistence(snapshot);

    const result = await applyRemoteSyncChanges({
      persistence,
      changes: [
        {
          entity: "drive",
          change: "upsert",
          remoteUpdatedAt: "2026-04-06T10:00:00.000Z",
          payload: makeDrive("drive-X", {
            displayName: "Intermediate",
            updatedAt: "2026-04-06T10:00:00.000Z"
          })
        },
        {
          entity: "drive",
          change: "delete",
          remoteUpdatedAt: "2026-04-06T11:00:00.000Z",
          payload: { id: "drive-X", updatedAt: "2026-04-06T11:00:00.000Z" }
        }
      ]
    });

    expect(result.appliedCount).toBe(2);
    expect(await persistence.listDrives()).toEqual([]);
  });

  it("silently skips deletes for scan, scanSession, and projectScanEvent entities", async () => {
    // None of these entities declare a `.delete` variant in
    // `syncOperationTypes`, and `LocalPersistenceAdapter` has no
    // `deleteScan` / `deleteProjectScanEvent` / `deleteScanSession` methods.
    // A defensive `change: "delete"` for these must NOT be applied (we have
    // no safe way to apply it) and must NOT increment `appliedCount`.
    const snapshot = makeEmptySnapshot();
    snapshot.scans = [makeScanRecord("scan-a", { updatedAt: "2026-04-06T10:00:00.000Z" })];
    snapshot.projectScanEvents = [
      makeProjectScanEvent("evt-1", { updatedAt: "2026-04-06T10:00:00.000Z" })
    ];
    snapshot.scanSessions = [
      makeSession("scan-a", { updatedAt: "2026-04-06T10:00:00.000Z" })
    ];
    const persistence = new InMemoryLocalPersistence(snapshot);

    const result = await applyRemoteSyncChanges({
      persistence,
      changes: [
        {
          entity: "scan",
          change: "delete",
          remoteUpdatedAt: "2026-04-06T12:00:00.000Z",
          payload: { id: "scan-a", updatedAt: "2026-04-06T12:00:00.000Z" }
        },
        {
          entity: "projectScanEvent",
          change: "delete",
          remoteUpdatedAt: "2026-04-06T12:00:00.000Z",
          payload: { id: "evt-1", updatedAt: "2026-04-06T12:00:00.000Z" }
        },
        {
          entity: "scanSession",
          change: "delete",
          remoteUpdatedAt: "2026-04-06T12:00:00.000Z",
          payload: { scanId: "scan-a", updatedAt: "2026-04-06T12:00:00.000Z" }
        }
      ]
    });

    expect(result.appliedCount).toBe(0);
    expect((await persistence.listScans()).map((s) => s.id)).toEqual(["scan-a"]);
    expect((await persistence.listProjectScanEvents()).map((e) => e.id)).toEqual(["evt-1"]);
    expect((await persistence.listScanSessions()).map((s) => s.scanId)).toEqual(["scan-a"]);
  });

  it("recomputes derived duplicateStatus after an inbound project delete frees a duplicate cluster", async () => {
    // Before: p-alpha on drive-A and p-beta on drive-B are duplicates (same
    // parsed identity, different drives -> duplicateStatus = 'duplicate').
    // After inbound delete of p-beta: p-alpha is no longer in a multi-drive
    // cluster and must drop back to duplicateStatus = 'normal'. This
    // exercises `applyDerivedProjectStates` running on the post-delete view.
    const snapshot = makeEmptySnapshot();
    snapshot.drives = [
      makeDrive("drive-A", { updatedAt: "2026-04-06T10:00:00.000Z" }),
      makeDrive("drive-B", { updatedAt: "2026-04-06T10:00:00.000Z" })
    ];
    snapshot.projects = [
      makeProject("p-alpha", {
        parsedDate: "260406",
        parsedClient: "Acme",
        parsedProject: "Alpha",
        currentDriveId: "drive-A",
        duplicateStatus: "duplicate",
        isUnassigned: false,
        updatedAt: "2026-04-06T10:00:00.000Z"
      }),
      makeProject("p-beta", {
        parsedDate: "260406",
        parsedClient: "Acme",
        parsedProject: "Alpha",
        currentDriveId: "drive-B",
        duplicateStatus: "duplicate",
        isUnassigned: false,
        updatedAt: "2026-04-06T10:00:00.000Z"
      })
    ];
    const persistence = new InMemoryLocalPersistence(snapshot);

    const result = await applyRemoteSyncChanges({
      persistence,
      changes: [
        {
          entity: "project",
          change: "delete",
          remoteUpdatedAt: "2026-04-06T12:00:00.000Z",
          payload: { id: "p-beta", updatedAt: "2026-04-06T12:00:00.000Z" }
        }
      ]
    });

    expect(result.appliedCount).toBe(1);
    const remaining = await persistence.listProjects();
    expect(remaining.map((p) => p.id)).toEqual(["p-alpha"]);
    expect(remaining[0]!.duplicateStatus).toBe("normal");
  });

  it("defensively no-ops a malformed delete payload that lacks an id", async () => {
    // A delete payload must carry at least `{ id: string }`. If a caller
    // emits garbage, we must not throw; we skip and do not increment the
    // applied count.
    const snapshot = makeEmptySnapshot();
    snapshot.drives = [makeDrive("drive-X", { updatedAt: "2026-04-06T10:00:00.000Z" })];
    const persistence = new InMemoryLocalPersistence(snapshot);

    const result = await applyRemoteSyncChanges({
      persistence,
      changes: [
        {
          entity: "drive",
          change: "delete",
          remoteUpdatedAt: "2026-04-06T12:00:00.000Z",
          // Intentionally wrong shape — no `id` field.
          payload: { updatedAt: "2026-04-06T12:00:00.000Z" }
        },
        {
          entity: "project",
          change: "delete",
          remoteUpdatedAt: "2026-04-06T12:00:00.000Z",
          // Empty-string id treated the same as missing.
          payload: { id: "", updatedAt: "2026-04-06T12:00:00.000Z" }
        }
      ]
    });

    expect(result.appliedCount).toBe(0);
    expect((await persistence.listDrives()).map((d) => d.id)).toEqual(["drive-X"]);
  });
});
