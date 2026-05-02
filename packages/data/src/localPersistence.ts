import type { Drive, Project, ProjectScanEvent, RenameSuggestion, RenameSuggestionStatus, ScanRecord, ScanSessionSnapshot } from "@drive-project-catalog/domain";

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
  deleteScanSession(scanId: string): Promise<void>;
  listRenameSuggestions(): Promise<RenameSuggestion[]>;
  upsertRenameSuggestion(suggestion: RenameSuggestion): Promise<void>;
  updateRenameSuggestionStatus(id: string, status: RenameSuggestionStatus, updatedAt: string): Promise<void>;
  /** Append a row capturing the previous state of a rename suggestion before mutation. */
  recordRenameUndoEntry(entry: RenameUndoEntry): Promise<void>;
  /** Most-recently applied undo entry, or null when the history is empty. */
  getLatestRenameUndoEntry(): Promise<RenameUndoEntry | null>;
  /** Remove an undo entry — called after a successful undo, or when history is pruned. */
  deleteRenameUndoEntry(id: string): Promise<void>;
}

/**
 * One step of the rename undo history. Captures the suggestion's previous
 * status so a future `undoLastRenameOperation` call can revert exactly the
 * field that the user mutated. The rename engine never touches the disk, so
 * undo is purely metadata — no filesystem rollback is required.
 */
export interface RenameUndoEntry {
  id: string;
  suggestionId: string;
  projectId: string;
  previousStatus: RenameSuggestionStatus;
  appliedStatus: RenameSuggestionStatus;
  appliedAt: string;
}
