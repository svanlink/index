import type { Drive, Project, ProjectScanEvent, ScanRecord, ScanSessionSnapshot } from "@drive-project-catalog/domain";

export interface CatalogSnapshot {
  drives: Drive[];
  projects: Project[];
  scans: ScanRecord[];
  projectScanEvents: ProjectScanEvent[];
  scanSessions: ScanSessionSnapshot[];
}

export interface LocalPersistenceAdapter {
  readSnapshot(): Promise<CatalogSnapshot>;
  replaceSnapshot(snapshot: CatalogSnapshot): Promise<void>;
  listDrives(): Promise<Drive[]>;
  listProjects(): Promise<Project[]>;
  listScans(): Promise<ScanRecord[]>;
  listProjectScanEvents(projectId?: string): Promise<ProjectScanEvent[]>;
  listScanSessions(): Promise<ScanSessionSnapshot[]>;
  getDriveById(driveId: string): Promise<Drive | null>;
  getProjectById(projectId: string): Promise<Project | null>;
  getScanSession(scanId: string): Promise<ScanSessionSnapshot | null>;
  upsertDrive(drive: Drive): Promise<void>;
  upsertDrives(drives: Drive[]): Promise<void>;
  upsertProject(project: Project): Promise<void>;
  upsertProjects(projects: Project[]): Promise<void>;
  upsertScan(scan: ScanRecord): Promise<void>;
  upsertProjectScanEvent(event: ProjectScanEvent): Promise<void>;
  upsertProjectScanEvents(events: ProjectScanEvent[]): Promise<void>;
  upsertScanSession(session: ScanSessionSnapshot): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  deleteDrive(driveId: string): Promise<void>;
}
