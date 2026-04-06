import type {
  Drive,
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

export const localOnlySyncFields = {
  scanSession: ["rootPath"],
  scanSessionProject: ["folderPath", "relativePath"]
} as const;

export function toSupabaseDriveRow(drive: Drive) {
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

export function toSupabaseProjectRow(project: Project) {
  return {
    id: project.id,
    parsed_date: project.parsedDate,
    parsed_client: project.parsedClient,
    parsed_project: project.parsedProject,
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

export function toSupabaseScanSessionRow(session: ScanSessionSnapshot) {
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

export function toSupabaseProjectScanEventRow(event: ProjectScanEvent) {
  return {
    id: event.id,
    project_id: event.projectId,
    scan_id: event.scanId,
    observed_folder_name: event.observedFolderName,
    observed_drive_name: event.observedDriveName,
    observed_at: event.observedAt,
    created_at: event.createdAt,
    updated_at: event.updatedAt
  };
}
