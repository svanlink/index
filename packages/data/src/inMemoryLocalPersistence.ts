import type { RenameSuggestion, RenameSuggestionStatus } from "@drive-project-catalog/domain";
import {
  applyDriveDeleteToSnapshot,
  applyProjectDeleteToSnapshot
} from "./cascadeDelete";
import type {
  CatalogSnapshot,
  LocalPersistenceAdapter,
  RenameUndoEntry
} from "./localPersistence";

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

export class InMemoryLocalPersistence implements LocalPersistenceAdapter {
  #snapshot: CatalogSnapshot;
  #renameSuggestions: RenameSuggestion[] = [];

  constructor(seed: CatalogSnapshot) {
    this.#snapshot = clone(seed);
  }

  async readSnapshot(): Promise<CatalogSnapshot> {
    return clone(this.#snapshot);
  }

  async replaceSnapshot(snapshot: CatalogSnapshot): Promise<void> {
    this.#snapshot = clone(snapshot);
  }

  async listDrives() {
    return clone(this.#snapshot.drives);
  }

  async listProjects() {
    return clone(this.#snapshot.projects);
  }

  async listScans() {
    return clone(this.#snapshot.scans);
  }

  async listProjectScanEvents(projectId?: string) {
    return clone(
      projectId
        ? this.#snapshot.projectScanEvents.filter((event) => event.projectId === projectId)
        : this.#snapshot.projectScanEvents
    );
  }

  async listScanSessions() {
    return clone(this.#snapshot.scanSessions);
  }

  async getDriveById(driveId: string) {
    return clone(this.#snapshot.drives.find((drive) => drive.id === driveId) ?? null);
  }

  async getProjectById(projectId: string) {
    return clone(this.#snapshot.projects.find((project) => project.id === projectId) ?? null);
  }

  async getScanSession(scanId: string) {
    return clone(this.#snapshot.scanSessions.find((session) => session.scanId === scanId) ?? null);
  }

  async upsertDrive(drive: CatalogSnapshot["drives"][number]) {
    this.#snapshot.drives = upsertById(this.#snapshot.drives, drive);
  }

  async upsertDrives(drives: CatalogSnapshot["drives"]) {
    for (const drive of drives) {
      this.#snapshot.drives = upsertById(this.#snapshot.drives, drive);
    }
  }

  async upsertProject(project: CatalogSnapshot["projects"][number]) {
    this.#snapshot.projects = upsertById(this.#snapshot.projects, project);
  }

  async upsertProjects(projects: CatalogSnapshot["projects"]) {
    for (const project of projects) {
      this.#snapshot.projects = upsertById(this.#snapshot.projects, project);
    }
  }

  async upsertScan(scan: CatalogSnapshot["scans"][number]) {
    this.#snapshot.scans = upsertById(this.#snapshot.scans, scan);
  }

  async upsertProjectScanEvent(event: CatalogSnapshot["projectScanEvents"][number]) {
    this.#snapshot.projectScanEvents = upsertById(this.#snapshot.projectScanEvents, event);
  }

  async upsertProjectScanEvents(events: CatalogSnapshot["projectScanEvents"]) {
    for (const event of events) {
      this.#snapshot.projectScanEvents = upsertById(this.#snapshot.projectScanEvents, event);
    }
  }

  async upsertScanSession(session: CatalogSnapshot["scanSessions"][number]) {
    this.#snapshot.scanSessions = upsertByScanId(this.#snapshot.scanSessions, session);
  }

  async deleteProject(projectId: string) {
    // Cascade spec: see `cascadeDelete.ts#applyProjectDeleteToSnapshot`.
    // The shared contract test in `localPersistenceContract.ts` locks this
    // path, the Storage path, and the SQLite path to identical behavior.
    this.#snapshot = applyProjectDeleteToSnapshot(this.#snapshot, projectId);
  }

  async markProjectOpened(projectId: string, openedAt: string): Promise<void> {
    this.#snapshot = {
      ...this.#snapshot,
      projects: this.#snapshot.projects.map((p) =>
        p.id === projectId ? { ...p, openedAt } : p
      )
    };
  }

  async deleteDrive(driveId: string) {
    // Cascade spec: see `cascadeDelete.ts#applyDriveDeleteToSnapshot`.
    // The shared contract test in `localPersistenceContract.ts` locks this
    // path, the Storage path, and the SQLite path to identical behavior
    // (H3 parity — sessions with `requestedDriveId === null` are
    // preserved, projects are nullified rather than deleted).
    this.#snapshot = applyDriveDeleteToSnapshot(this.#snapshot, driveId);
  }

  async deleteScanSession(scanId: string): Promise<void> {
    this.#snapshot = {
      ...this.#snapshot,
      scanSessions: this.#snapshot.scanSessions.filter((s) => s.scanId !== scanId),
    };
  }

  async listRenameSuggestions(): Promise<RenameSuggestion[]> {
    return clone(this.#renameSuggestions);
  }

  async upsertRenameSuggestion(suggestion: RenameSuggestion): Promise<void> {
    this.#renameSuggestions = upsertById(this.#renameSuggestions, suggestion);
  }

  async updateRenameSuggestionStatus(
    id: string,
    status: RenameSuggestionStatus,
    updatedAt: string
  ): Promise<void> {
    this.#renameSuggestions = this.#renameSuggestions.map((s) =>
      s.id === id ? { ...s, status, updatedAt } : s
    );
  }

  // ---------------------------------------------------------------------------
  // Time-travel undo for rename suggestions — mirrors the SQLite adapter so
  // tests and dev setups behave identically. The history is kept in
  // applied_at-DESC order on read, but stored in insertion order.
  // ---------------------------------------------------------------------------

  #renameUndoHistory: RenameUndoEntry[] = [];

  async recordRenameUndoEntry(entry: RenameUndoEntry): Promise<void> {
    this.#renameUndoHistory = upsertById(this.#renameUndoHistory, entry);
  }

  async getLatestRenameUndoEntry(): Promise<RenameUndoEntry | null> {
    if (this.#renameUndoHistory.length === 0) return null;
    const sorted = [...this.#renameUndoHistory].sort((a, b) =>
      b.appliedAt.localeCompare(a.appliedAt)
    );
    return clone(sorted[0]);
  }

  async deleteRenameUndoEntry(id: string): Promise<void> {
    this.#renameUndoHistory = this.#renameUndoHistory.filter((e) => e.id !== id);
  }
}
