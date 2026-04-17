import {
  applyDriveDeleteToSnapshot,
  applyProjectDeleteToSnapshot
} from "./cascadeDelete";
import type { CatalogSnapshot, LocalPersistenceAdapter } from "./localPersistence";

const clone = <T>(value: T): T => structuredClone(value);
const upsertById = <T extends { id: string }>(items: T[], input: T) => {
  const index = items.findIndex((item) => item.id === input.id);
  if (index === -1) {
    return [...items, clone(input)];
  }

  const next = clone(items);
  next[index] = clone(input);
  return next;
};
const upsertByScanId = <T extends { scanId: string }>(items: T[], input: T) => {
  const index = items.findIndex((item) => item.scanId === input.scanId);
  if (index === -1) {
    return [...items, clone(input)];
  }

  const next = clone(items);
  next[index] = clone(input);
  return next;
};

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

interface PersistedCatalogEnvelope {
  version: number;
  snapshot: CatalogSnapshot;
}

interface StorageLocalPersistenceOptions {
  storage: StorageLike;
  storageKey: string;
  seed: CatalogSnapshot;
}

const STORAGE_VERSION = 1;

export class StorageLocalPersistence implements LocalPersistenceAdapter {
  readonly #storage: StorageLike;
  readonly #storageKey: string;
  readonly #seed: CatalogSnapshot;

  constructor(options: StorageLocalPersistenceOptions) {
    this.#storage = options.storage;
    this.#storageKey = options.storageKey;
    this.#seed = normalizeCatalogSnapshot(options.seed);
  }

  async readSnapshot(): Promise<CatalogSnapshot> {
    const snapshot = parseStoredCatalogSnapshot(this.#storage.getItem(this.#storageKey));

    if (!snapshot) {
      await this.replaceSnapshot(this.#seed);
      return clone(this.#seed);
    }

    return clone(snapshot);
  }

  async replaceSnapshot(snapshot: CatalogSnapshot): Promise<void> {
    const normalized = normalizeCatalogSnapshot(snapshot);
    const envelope: PersistedCatalogEnvelope = {
      version: STORAGE_VERSION,
      snapshot: normalized
    };

    this.#storage.setItem(this.#storageKey, JSON.stringify(envelope));
  }

  async listDrives() {
    const snapshot = await this.readSnapshot();
    return snapshot.drives;
  }

  async listProjects() {
    const snapshot = await this.readSnapshot();
    return snapshot.projects;
  }

  async listScans() {
    const snapshot = await this.readSnapshot();
    return snapshot.scans;
  }

  async listProjectScanEvents(projectId?: string) {
    const snapshot = await this.readSnapshot();
    return projectId
      ? snapshot.projectScanEvents.filter((event) => event.projectId === projectId)
      : snapshot.projectScanEvents;
  }

  async listScanSessions() {
    const snapshot = await this.readSnapshot();
    return snapshot.scanSessions;
  }

  async getDriveById(driveId: string) {
    const snapshot = await this.readSnapshot();
    return snapshot.drives.find((drive) => drive.id === driveId) ?? null;
  }

  async getProjectById(projectId: string) {
    const snapshot = await this.readSnapshot();
    return snapshot.projects.find((project) => project.id === projectId) ?? null;
  }

  async getScanSession(scanId: string) {
    const snapshot = await this.readSnapshot();
    return snapshot.scanSessions.find((session) => session.scanId === scanId) ?? null;
  }

  async upsertDrive(drive: CatalogSnapshot["drives"][number]) {
    const snapshot = await this.readSnapshot();
    snapshot.drives = upsertById(snapshot.drives, drive);
    await this.replaceSnapshot(snapshot);
  }

  async upsertDrives(drives: CatalogSnapshot["drives"]) {
    const snapshot = await this.readSnapshot();
    for (const drive of drives) {
      snapshot.drives = upsertById(snapshot.drives, drive);
    }
    await this.replaceSnapshot(snapshot);
  }

  async upsertProject(project: CatalogSnapshot["projects"][number]) {
    const snapshot = await this.readSnapshot();
    snapshot.projects = upsertById(snapshot.projects, project);
    await this.replaceSnapshot(snapshot);
  }

  async upsertProjects(projects: CatalogSnapshot["projects"]) {
    const snapshot = await this.readSnapshot();
    for (const project of projects) {
      snapshot.projects = upsertById(snapshot.projects, project);
    }
    await this.replaceSnapshot(snapshot);
  }

  async upsertScan(scan: CatalogSnapshot["scans"][number]) {
    const snapshot = await this.readSnapshot();
    snapshot.scans = upsertById(snapshot.scans, scan);
    await this.replaceSnapshot(snapshot);
  }

  async upsertProjectScanEvent(event: CatalogSnapshot["projectScanEvents"][number]) {
    const snapshot = await this.readSnapshot();
    snapshot.projectScanEvents = upsertById(snapshot.projectScanEvents, event);
    await this.replaceSnapshot(snapshot);
  }

  async upsertProjectScanEvents(events: CatalogSnapshot["projectScanEvents"]) {
    const snapshot = await this.readSnapshot();
    for (const event of events) {
      snapshot.projectScanEvents = upsertById(snapshot.projectScanEvents, event);
    }
    await this.replaceSnapshot(snapshot);
  }

  async upsertScanSession(session: CatalogSnapshot["scanSessions"][number]) {
    const snapshot = await this.readSnapshot();
    snapshot.scanSessions = upsertByScanId(snapshot.scanSessions, session);
    await this.replaceSnapshot(snapshot);
  }

  async deleteProject(projectId: string) {
    // Cascade spec: see `cascadeDelete.ts#applyProjectDeleteToSnapshot`.
    // The shared contract test in `localPersistenceContract.ts` locks this
    // path, the InMemory path, and the SQLite path to identical behavior.
    const snapshot = await this.readSnapshot();
    await this.replaceSnapshot(applyProjectDeleteToSnapshot(snapshot, projectId));
  }

  async deleteDrive(driveId: string) {
    // Cascade spec: see `cascadeDelete.ts#applyDriveDeleteToSnapshot`.
    // The shared contract test in `localPersistenceContract.ts` locks this
    // path, the InMemory path, and the SQLite path to identical behavior
    // (H3 parity — sessions with `requestedDriveId === null` are
    // preserved, projects are nullified rather than deleted).
    const snapshot = await this.readSnapshot();
    await this.replaceSnapshot(applyDriveDeleteToSnapshot(snapshot, driveId));
  }
}

export function parseStoredCatalogSnapshot(serialized: string | null): CatalogSnapshot | null {
  if (!serialized) {
    return null;
  }

  try {
    const parsed = JSON.parse(serialized) as Partial<PersistedCatalogEnvelope> | CatalogSnapshot;
    const snapshot = "snapshot" in parsed && parsed.snapshot
      ? parsed.snapshot
      : (parsed as CatalogSnapshot);

    return normalizeCatalogSnapshot(snapshot);
  } catch {
    return null;
  }
}

export function normalizeCatalogSnapshot(snapshot: CatalogSnapshot): CatalogSnapshot {
  return {
    drives: clone(snapshot.drives ?? []),
    projects: clone(snapshot.projects ?? []),
    scans: clone(snapshot.scans ?? []).map((scan) => ({
      ...scan,
      createdAt: scan.createdAt ?? scan.startedAt,
      updatedAt: scan.updatedAt ?? scan.finishedAt ?? scan.startedAt
    })),
    projectScanEvents: clone(snapshot.projectScanEvents ?? []).map((event) => ({
      ...event,
      createdAt: event.createdAt ?? event.observedAt,
      updatedAt: event.updatedAt ?? event.observedAt
    })),
    scanSessions: clone(snapshot.scanSessions ?? []).map((session) => ({
      ...session,
      createdAt: session.createdAt ?? session.startedAt,
      updatedAt: session.updatedAt ?? session.finishedAt ?? session.startedAt
    }))
  };
}
