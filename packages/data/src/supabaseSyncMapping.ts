import type {
  Drive,
  FolderType,
  Project,
  ProjectScanEvent,
  ScanRecord,
  ScanSessionSnapshot
} from "@drive-project-catalog/domain";

export const supabaseSyncTables = {
  drives: "drives",
  projects: "projects",
  scans: "scans",
  scanSessions: "scan_sessions",
  projectScanEvents: "project_scan_events"
} as const;

/**
 * Domain fields that are intentionally NOT projected onto Supabase rows.
 *
 * Two reasons a field can land here:
 *  1. It is a local-machine-only attribute (filesystem paths that have no
 *     meaning on another device — e.g. `rootPath`, `folderPath`).
 *  2. It is a derived value the domain layer recomputes from other state
 *     and the persisted/synced copy would only drift (e.g. `reservedIncomingBytes`,
 *     which `getDriveCapacitySnapshot` recalculates from project move plans).
 *
 * `supabaseSyncMapping.test.ts` consumes this object as the **single source
 * of truth** for the to/from symmetry contract: any field listed here is
 * skipped during round-trip equality, and any field NOT listed here MUST be
 * preserved exactly through `to → from`.
 */
export const localOnlySyncFields = {
  drive: ["reservedIncomingBytes"],
  scanSession: ["rootPath", "projects"],
  scanSessionProject: ["folderPath", "relativePath"]
} as const;

export interface SupabaseDriveRow {
  id: string;
  volume_name: string;
  display_name: string;
  total_capacity_bytes: number | null;
  used_bytes: number | null;
  free_bytes: number | null;
  last_scanned_at: string | null;
  created_manually: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupabaseProjectRow {
  id: string;
  folder_type: FolderType;
  is_standardized: boolean;
  folder_name: string;
  folder_path: string | null;
  parsed_date: string | null;
  parsed_client: string | null;
  parsed_project: string | null;
  corrected_date: string | null;
  corrected_client: string | null;
  corrected_project: string | null;
  category: Project["category"];
  size_bytes: number | null;
  size_status: Project["sizeStatus"];
  current_drive_id: string | null;
  target_drive_id: string | null;
  move_status: Project["moveStatus"];
  missing_status: Project["missingStatus"];
  duplicate_status: Project["duplicateStatus"];
  is_unassigned: boolean;
  is_manual: boolean;
  last_seen_at: string | null;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseScanRow {
  id: string;
  drive_id: string | null;
  started_at: string;
  finished_at: string | null;
  status: ScanRecord["status"];
  folders_scanned: number;
  matches_found: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseScanSessionRow {
  scan_id: string;
  drive_name: string;
  status: ScanSessionSnapshot["status"];
  started_at: string;
  finished_at: string | null;
  folders_scanned: number;
  matches_found: number;
  error: string | null;
  size_jobs_pending: number;
  requested_drive_id: string | null;
  requested_drive_name: string | null;
  summary_new_projects_count: number | null;
  summary_updated_projects_count: number | null;
  summary_missing_projects_count: number | null;
  summary_duplicates_flagged_count: number | null;
  summary_duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseProjectScanEventRow {
  id: string;
  project_id: string;
  scan_id: string;
  observed_folder_name: string;
  observed_drive_name: string;
  observed_folder_type: FolderType | null;
  observed_at: string;
  created_at: string;
  updated_at: string;
}

export function toSupabaseDriveRow(drive: Drive) {
  // NOTE: `reservedIncomingBytes` is intentionally omitted — it is a derived
  // field recomputed by `getDriveCapacitySnapshot` from the project move plan.
  // See `localOnlySyncFields.drive` for the contract; the symmetry test in
  // `supabaseSyncMapping.test.ts` enforces this exclusion.
  return {
    id: drive.id,
    volume_name: drive.volumeName,
    display_name: drive.displayName,
    total_capacity_bytes: drive.totalCapacityBytes,
    used_bytes: drive.usedBytes,
    free_bytes: drive.freeBytes,
    last_scanned_at: drive.lastScannedAt,
    created_manually: drive.createdManually,
    created_at: drive.createdAt,
    updated_at: drive.updatedAt
  };
}

export function fromSupabaseDriveRow(row: SupabaseDriveRow): Drive {
  // NOTE: `reservedIncomingBytes` is seeded to 0 here on purpose. Callers
  // that surface drives in the UI must run them through `getDriveCapacitySnapshot`
  // (or `catalogSelectors`) so the field is recomputed from the local project
  // move plan. Do NOT persist this value back to Supabase — see
  // `localOnlySyncFields.drive` and the symmetry test for the enforced contract.
  return {
    id: row.id,
    volumeName: row.volume_name,
    displayName: row.display_name,
    totalCapacityBytes: row.total_capacity_bytes,
    usedBytes: row.used_bytes,
    freeBytes: row.free_bytes,
    reservedIncomingBytes: 0,
    lastScannedAt: row.last_scanned_at,
    createdManually: Boolean(row.created_manually),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toSupabaseProjectRow(project: Project) {
  return {
    id: project.id,
    folder_type: project.folderType,
    is_standardized: project.isStandardized,
    folder_name: project.folderName,
    folder_path: project.folderPath,
    parsed_date: project.parsedDate,
    parsed_client: project.parsedClient,
    parsed_project: project.parsedProject,
    corrected_date: project.correctedDate,
    corrected_client: project.correctedClient,
    corrected_project: project.correctedProject,
    category: project.category,
    size_bytes: project.sizeBytes,
    size_status: project.sizeStatus,
    current_drive_id: project.currentDriveId,
    target_drive_id: project.targetDriveId,
    move_status: project.moveStatus,
    missing_status: project.missingStatus,
    duplicate_status: project.duplicateStatus,
    is_unassigned: project.isUnassigned,
    is_manual: project.isManual,
    last_seen_at: project.lastSeenAt,
    last_scanned_at: project.lastScannedAt,
    created_at: project.createdAt,
    updated_at: project.updatedAt
  };
}

export function fromSupabaseProjectRow(row: SupabaseProjectRow): Project {
  return {
    id: row.id,
    folderType: row.folder_type,
    isStandardized: Boolean(row.is_standardized),
    folderName: row.folder_name,
    folderPath: row.folder_path,
    parsedDate: row.parsed_date,
    parsedClient: row.parsed_client,
    parsedProject: row.parsed_project,
    correctedDate: row.corrected_date,
    correctedClient: row.corrected_client,
    correctedProject: row.corrected_project,
    category: row.category,
    sizeBytes: row.size_bytes,
    sizeStatus: row.size_status,
    currentDriveId: row.current_drive_id,
    targetDriveId: row.target_drive_id,
    moveStatus: row.move_status,
    missingStatus: row.missing_status,
    duplicateStatus: row.duplicate_status,
    isUnassigned: Boolean(row.is_unassigned),
    isManual: Boolean(row.is_manual),
    lastSeenAt: row.last_seen_at,
    lastScannedAt: row.last_scanned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toSupabaseScanRow(scan: ScanRecord) {
  return {
    id: scan.id,
    drive_id: scan.driveId,
    started_at: scan.startedAt,
    finished_at: scan.finishedAt,
    status: scan.status,
    folders_scanned: scan.foldersScanned,
    matches_found: scan.matchesFound,
    notes: scan.notes,
    created_at: scan.createdAt,
    updated_at: scan.updatedAt
  };
}

export function fromSupabaseScanRow(row: SupabaseScanRow): ScanRecord {
  return {
    id: row.id,
    driveId: row.drive_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    foldersScanned: row.folders_scanned,
    matchesFound: row.matches_found,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toSupabaseScanSessionRow(session: ScanSessionSnapshot) {
  // NOTE: `rootPath` and `projects` are intentionally omitted.
  //  - `rootPath` is a local filesystem path that has no meaning on another
  //    device.
  //  - `projects` is a child collection persisted as `scan_session_projects`
  //    rows; they are synced through their own entity, not as a column.
  // See `localOnlySyncFields.scanSession`. The symmetry test enforces this.
  return {
    scan_id: session.scanId,
    drive_name: session.driveName,
    status: session.status,
    started_at: session.startedAt,
    finished_at: session.finishedAt,
    folders_scanned: session.foldersScanned,
    matches_found: session.matchesFound,
    error: session.error,
    size_jobs_pending: session.sizeJobsPending,
    requested_drive_id: session.requestedDriveId ?? null,
    requested_drive_name: session.requestedDriveName ?? null,
    summary_new_projects_count: session.summary?.newProjectsCount ?? null,
    summary_updated_projects_count: session.summary?.updatedProjectsCount ?? null,
    summary_missing_projects_count: session.summary?.missingProjectsCount ?? null,
    summary_duplicates_flagged_count: session.summary?.duplicatesFlaggedCount ?? null,
    summary_duration_ms: session.summary?.durationMs ?? null,
    created_at: session.createdAt,
    updated_at: session.updatedAt
  };
}

export function fromSupabaseScanSessionRow(row: SupabaseScanSessionRow): ScanSessionSnapshot {
  // NOTE: `rootPath` is restored as an empty string and `projects` as an empty
  // array — both are local-only by contract (`localOnlySyncFields.scanSession`).
  // The local persistence layer reattaches `projects` from `scan_session_projects`;
  // `rootPath` is not recoverable from the remote and stays empty for any pulled
  // session that did not originate on this device.
  return {
    scanId: row.scan_id,
    rootPath: "",
    driveName: row.drive_name,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    foldersScanned: row.folders_scanned,
    matchesFound: row.matches_found,
    error: row.error,
    sizeJobsPending: row.size_jobs_pending,
    projects: [],
    requestedDriveId: row.requested_drive_id,
    requestedDriveName: row.requested_drive_name,
    summary:
      row.summary_new_projects_count === null &&
      row.summary_updated_projects_count === null &&
      row.summary_missing_projects_count === null &&
      row.summary_duplicates_flagged_count === null &&
      row.summary_duration_ms === null
        ? null
        : {
            newProjectsCount: row.summary_new_projects_count ?? 0,
            updatedProjectsCount: row.summary_updated_projects_count ?? 0,
            missingProjectsCount: row.summary_missing_projects_count ?? 0,
            duplicatesFlaggedCount: row.summary_duplicates_flagged_count ?? 0,
            durationMs: row.summary_duration_ms
          },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function toSupabaseProjectScanEventRow(event: ProjectScanEvent) {
  return {
    id: event.id,
    project_id: event.projectId,
    scan_id: event.scanId,
    observed_folder_name: event.observedFolderName,
    observed_drive_name: event.observedDriveName,
    observed_folder_type: event.observedFolderType,
    observed_at: event.observedAt,
    created_at: event.createdAt,
    updated_at: event.updatedAt
  };
}

export function fromSupabaseProjectScanEventRow(row: SupabaseProjectScanEventRow): ProjectScanEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    scanId: row.scan_id,
    observedFolderName: row.observed_folder_name,
    observedDriveName: row.observed_drive_name,
    observedFolderType: row.observed_folder_type ?? null,
    observedAt: row.observed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
