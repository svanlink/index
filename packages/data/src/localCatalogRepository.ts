import { applyDerivedProjectStates, classifyFolderName, type Drive, type Project, type ProjectScanEvent, type ScanRecord, type ScanSessionSnapshot } from "@drive-project-catalog/domain";
import {
  computeDriveCascadeIds,
  computeProjectCascadeIds,
  type CatalogCascadeIds
} from "./cascadeIds";
import {
  buildDashboardSnapshot,
  buildDriveDetailView,
  decorateDrivesWithCapacity,
  filterProjects,
  sortProjects,
  type DriveDetailView
} from "./catalogSelectors";
import type { LocalPersistenceAdapter } from "./localPersistence";
import { applyRemoteSyncChanges } from "./remoteSyncMerge";
import type {
  CatalogRepository,
  CreateDriveInput,
  CreateProjectInput,
  DashboardSnapshot,
  DriveUpsert,
  ProjectListFilters,
  ProjectUpsert,
  ReclassifyLegacyFolderTypesResult,
  UpdateProjectMetadataInput
} from "./repository";
import { ingestScanSessionSnapshot } from "./scanIngestionService";
import type {
  StartupSyncResult,
  SyncAdapter,
  SyncChangeKind,
  SyncCycleResult,
  SyncMutationSource,
  SyncOperationType,
  SyncState
} from "./sync";

const clone = <T>(value: T): T => structuredClone(value);

export class LocalCatalogRepository implements CatalogRepository {
  #activeSyncPromise: Promise<SyncCycleResult> | null = null;

  constructor(
    private readonly persistence: LocalPersistenceAdapter,
    private readonly sync: SyncAdapter
  ) {}

  async getDashboardSnapshot(): Promise<DashboardSnapshot> {
    const snapshot = await this.persistence.readSnapshot();
    return buildDashboardSnapshot(snapshot);
  }

  async listProjects(filters?: ProjectListFilters): Promise<Project[]> {
    const [projectsSnapshot, drivesSnapshot] = await Promise.all([
      this.persistence.listProjects(),
      this.persistence.listDrives()
    ]);
    const drives = decorateDrivesWithCapacity(drivesSnapshot, projectsSnapshot);
    const projects = sortProjects(projectsSnapshot);
    return filterProjects(projects, drives, filters);
  }

  async listDrives(): Promise<Drive[]> {
    const [drives, projects] = await Promise.all([
      this.persistence.listDrives(),
      this.persistence.listProjects()
    ]);
    return decorateDrivesWithCapacity(drives, projects);
  }

  async listScans(): Promise<ScanRecord[]> {
    return clone(await this.persistence.listScans());
  }

  async listScanSessions(): Promise<ScanSessionSnapshot[]> {
    return clone(await this.persistence.listScanSessions());
  }

  async getScanSession(scanId: string): Promise<ScanSessionSnapshot | null> {
    const session = await this.persistence.getScanSession(scanId);
    return session ? clone(session) : null;
  }

  async listProjectScanEvents(projectId?: string): Promise<ProjectScanEvent[]> {
    return clone(await this.persistence.listProjectScanEvents(projectId));
  }

  async getProjectById(projectId: string): Promise<Project | null> {
    const project = await this.persistence.getProjectById(projectId);
    return project ? clone(project) : null;
  }

  async getDriveById(driveId: string): Promise<Drive | null> {
    const [drive, projects] = await Promise.all([
      this.persistence.getDriveById(driveId),
      this.persistence.listProjects()
    ]);
    const decorated = drive ? decorateDrivesWithCapacity([drive], projects)[0] ?? null : null;
    const driveResult = decorated;
    return driveResult ? clone(driveResult) : null;
  }

  async getDriveDetailView(driveId: string): Promise<DriveDetailView | null> {
    const snapshot = await this.persistence.readSnapshot();
    const detail = buildDriveDetailView(snapshot, driveId);
    return detail ? clone(detail) : null;
  }

  async saveProject(input: ProjectUpsert): Promise<Project> {
    const project = clone(input);
    const currentProjects = await this.persistence.listProjects();
    const projects = applyDerivedProjectStates(upsertById(currentProjects, project));
    const changedProjects = getChangedById(currentProjects, projects);

    await this.persistence.upsertProjects(changedProjects);
    await this.enqueue("project.upsert", project);

    return clone(projects.find((entry) => entry.id === project.id) ?? project);
  }

  async saveDrive(input: DriveUpsert): Promise<Drive> {
    const drive = clone(input);
    await this.persistence.upsertDrive(drive);
    await this.enqueue("drive.upsert", drive);

    return drive;
  }

  async saveScan(scan: ScanRecord): Promise<ScanRecord> {
    const savedScan = clone({
      ...scan,
      createdAt: scan.createdAt ?? scan.startedAt,
      updatedAt: scan.updatedAt ?? scan.finishedAt ?? scan.startedAt
    });
    await this.persistence.upsertScan(savedScan);
    await this.enqueue("scan.upsert", savedScan, "scan");

    return savedScan;
  }

  async saveScanSession(session: ScanSessionSnapshot): Promise<ScanSessionSnapshot> {
    const savedSession = clone({
      ...session,
      requestedDriveId: session.requestedDriveId ?? null,
      requestedDriveName: session.requestedDriveName ?? null,
      summary: session.summary ?? null,
      createdAt: session.createdAt ?? session.startedAt,
      updatedAt: session.updatedAt ?? session.finishedAt ?? session.startedAt
    });

    await this.persistence.upsertScanSession(savedSession);
    await this.enqueue("scanSession.upsert", savedSession, "scan");

    return savedSession;
  }

  async appendProjectScanEvent(event: ProjectScanEvent): Promise<ProjectScanEvent> {
    const savedEvent = clone({
      ...event,
      createdAt: event.createdAt ?? event.observedAt,
      updatedAt: event.updatedAt ?? event.observedAt
    });

    await this.persistence.upsertProjectScanEvent(savedEvent);
    await this.enqueue("projectScanEvent.upsert", savedEvent, "scan");

    return savedEvent;
  }

  /**
   * EDIT FLOW — writes user corrections to the database only.
   *
   * Updates correctedDate, correctedClient, correctedProject, category, and
   * optionally folderType (for reclassifying personal_folder entries).
   * It never touches the filesystem. Folder names on disk are never renamed,
   * normalized, or auto-corrected as a side effect.
   *
   * When folderType is changed to a structured type (client / personal_project),
   * isStandardized is automatically set to true.
   */
  async updateProjectMetadata(input: UpdateProjectMetadataInput): Promise<Project> {
    const project = await this.getProjectById(input.projectId);

    if (!project) {
      throw new Error(`Project ${input.projectId} was not found`);
    }

    const nextFolderType = input.folderType ?? project.folderType;

    if (project.folderType !== "personal_folder" && nextFolderType === "personal_folder") {
      throw new Error("Cannot reclassify a structured project back to personal_folder. Use the edit flow to correct metadata only.");
    }

    const isStandardized = nextFolderType !== "personal_folder" ? true : project.isStandardized;

    return this.saveProject({
      ...project,
      folderType: nextFolderType,
      isStandardized,
      correctedDate: normalizeOptionalText(input.correctedDate),
      correctedClient: normalizeOptionalText(input.correctedClient),
      correctedProject: normalizeOptionalText(input.correctedProject),
      category: input.category,
      updatedAt: new Date().toISOString()
    });
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const createdAt = new Date().toISOString();
    const currentDriveId = input.currentDriveId ?? null;
    const folderName = input.parsedDate && input.parsedClient && input.parsedProject
      ? `${input.parsedDate}_${input.parsedClient}_${input.parsedProject}`
      : (input.parsedClient || input.parsedProject || "manual-project");
    const project: Project = {
      id: `project-${slugify(input.parsedDate ?? "")}-${slugify(input.parsedClient ?? "")}-${slugify(input.parsedProject ?? "")}-${crypto.randomUUID().slice(0, 8)}`,
      folderType: "client",
      isStandardized: true,
      folderName,
      folderPath: null,
      parsedDate: input.parsedDate ?? null,
      parsedClient: input.parsedClient ?? null,
      parsedProject: input.parsedProject ?? null,
      correctedDate: null,
      correctedClient: null,
      correctedProject: null,
      category: input.category,
      sizeBytes: input.sizeBytes ?? null,
      sizeStatus: input.sizeBytes === null || input.sizeBytes === undefined ? "unknown" : "ready",
      currentDriveId,
      targetDriveId: null,
      moveStatus: "none",
      missingStatus: "normal",
      duplicateStatus: "normal",
      isUnassigned: currentDriveId === null,
      isManual: true,
      lastSeenAt: null,
      lastScannedAt: null,
      createdAt,
      updatedAt: createdAt
    };

    return this.saveProject(project);
  }

  async createDrive(input: CreateDriveInput): Promise<Drive> {
    const now = new Date().toISOString();
    const totalCapacityBytes = input.totalCapacityBytes ?? null;
    const drive: Drive = {
      id: `drive-${slugify(input.displayName ?? input.volumeName)}-${crypto.randomUUID().slice(0, 6)}`,
      volumeName: input.volumeName,
      displayName: normalizeOptionalText(input.displayName) ?? input.volumeName,
      totalCapacityBytes,
      usedBytes: totalCapacityBytes === null ? null : 0,
      freeBytes: totalCapacityBytes,
      reservedIncomingBytes: 0,
      lastScannedAt: null,
      createdManually: true,
      createdAt: now,
      updatedAt: now
    };

    return this.saveDrive(drive);
  }

  async planProjectMove(projectId: string, targetDriveId: string): Promise<Project> {
    const [project, targetDrive] = await Promise.all([this.getProjectById(projectId), this.getDriveById(targetDriveId)]);

    if (!project) {
      throw new Error(`Project ${projectId} was not found`);
    }
    if (!targetDrive) {
      throw new Error(`Drive ${targetDriveId} was not found`);
    }
    if (project.currentDriveId === targetDriveId) {
      throw new Error("The target drive matches the current drive.");
    }

    return this.saveProject({
      ...project,
      targetDriveId,
      moveStatus: "pending",
      updatedAt: new Date().toISOString()
    });
  }

  async confirmProjectMove(projectId: string): Promise<Project> {
    const project = await this.getProjectById(projectId);

    if (!project) {
      throw new Error(`Project ${projectId} was not found`);
    }
    if (!project.targetDriveId) {
      throw new Error(`Project ${projectId} does not have a target drive`);
    }

    const targetDrive = await this.getDriveById(project.targetDriveId);
    if (!targetDrive) {
      throw new Error(`Drive ${project.targetDriveId} was not found`);
    }

    return this.saveProject({
      ...project,
      currentDriveId: project.targetDriveId,
      targetDriveId: null,
      moveStatus: "none",
      missingStatus: "normal",
      updatedAt: new Date().toISOString()
    });
  }

  async cancelProjectMove(projectId: string): Promise<Project> {
    const project = await this.getProjectById(projectId);

    if (!project) {
      throw new Error(`Project ${projectId} was not found`);
    }

    return this.saveProject({
      ...project,
      targetDriveId: null,
      moveStatus: "none",
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * IMPORT FLOW — read-only with respect to the filesystem.
   *
   * Reads a completed ScanSessionSnapshot and persists the classified metadata
   * (projects, drive, scan record) to the database. No folder is renamed, moved,
   * copied, or deleted as a side effect. The raw `folderName` and `folderPath`
   * captured by the scanner are stored exactly as observed on disk.
   *
   * Corrections (`correctedClient`, `correctedProject`) are always `null` for
   * newly discovered projects. They can only be set via `updateProjectMetadata`.
   */
  async ingestScanSnapshot(session: ScanSessionSnapshot): Promise<ScanRecord> {
    const snapshot = await this.persistence.readSnapshot();
    const ingestion = ingestScanSessionSnapshot(snapshot, session);
    const changedProjects = getChangedById(snapshot.projects, ingestion.snapshot.projects);
    const changedEvents = getChangedById(snapshot.projectScanEvents, ingestion.snapshot.projectScanEvents);

    await this.persistence.upsertDrive(ingestion.drive);
    await this.persistence.upsertProjects(changedProjects);
    await this.persistence.upsertProjectScanEvents(changedEvents);
    await this.persistence.upsertScan(ingestion.scan);
    await this.persistence.upsertScanSession(ingestion.session);
    await this.enqueue("drive.upsert", ingestion.drive, "scan");
    for (const project of changedProjects) {
      await this.enqueue("project.upsert", project, "scan");
    }
    for (const event of changedEvents) {
      await this.enqueue("projectScanEvent.upsert", event, "scan");
    }
    await this.enqueue("scan.upsert", ingestion.scan, "scan");
    await this.enqueue("scanSession.upsert", ingestion.session, "scan");

    return ingestion.scan;
  }

  /**
   * One-shot maintenance action that rewalks every non-manual project whose
   * stored `folderType` is `personal_folder` and promotes it to `client` or
   * `personal_project` when the current classifier disagrees.
   *
   * This exists because migration 3 (see `sqliteLocalPersistence.ts`)
   * blanket-assigned `folder_type = 'client'` to legacy rows — but the same
   * bug also caused later classification passes to leave rows as
   * `personal_folder` without the correct upgrade when the legacy data was
   * re-examined. Running the current classifier against `folderName` is
   * deterministic, safe, and matches exactly what a fresh scan would
   * produce for the same folder.
   *
   * Safety invariants:
   *   1. Never touches `isManual: true` projects (those were user-created).
   *   2. Never downgrades `client` / `personal_project` → `personal_folder`
   *      (mirrors the guard in `updateProjectMetadata`).
   *   3. Writes through `saveProject` so derived states, sync enqueue, and
   *      `updatedAt` bookkeeping all run identically to a normal edit.
   *   4. Returns a structured summary so the UI can report counts.
   */
  async reclassifyLegacyFolderTypes(): Promise<ReclassifyLegacyFolderTypesResult> {
    const projects = await this.persistence.listProjects();

    const result: ReclassifyLegacyFolderTypesResult = {
      examinedCount: 0,
      clientReclassifiedCount: 0,
      personalProjectReclassifiedCount: 0,
      unchangedCount: 0
    };

    for (const project of projects) {
      // Only consider rows the importer owns and that are currently
      // catch-all personal_folder. Structured rows are respected.
      if (project.isManual) continue;
      if (project.folderType !== "personal_folder") continue;

      result.examinedCount += 1;

      const classification = classifyFolderName(project.folderName);

      if (classification.folderType === "personal_folder") {
        result.unchangedCount += 1;
        continue;
      }

      // Upgrade only — never downgrade.
      const updatedAt = new Date().toISOString();
      await this.saveProject({
        ...project,
        folderType: classification.folderType,
        isStandardized: true,
        parsedDate: classification.parsedDate,
        parsedClient: classification.parsedClient,
        parsedProject: classification.parsedProject,
        updatedAt
      });

      if (classification.folderType === "client") {
        result.clientReclassifiedCount += 1;
      } else {
        result.personalProjectReclassifiedCount += 1;
      }
    }

    return result;
  }

  async deleteProject(projectId: string): Promise<void> {
    // F7 — enumerate the cascade BEFORE persistence.deleteProject mutates
    // the local state. `deleteProject` cascades projectScanEvents whose
    // `projectId` matches; those child upserts (if queued) would otherwise
    // be pushed on the next flush against a now-missing parent.
    const snapshot = await this.persistence.readSnapshot();
    const cascade = computeProjectCascadeIds(snapshot, projectId);

    await this.persistence.deleteProject(projectId);

    // F8 (Pass 5) — cancel pending child AND parent upserts via the Pass 3
    // primitive `SyncAdapter.cancelPendingForRecord`. The primitive is a
    // pure local filter on the adapter's queue: it removes non-in-flight
    // entries matching (entity, recordId) without ever touching the
    // remote. See `syncQueue.ts` `cancelPendingSyncOperationsForRecord`
    // for the underlying filter and the Pass 5 report for why the prior
    // `flush()`-based helper was replaced (it pushed unrelated queue
    // entries to the remote as a side-effect of every delete, and erased
    // retry/error history by re-enqueueing survivors).
    //
    // Child-first ordering is still required so that if the parent cancel
    // ever races with a concurrent enqueue for the same record, we have
    // already resolved the cascade ids from the pre-mutation snapshot.
    await this.cancelPendingChildUpserts(cascade);

    // F1 — outbound delete propagation.
    //
    // Order matters: first drop any pending upsert for this record so the
    // queue cannot push a resurrected copy just before the delete lands, then
    // enqueue the delete itself. The compactor keys on (entity, recordId,
    // change), so a delete is never merged into an upsert — but clearing the
    // queue first keeps the common case to a single trailing delete op,
    // which is what the Supabase adapter expects to batch via
    // `DELETE …?id=in.(…)`.
    //
    // In-flight upserts are intentionally not cancelled here (the primitive
    // preserves them). Worst case, the in-flight upsert is accepted
    // remote-side and the subsequent delete immediately removes it — a
    // brief reanimation on another device, not data loss.
    await this.sync.cancelPendingForRecord("project", projectId);
    await this.enqueueDelete("project.delete", projectId);
  }

  async deleteDrive(driveId: string): Promise<void> {
    // F7 — enumerate the cascade BEFORE persistence.deleteDrive mutates
    // the local state. `deleteDrive` cascades scans, scanSessions, and
    // projectScanEvents (see the identical cascade rules in
    // `inMemoryLocalPersistence`, `storageLocalPersistence`, and
    // `sqliteLocalPersistence`). Any of those child entities may have a
    // pending outbound upsert in the queue (e.g. from a recent scan
    // ingestion). Without cancelling those upserts, the next flush would
    // push them against a `drive_id` / `scan_id` that no longer exists,
    // producing either an orphaned remote row (no FK), a silent CASCADE
    // on the remote, or a hard RESTRICT error — none of which match the
    // local intent.
    const snapshot = await this.persistence.readSnapshot();
    const cascade = computeDriveCascadeIds(snapshot, driveId);

    await this.persistence.deleteDrive(driveId);

    // F8 (Pass 5) — see deleteProject for the rationale. Child cancel uses
    // the same Pass 3 primitive as the parent cancel; both are pure local
    // filters with no remote push.
    await this.cancelPendingChildUpserts(cascade);

    await this.sync.cancelPendingForRecord("drive", driveId);
    await this.enqueueDelete("drive.delete", driveId);
  }

  /**
   * F7 — cancel pending (non-in-flight) outbound upsert entries for the
   * child ids a parent delete just cascaded locally.
   *
   * Uses `SyncAdapter.cancelPendingForRecord` — the Pass 3 primitive that
   * mutates the queue locally without pushing to the remote. In-flight
   * entries are preserved (they are already in transit; the worst case
   * is a brief reanimation on the remote, matching Pass 1's acknowledged
   * outbound-delete limitation). Pass 5 extended use of the same
   * primitive to the parent delete, so this helper and the parent
   * `sync.cancelPendingForRecord` call share identical semantics and
   * ordering between them is load-bearing only for pre-mutation cascade
   * enumeration, not for flush isolation.
   *
   * Called by both the outbound delete path (`deleteDrive`,
   * `deleteProject`) and the inbound merge path (`runSyncCycle` F7 loop
   * via the extended `appliedDeletes` handshake).
   */
  private async cancelPendingChildUpserts(cascade: CatalogCascadeIds): Promise<void> {
    for (const scanId of cascade.scans) {
      await this.sync.cancelPendingForRecord("scan", scanId);
    }
    for (const scanId of cascade.scanSessions) {
      // scanSession records are keyed by `scanId` in the sync layer — see
      // `getSyncRecordDescriptor` for "scanSession.upsert".
      await this.sync.cancelPendingForRecord("scanSession", scanId);
    }
    for (const eventId of cascade.projectScanEvents) {
      await this.sync.cancelPendingForRecord("projectScanEvent", eventId);
    }
  }

  async listPendingSyncOperations() {
    return this.sync.listPending();
  }

  async flushSync() {
    return this.sync.flush();
  }

  async getSyncState(): Promise<SyncState> {
    return this.sync.getState();
  }

  async syncNow(): Promise<SyncCycleResult> {
    return this.runSyncCycle();
  }

  async startupSync(options?: { isOnline?: boolean }): Promise<StartupSyncResult> {
    const recovery = await this.sync.recoverInterruptedState();
    const state = recovery.state;

    if (state.mode === "local-only") {
      return {
        status: "skipped",
        reason: "disabled",
        message: "Startup sync was skipped because no remote sync configuration is available.",
        recoveredCount: recovery.recoveredCount,
        cycle: null
      };
    }

    if (options?.isOnline === false) {
      return {
        status: "skipped",
        reason: "offline",
        message: "Startup sync was skipped because the app appears to be offline.",
        recoveredCount: recovery.recoveredCount,
        cycle: null
      };
    }

    if (this.#activeSyncPromise) {
      const cycle = await this.#activeSyncPromise;
      return {
        status: "completed",
        reason: "existing-run",
        message: "Startup sync joined an already running sync cycle.",
        recoveredCount: recovery.recoveredCount,
        cycle
      };
    }

    const shouldRunSync =
      recovery.recoveredCount > 0 ||
      state.pendingCount > 0 ||
      state.failedCount > 0 ||
      state.lastPullAt === null;

    if (!shouldRunSync) {
      return {
        status: "skipped",
        reason: "not-needed",
        message: "Startup sync was skipped because the local queue is clear and a prior pull already completed.",
        recoveredCount: recovery.recoveredCount,
        cycle: null
      };
    }

    try {
      const cycle = await this.runSyncCycle();
      return {
        status: "completed",
        reason:
          recovery.recoveredCount > 0
            ? "recovered-and-ran"
            : state.pendingCount > 0 || state.failedCount > 0
            ? "pending-queue"
            : "initial-pull",
        message: buildStartupMessage({
          recoveredCount: recovery.recoveredCount,
          pendingCount: state.pendingCount,
          failedCount: state.failedCount,
          pulled: cycle.pulled,
          pushed: cycle.pushed
        }),
        recoveredCount: recovery.recoveredCount,
        cycle
      };
    } catch (error) {
      return {
        status: "failed",
        reason: "failed",
        message: error instanceof Error ? error.message : "Startup sync did not complete.",
        recoveredCount: recovery.recoveredCount,
        cycle: null
      };
    }
  }

  private async enqueue(type: SyncOperationType, payload: object, source: SyncMutationSource = "manual") {
    const descriptor = getSyncRecordDescriptor(type, payload);
    await this.sync.enqueue({
      id: `${type}:${crypto.randomUUID()}`,
      type,
      entity: descriptor.entity,
      recordId: descriptor.recordId,
      change: descriptor.change,
      occurredAt: new Date().toISOString(),
      recordUpdatedAt: descriptor.recordUpdatedAt,
      payload,
      source,
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      lastError: null
    });
  }

  /**
   * Enqueue a delete sync operation. The payload intentionally carries only
   * the primary key + a wall-clock stamp — the Supabase adapter needs only the
   * id (for the `…?pk=in.(…)` filter) and the compactor + descriptor paths
   * need `updatedAt`. No domain payload is attached because the record is
   * already gone locally.
   */
  private async enqueueDelete(type: "drive.delete" | "project.delete", recordId: string) {
    const now = new Date().toISOString();
    await this.enqueue(type, { id: recordId, updatedAt: now }, "manual");
  }

  private async runSyncCycle(): Promise<SyncCycleResult> {
    if (this.#activeSyncPromise) {
      return this.#activeSyncPromise;
    }

    this.#activeSyncPromise = (async () => {
      let currentState = await this.sync.getState();
      if (currentState.syncInProgress) {
        const recovery = await this.sync.recoverInterruptedState();
        currentState = recovery.state;

        if (currentState.syncInProgress) {
          return {
            pushed: 0,
            pulled: 0,
            pending: currentState.pendingCount,
            state: currentState
          };
        }
      }

      const pushResult = await this.sync.flush();
      const pullResult = await this.sync.pull();
      const mergeResult = await applyRemoteSyncChanges({
        persistence: this.persistence,
        changes: pullResult.changes
      });

      // F5 — inbound-delete / outbound-queue coordination.
      //
      // For every record whose inbound delete was just applied locally,
      // drop any stale pending outbound upsert from the queue. Without
      // this, the NEXT cycle's flush would push that upsert and
      // resurrect the just-deleted record on the remote.
      //
      // `cancelPendingForRecord` is the surgical primitive: it only
      // touches non-in-flight entries and NEVER pushes to the remote.
      // An in-flight upsert here is left alone — it's already in transit
      // and may briefly resurrect the record remotely, matching the Pass 1
      // acknowledged limitation for outbound deletes. Pass 5 made this
      // primitive the sole queue-cancellation path for drive/project
      // deletes on both the outbound (`deleteDrive`/`deleteProject`) and
      // inbound sides; there is no longer a flush-based fallback.
      //
      // LWW is preserved because `appliedDeletes` is populated only for
      // inbound deletes where the merge's per-record LWW check passed.
      // A stale inbound delete rejected by LWW never reaches this loop.
      for (const driveId of mergeResult.appliedDeletes.drives) {
        await this.sync.cancelPendingForRecord("drive", driveId);
      }
      for (const projectId of mergeResult.appliedDeletes.projects) {
        await this.sync.cancelPendingForRecord("project", projectId);
      }

      // F7 (Pass 4) — extend F5 to the cascade. `persistence.deleteDrive`
      // and `persistence.deleteProject` cascade children locally; the
      // merge module populates `appliedDeletes.{scans,scanSessions,
      // projectScanEvents}` from the pre-merge snapshot so we can drop
      // the matching pending outbound upserts here. Today this path is
      // latent in production — `supabaseSyncAdapter.mapRowsToRemoteChanges`
      // never emits inbound `.delete` variants — but the symmetry with the
      // outbound cascade cleanup in `deleteDrive` / `deleteProject` keeps
      // the invariant "a locally-deleted record never has a surviving
      // pending upsert" true regardless of which side originated the
      // delete.
      await this.cancelPendingChildUpserts({
        scans: mergeResult.appliedDeletes.scans,
        scanSessions: mergeResult.appliedDeletes.scanSessions,
        projectScanEvents: mergeResult.appliedDeletes.projectScanEvents
      });

      const state = await this.sync.getState();

      return {
        pushed: pushResult.pushed,
        pulled: mergeResult.appliedCount,
        pending: state.pendingCount,
        state
      };
    })();

    try {
      return await this.#activeSyncPromise;
    } finally {
      this.#activeSyncPromise = null;
    }
  }
}

function buildStartupMessage(params: {
  recoveredCount: number;
  pendingCount: number;
  failedCount: number;
  pushed: number;
  pulled: number;
}) {
  if (params.recoveredCount > 0) {
    return `Recovered ${params.recoveredCount} interrupted sync item${params.recoveredCount === 1 ? "" : "s"} and ran a safe startup sync.`;
  }
  if (params.failedCount > 0) {
    return `Retried failed sync work on startup. ${params.pushed} pushed, ${params.pulled} pulled.`;
  }
  if (params.pendingCount > 0) {
    return `Pushed pending local changes on startup and refreshed remote updates.`;
  }

  return "Ran a conservative startup pull to refresh remote changes.";
}

function upsertById<T extends { id: string }>(items: T[], input: T) {
  const index = items.findIndex((item) => item.id === input.id);
  if (index === -1) {
    return [...items, input];
  }

  const next = clone(items);
  next[index] = input;
  return next;
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getChangedById<T extends { id: string }>(previous: T[], next: T[]) {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  return next.filter((item) => serializeComparable(previousById.get(item.id)) !== serializeComparable(item));
}

function serializeComparable(value: unknown) {
  return JSON.stringify(value ?? null);
}

interface SyncRecordDescriptor {
  entity: "drive" | "project" | "scan" | "scanSession" | "projectScanEvent";
  recordId: string;
  recordUpdatedAt: string;
  change: SyncChangeKind;
}

function getSyncRecordDescriptor(type: SyncOperationType, payload: object): SyncRecordDescriptor {
  if (type === "drive.upsert") {
    const drive = payload as Drive;
    return { entity: "drive", recordId: drive.id, recordUpdatedAt: drive.updatedAt, change: "upsert" };
  }

  if (type === "drive.delete") {
    const stub = payload as { id: string; updatedAt: string };
    return { entity: "drive", recordId: stub.id, recordUpdatedAt: stub.updatedAt, change: "delete" };
  }

  if (type === "project.upsert") {
    const project = payload as Project;
    return { entity: "project", recordId: project.id, recordUpdatedAt: project.updatedAt, change: "upsert" };
  }

  if (type === "project.delete") {
    const stub = payload as { id: string; updatedAt: string };
    return { entity: "project", recordId: stub.id, recordUpdatedAt: stub.updatedAt, change: "delete" };
  }

  if (type === "scan.upsert") {
    const scan = payload as ScanRecord;
    return { entity: "scan", recordId: scan.id, recordUpdatedAt: scan.updatedAt, change: "upsert" };
  }

  if (type === "scanSession.upsert") {
    const session = payload as ScanSessionSnapshot;
    return { entity: "scanSession", recordId: session.scanId, recordUpdatedAt: session.updatedAt, change: "upsert" };
  }

  const event = payload as ProjectScanEvent;
  return { entity: "projectScanEvent", recordId: event.id, recordUpdatedAt: event.updatedAt, change: "upsert" };
}
