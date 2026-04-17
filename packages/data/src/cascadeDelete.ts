import type { CatalogSnapshot } from "./localPersistence";

/**
 * Pass 7 — centralized cascade-delete rules for LocalPersistenceAdapter.
 *
 * These pure snapshot transforms are the single authoritative specification
 * of what `deleteDrive` / `deleteProject` must do to a CatalogSnapshot. The
 * three LocalPersistenceAdapter implementations used to carry identical
 * cascade logic triplicated across:
 *
 *   - `InMemoryLocalPersistence.deleteDrive` / `.deleteProject`
 *   - `StorageLocalPersistence.deleteDrive` / `.deleteProject`
 *   - `SqliteLocalPersistence.deleteDrive` / `.deleteProject` (as SQL)
 *
 * InMemory and Storage now delegate here. The SQLite adapter continues to
 * use raw SQL for efficiency (no snapshot read on the hot path, no id-list
 * marshalling across the process boundary), but its SQL is locked to this
 * specification by the shared contract test in `localPersistenceContract.ts`
 * — every adapter runs the same `deleteDrive` / `deleteProject` fixture
 * suite, so a divergence anywhere surfaces immediately.
 *
 * Behavior contract (mirrors Passes 1 / 3 / 4 hardening markers):
 *
 *   applyProjectDeleteToSnapshot(snapshot, projectId)
 *     - Removes the project row with `id === projectId`.
 *     - Removes every `projectScanEvent` whose `projectId` matches.
 *     - Leaves every other entity untouched.
 *
 *   applyDriveDeleteToSnapshot(snapshot, driveId)
 *     - Nullifies `project.currentDriveId` / `project.targetDriveId` where
 *       they point to the deleted drive; projects SURVIVE drive deletion.
 *     - Removes every `projectScanEvent` whose parent scan belongs to the
 *       drive (keyed via `event.scanId === scan.id` where
 *       `scan.driveId === driveId`).
 *     - Removes every `scan` whose `driveId` matches.
 *     - Removes every `scanSession` whose `requestedDriveId` matches.
 *       Sessions with `requestedDriveId === null` are preserved. The
 *       session's embedded `projects` array (the `scan_session_projects`
 *       analog on the SQLite adapter) goes with the session.
 *     - Removes the drive row itself.
 *
 * Stable-reference semantics:
 *   Rows that are NOT mutated are returned by the same reference. Rows
 *   that ARE mutated are shallow-cloned with the update spread applied.
 *   Callers that want a deep clone of the result should clone it
 *   themselves — the `StorageLocalPersistence` path does so implicitly by
 *   round-tripping through JSON; the `InMemoryLocalPersistence` path
 *   clones at `readSnapshot` time.
 *
 * Purity:
 *   These helpers do not read or write any I/O, do not throw on missing
 *   records, and do not mutate the input snapshot. Passing an id that
 *   does not exist produces a snapshot whose content is identical to the
 *   input (the top-level object is new; inner arrays are new; every
 *   element reference is preserved).
 */

export function applyProjectDeleteToSnapshot(
  snapshot: CatalogSnapshot,
  projectId: string
): CatalogSnapshot {
  return {
    ...snapshot,
    projects: snapshot.projects.filter((project) => project.id !== projectId),
    projectScanEvents: snapshot.projectScanEvents.filter(
      (event) => event.projectId !== projectId
    )
  };
}

export function applyDriveDeleteToSnapshot(
  snapshot: CatalogSnapshot,
  driveId: string
): CatalogSnapshot {
  // Nullify drive references on projects. Projects are not deleted — they
  // survive drive deletion and can be re-linked to another drive later.
  // Stable reference is preserved for projects that do not reference the
  // deleted drive; only the affected fields are rewritten.
  const projects = snapshot.projects.map((project) => {
    const nullifyCurrent = project.currentDriveId === driveId;
    const nullifyTarget = project.targetDriveId === driveId;
    if (!nullifyCurrent && !nullifyTarget) {
      return project;
    }
    return {
      ...project,
      currentDriveId: nullifyCurrent ? null : project.currentDriveId,
      targetDriveId: nullifyTarget ? null : project.targetDriveId
    };
  });

  // `projectScanEvents` whose parent scan is owned by this drive: remove.
  // Keyed via `event.scanId` → `scan.id` → `scan.driveId`. Evaluated
  // against the pre-delete `snapshot.scans` so the index is stable even
  // though the scans themselves are also dropped below.
  const projectScanEvents = snapshot.projectScanEvents.filter(
    (event) =>
      !snapshot.scans.some(
        (scan) => scan.driveId === driveId && scan.id === event.scanId
      )
  );

  // Scans owned by this drive.
  const scans = snapshot.scans.filter((scan) => scan.driveId !== driveId);

  // Scan sessions whose `requestedDriveId` matches. Sessions with a null
  // `requestedDriveId` are preserved (they were not tied to any drive).
  // The session's embedded `projects` array goes with it — that is the
  // `scan_session_projects` analog on the storage/in-memory adapters.
  const scanSessions = snapshot.scanSessions.filter(
    (session) => session.requestedDriveId !== driveId
  );

  // The drive itself.
  const drives = snapshot.drives.filter((drive) => drive.id !== driveId);

  return { drives, projects, scans, projectScanEvents, scanSessions };
}
