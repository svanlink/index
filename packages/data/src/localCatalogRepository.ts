import { applyDerivedProjectStates, classifyFolderName, type Drive, type Project, type ProjectScanEvent, type ScanRecord, type ScanSessionSnapshot } from "@drive-project-catalog/domain";
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
import type { StartupSyncResult, SyncAdapter, SyncCycleResult, SyncMutationSource, SyncOperationType, SyncState } from "./sync";

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
    await this.persistence.deleteProject(projectId);
    // Remove any pending upsert operations for this record so they cannot
    // re-create the project on the remote after it has been deleted locally.
    // Full delete propagation to the remote requires a "delete" sync operation
    // type which is not yet implemented — for now, deletions remain local-only.
    // TODO: implement a project.delete SyncOperationType to propagate deletions.
    await this.cancelPendingQueueEntriesForRecord("project", projectId);
  }

  async deleteDrive(driveId: string): Promise<void> {
    await this.persistence.deleteDrive(driveId);
    // Same as deleteProject: remove stale upserts so the deleted drive cannot
    // be re-created remotely. Delete propagation is not yet implemented.
    // TODO: implement a drive.delete SyncOperationType to propagate deletions.
    await this.cancelPendingQueueEntriesForRecord("drive", driveId);
  }

  /**
   * Remove all pending (non-in-flight) sync queue entries for a given record.
   *
   * This is a best-effort cleanup: it prevents stale upsert operations from
   * re-creating a locally deleted record on the remote. In-flight entries are
   * left intact — they will either be accepted by the remote (where the
   * subsequent delete propagation, once implemented, will undo them) or fail
   * on their own.
   *
   * Implementation note: SyncAdapter does not expose a per-record removal API,
   * so we read the current queue, filter out the target entries, and re-hydrate
   * the adapter by flushing the old queue and re-enqueueing the survivors. This
   * is safe because flush() only removes dispatchable (pending/failed) entries
   * anyway — in-flight entries are preserved by the adapter implementations.
   */
  private async cancelPendingQueueEntriesForRecord(
    entity: "project" | "drive",
    recordId: string
  ): Promise<void> {
    const queue = await this.sync.listQueue();
    const toRequeue = queue.filter(
      (op) => !(op.entity === entity && op.recordId === recordId && op.status !== "in-flight")
    );

    if (toRequeue.length === queue.length) {
      // Nothing to remove.
      return;
    }

    // Flush removes all dispatchable entries from the adapter's internal queue.
    await this.sync.flush();

    // Re-enqueue the entries we want to keep.
    for (const op of toRequeue) {
      await this.sync.enqueue(op);
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
      change: "upsert",
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

function getSyncRecordDescriptor(type: SyncOperationType, payload: object) {
  if (type === "drive.upsert") {
    const drive = payload as Drive;
    return { entity: "drive" as const, recordId: drive.id, recordUpdatedAt: drive.updatedAt };
  }

  if (type === "project.upsert") {
    const project = payload as Project;
    return { entity: "project" as const, recordId: project.id, recordUpdatedAt: project.updatedAt };
  }

  if (type === "scan.upsert") {
    const scan = payload as ScanRecord;
    return { entity: "scan" as const, recordId: scan.id, recordUpdatedAt: scan.updatedAt };
  }

  if (type === "scanSession.upsert") {
    const session = payload as ScanSessionSnapshot;
    return { entity: "scanSession" as const, recordId: session.scanId, recordUpdatedAt: session.updatedAt };
  }

  const event = payload as ProjectScanEvent;
  return { entity: "projectScanEvent" as const, recordId: event.id, recordUpdatedAt: event.updatedAt };
}
