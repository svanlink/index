import type {
  Category,
  Drive,
  Project,
  ProjectScanEvent,
  ScanRecord,
  ScanSessionSnapshot,
  ScanSummary
} from "@drive-project-catalog/domain";
import type { SyncOperation, SyncResult } from "./sync";
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
  currentDriveId?: string;
  search?: string;
}

export type ProjectUpsert = Project;
export type DriveUpsert = Drive;

export interface UpdateProjectMetadataInput {
  projectId: string;
  correctedClient: string | null;
  correctedProject: string | null;
  category: Category | null;
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
  planProjectMove(projectId: string, targetDriveId: string): Promise<Project>;
  confirmProjectMove(projectId: string): Promise<Project>;
  cancelProjectMove(projectId: string): Promise<Project>;
  ingestScanSnapshot(session: ScanSessionSnapshot): Promise<ScanRecord>;
  listPendingSyncOperations(): Promise<SyncOperation[]>;
  flushSync(): Promise<SyncResult>;
}
