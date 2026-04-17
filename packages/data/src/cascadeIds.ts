import type { CatalogSnapshot } from "./localPersistence";

/**
 * Identifiers of child records that `persistence.deleteDrive` or
 * `persistence.deleteProject` will cascade-remove locally.
 *
 * F7 (Pass 4) — these ids are fed to `SyncAdapter.cancelPendingForRecord` so
 * any pending outbound upsert for a just-cascade-deleted child is dropped
 * from the local queue before it can be pushed to the remote. Without this,
 * a queued `scan.upsert` (say, from a recent scan ingestion) would be pushed
 * on the next flush against a `drive_id` that no longer exists, producing
 * either an orphaned remote row (no FK), a silent CASCADE of children on
 * the remote, or a hard RESTRICT error — none of which match the local
 * intent.
 *
 * `scanSessions` is keyed by `scanId`, matching the sync record-id contract
 * in `getSyncRecordDescriptor` for `scanSession.upsert` operations.
 */
export interface CatalogCascadeIds {
  scans: string[];
  scanSessions: string[];
  projectScanEvents: string[];
}

/**
 * Enumerate the child record ids that `persistence.deleteDrive(driveId)`
 * will cascade-remove. Mirrors the cascade rules implemented identically in
 * `inMemoryLocalPersistence` and `sqliteLocalPersistence`:
 *
 *   - `scans` where `driveId === driveId`
 *   - `scanSessions` where `requestedDriveId === driveId`
 *   - `projectScanEvents` whose `scanId` points at one of the cascaded scans
 *
 * Projects are intentionally NOT in this list — drive deletion only
 * nullifies `currentDriveId` / `targetDriveId` on projects; projects
 * themselves survive, and their outbound upsert queue entry (if any) is
 * still valid.
 *
 * Pure function: safe to call against any snapshot shape, returns empty
 * arrays when no children match.
 */
export function computeDriveCascadeIds(
  snapshot: CatalogSnapshot,
  driveId: string
): CatalogCascadeIds {
  const scansOnDrive = snapshot.scans.filter((scan) => scan.driveId === driveId);
  const cascadedScanIds = new Set(scansOnDrive.map((scan) => scan.id));

  return {
    scans: scansOnDrive.map((scan) => scan.id),
    scanSessions: snapshot.scanSessions
      .filter((session) => session.requestedDriveId === driveId)
      .map((session) => session.scanId),
    projectScanEvents: snapshot.projectScanEvents
      .filter((event) => cascadedScanIds.has(event.scanId))
      .map((event) => event.id)
  };
}

/**
 * Enumerate the child record ids that `persistence.deleteProject(projectId)`
 * will cascade-remove. Today that is only `projectScanEvents` whose
 * `projectId` matches — scans and sessions are tied to the drive, not the
 * project, so they are untouched by project deletion.
 */
export function computeProjectCascadeIds(
  snapshot: CatalogSnapshot,
  projectId: string
): CatalogCascadeIds {
  return {
    scans: [],
    scanSessions: [],
    projectScanEvents: snapshot.projectScanEvents
      .filter((event) => event.projectId === projectId)
      .map((event) => event.id)
  };
}
