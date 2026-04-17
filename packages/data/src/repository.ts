import type {
  Category,
  Drive,
  FolderType,
  Project,
  ProjectScanEvent,
  ScanRecord,
  ScanSessionSnapshot,
  ScanSummary
} from "@drive-project-catalog/domain";
import type { StartupSyncResult, SyncCycleResult, SyncOperation, SyncResult, SyncState } from "./sync";
import type { DriveDetailView } from "./catalogSelectors";

export interface MoveReminder {
  projectId: string;
  projectName: string;
  currentDriveName: string;
  targetDriveName: string;
  sizeBytes: number | null;
}

export interface StatusAlert {
  kind: "missing" | "duplicate" | "unassigned";
  projectId: string;
  projectName: string;
  detail: string;
}

export interface DashboardSnapshot {
  recentScans: ScanSummary[];
  recentProjects: Project[];
  moveReminders: MoveReminder[];
  statusAlerts: StatusAlert[];
}

export interface ProjectListFilters {
  status?: "unassigned" | "missing" | "duplicate";
  folderType?: FolderType | "";
  currentDriveId?: string;
  search?: string;
}

export type ProjectUpsert = Project;
export type DriveUpsert = Drive;

export interface UpdateProjectMetadataInput {
  projectId: string;
  /** Override the displayed date (YYMMDD). Does not rename any folder on disk. */
  correctedDate: string | null;
  correctedClient: string | null;
  correctedProject: string | null;
  category: Category | null;
  /**
   * Reclassify the project type. Only used to upgrade personal_folder entries.
   * Setting this to a structured type also marks isStandardized = true.
   * Import never sets this — it can only be changed through the edit flow.
   */
  folderType: FolderType | null;
}

export interface CreateProjectInput {
  parsedDate: string;
  parsedClient: string;
  parsedProject: string;
  category: Category;
  sizeBytes?: number | null;
  currentDriveId?: string | null;
}

export interface CreateDriveInput {
  volumeName: string;
  displayName?: string | null;
  totalCapacityBytes?: number | null;
}

/**
 * One folder the user chose to import from an external volume. `path` is the
 * absolute on-disk path — it becomes the stored `folderPath` on the created
 * Project and is the stable key we dedup on.
 */
export interface ImportVolumeFolderInput {
  name: string;
  path: string;
}

export interface ImportFoldersFromVolumeInput {
  /** The catalog drive these folders belong to. */
  driveId: string;
  /**
   * The absolute root path the user selected in the native picker (the parent
   * of every entry in `folders`). Purely informational on the input — the
   * repository stores each folder's own absolute path via `folderPath`, which
   * already encodes full provenance on a stable per-record key. UI layers pass
   * this through so future provenance features (e.g. an "imported from" label
   * on project detail) have a single source of truth without a schema change.
   */
  sourcePath: string;
  folders: ImportVolumeFolderInput[];
}

/**
 * Result of a volume-import batch.
 *
 * Imports are dedup'd per drive on `folderPath`: if a project with the same
 * `currentDriveId` and `folderPath` already exists, it is preserved untouched
 * and counted in `skippedCount`. Only genuinely new folders produce Project
 * rows and contribute to `importedCount`.
 */
export interface ImportFoldersFromVolumeResult {
  importedCount: number;
  skippedCount: number;
  importedProjectIds: string[];
}

/**
 * Result of the one-shot "reclassify legacy folder types" maintenance action
 * (S9 / H12). The action walks non-manual projects whose `folderType` is
 * `personal_folder` and promotes them to `client` or `personal_project` when
 * the current classifier disagrees with the stored value. This exists to
 * recover from the blanket assignment migration 3 applied to legacy rows.
 *
 * The action is intentionally conservative: it only **upgrades**
 * personal_folder rows, never downgrades structured ones, and never touches
 * rows a user has manually created or edited (those carry `isManual: true`
 * or `isStandardized: true` intent that the classifier must respect).
 */
export interface ReclassifyLegacyFolderTypesResult {
  /** Rows considered (non-manual projects whose current type is personal_folder). */
  examinedCount: number;
  /** Rows that were upgraded to `client`. */
  clientReclassifiedCount: number;
  /** Rows that were upgraded to `personal_project`. */
  personalProjectReclassifiedCount: number;
  /** Rows the classifier agreed should stay `personal_folder`. */
  unchangedCount: number;
}

export interface CatalogRepository {
  getDashboardSnapshot(): Promise<DashboardSnapshot>;
  listProjects(filters?: ProjectListFilters): Promise<Project[]>;
  listDrives(): Promise<Drive[]>;
  listScans(): Promise<ScanRecord[]>;
  listScanSessions(): Promise<ScanSessionSnapshot[]>;
  getScanSession(scanId: string): Promise<ScanSessionSnapshot | null>;
  listProjectScanEvents(projectId?: string): Promise<ProjectScanEvent[]>;
  getProjectById(projectId: string): Promise<Project | null>;
  getDriveById(driveId: string): Promise<Drive | null>;
  getDriveDetailView(driveId: string): Promise<DriveDetailView | null>;
  saveProject(input: ProjectUpsert): Promise<Project>;
  saveDrive(input: DriveUpsert): Promise<Drive>;
  saveScan(scan: ScanRecord): Promise<ScanRecord>;
  saveScanSession(session: ScanSessionSnapshot): Promise<ScanSessionSnapshot>;
  appendProjectScanEvent(event: ProjectScanEvent): Promise<ProjectScanEvent>;
  updateProjectMetadata(input: UpdateProjectMetadataInput): Promise<Project>;
  createProject(input: CreateProjectInput): Promise<Project>;
  createDrive(input: CreateDriveInput): Promise<Drive>;
  importFoldersFromVolume(input: ImportFoldersFromVolumeInput): Promise<ImportFoldersFromVolumeResult>;
  planProjectMove(projectId: string, targetDriveId: string): Promise<Project>;
  confirmProjectMove(projectId: string): Promise<Project>;
  cancelProjectMove(projectId: string): Promise<Project>;
  ingestScanSnapshot(session: ScanSessionSnapshot): Promise<ScanRecord>;
  reclassifyLegacyFolderTypes(): Promise<ReclassifyLegacyFolderTypesResult>;
  deleteProject(projectId: string): Promise<void>;
  deleteDrive(driveId: string): Promise<void>;
  listPendingSyncOperations(): Promise<SyncOperation[]>;
  flushSync(): Promise<SyncResult>;
  getSyncState(): Promise<SyncState>;
  syncNow(): Promise<SyncCycleResult>;
  startupSync(options?: { isOnline?: boolean }): Promise<StartupSyncResult>;
}
