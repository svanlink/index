import { applyDerivedProjectStates, type Drive, type Project, type ProjectScanEvent, type ScanRecord, type ScanSessionSnapshot } from "@drive-project-catalog/domain";
import {
  buildDashboardSnapshot,
  buildDriveDetailView,
  decorateDrivesWithCapacity,
  filterProjects,
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
  UpdateProjectMetadataInput
} from "./repository";
import { ingestScanSessionSnapshot } from "./scanIngestionService";
import type { SyncAdapter, SyncCycleResult, SyncMutationSource, SyncOperationType, SyncState } from "./sync";

const clone = <T>(value: T): T => structuredClone(value);

export class LocalCatalogRepository implements CatalogRepository {
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

  async updateProjectMetadata(input: UpdateProjectMetadataInput): Promise<Project> {
    const project = await this.getProjectById(input.projectId);

    if (!project) {
      throw new Error(`Project ${input.projectId} was not found`);
    }

    return this.saveProject({
      ...project,
      correctedClient: normalizeOptionalText(input.correctedClient),
      correctedProject: normalizeOptionalText(input.correctedProject),
      category: input.category,
      updatedAt: new Date().toISOString()
    });
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const createdAt = new Date().toISOString();
    const currentDriveId = input.currentDriveId ?? null;
    const project: Project = {
      id: `project-${slugify(input.parsedDate)}-${slugify(input.parsedClient)}-${slugify(input.parsedProject)}-${crypto.randomUUID().slice(0, 8)}`,
      parsedDate: input.parsedDate,
      parsedClient: input.parsedClient,
      parsedProject: input.parsedProject,
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
    const currentState = await this.sync.getState();
    if (currentState.syncInProgress) {
      return {
        pushed: 0,
        pulled: 0,
        pending: currentState.pendingCount,
        state: currentState
      };
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
}

function sortProjects(projects: Project[]) {
  return clone(projects).sort((left, right) => right.parsedDate.localeCompare(left.parsedDate));
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
