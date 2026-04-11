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

export class InMemoryLocalPersistence implements LocalPersistenceAdapter {
  #snapshot: CatalogSnapshot;

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
    this.#snapshot.projects = this.#snapshot.projects.filter((p) => p.id !== projectId);
    this.#snapshot.projectScanEvents = this.#snapshot.projectScanEvents.filter((e) => e.projectId !== projectId);
  }

  async deleteDrive(driveId: string) {
    // Nullify drive references on projects (projects survive drive deletion).
    this.#snapshot.projects = this.#snapshot.projects.map((p) => {
      const updates: Partial<typeof p> = {};
      if (p.currentDriveId === driveId) updates.currentDriveId = null;
      if (p.targetDriveId === driveId) updates.targetDriveId = null;
      return Object.keys(updates).length > 0 ? { ...p, ...updates } : p;
    });

    // Cascade scans: drop projectScanEvents whose scan belongs to this drive, then the scans.
    this.#snapshot.projectScanEvents = this.#snapshot.projectScanEvents.filter(
      (e) => !this.#snapshot.scans.some((s) => s.driveId === driveId && s.id === e.scanId)
    );
    this.#snapshot.scans = this.#snapshot.scans.filter((s) => s.driveId !== driveId);

    // Cascade scan sessions: drop sessions whose requestedDriveId matches this drive. Their
    // embedded `projects` arrays (the scan_session_projects analog) go with them. Parity with
    // SqliteLocalPersistence.deleteDrive — see H3.
    this.#snapshot.scanSessions = this.#snapshot.scanSessions.filter(
      (session) => session.requestedDriveId !== driveId
    );

    // Finally, drop the drive itself.
    this.#snapshot.drives = this.#snapshot.drives.filter((d) => d.id !== driveId);
  }
}
