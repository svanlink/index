import { applyDerivedProjectStates, type Drive, type Project, type ProjectScanEvent, type ScanRecord, type ScanSessionSnapshot } from "@drive-project-catalog/domain";
import { computeDriveCascadeIds, computeProjectCascadeIds } from "./cascadeIds";
import type { LocalPersistenceAdapter } from "./localPersistence";
import type { RemoteSyncChange } from "./sync";

/**
 * Result of applying a batch of pulled remote changes to local persistence.
 *
 * `appliedDeletes` (F5 / F7) surfaces the record ids whose inbound delete was
 * successfully applied — i.e. the local record existed, the LWW check passed,
 * and `persistence.delete{Drive,Project}` was called. This is the handshake
 * the caller (`LocalCatalogRepository.runSyncCycle`) uses to cancel any
 * outbound upsert entries still pending in the local sync queue for those
 * ids. Without that cancellation, the next flush would push the stale
 * upsert and resurrect the just-deleted record on the remote.
 *
 * Top-level `drives` and `projects` are the ids explicitly included in the
 * inbound batch. `scans`, `scanSessions`, and `projectScanEvents` are the
 * *cascade-derived* child ids that `persistence.deleteDrive` /
 * `persistence.deleteProject` removed locally — these entities have no
 * outbound `.delete` variant in `syncOperationTypes`, but they can have
 * pending outbound *upserts* (from a recent scan ingestion, say) that must
 * be cancelled before the next flush pushes them against a now-missing
 * parent on the remote. See F7 in `LocalCatalogRepository.runSyncCycle` for
 * the companion cancellation loop and `cascadeIds.ts` for the pure helper
 * that enumerates the child ids.
 */
export interface ApplyRemoteSyncChangesResult {
  appliedCount: number;
  appliedDeletes: {
    drives: string[];
    projects: string[];
    scans: string[];
    scanSessions: string[];
    projectScanEvents: string[];
  };
}

export async function applyRemoteSyncChanges(params: {
  persistence: LocalPersistenceAdapter;
  changes: RemoteSyncChange[];
}): Promise<ApplyRemoteSyncChangesResult> {
  if (params.changes.length === 0) {
    return {
      appliedCount: 0,
      appliedDeletes: {
        drives: [],
        projects: [],
        scans: [],
        scanSessions: [],
        projectScanEvents: []
      }
    };
  }

  const snapshot = await params.persistence.readSnapshot();
  const driveMap = new Map(snapshot.drives.map((drive) => [drive.id, drive] as const));
  const scanMap = new Map(snapshot.scans.map((scan) => [scan.id, scan] as const));
  const eventMap = new Map(snapshot.projectScanEvents.map((event) => [event.id, event] as const));
  const sessionMap = new Map(snapshot.scanSessions.map((session) => [session.scanId, session] as const));
  const projectMap = new Map(snapshot.projects.map((project) => [project.id, project] as const));

  // F4 — inbound delete buffers. Populated only for entities whose outbound
  // path declares a `.delete` variant in `syncOperationTypes` (drive, project).
  // Applied after the upsert flush so a delete's internal cascades (see
  // `persistence.deleteDrive`: nullify projects' drive refs, cascade scans,
  // scan_sessions, scan_session_projects) do not race with upserts that
  // might have rehydrated those rows in the same batch.
  const driveDeleteIds = new Set<string>();
  const projectDeleteIds = new Set<string>();

  // F7 (Pass 4) — cascaded-child buffers. Populated from the pre-merge
  // snapshot at the point each parent delete is accepted, so the
  // enumeration reflects what `persistence.deleteDrive` /
  // `persistence.deleteProject` will actually cascade locally. These ids
  // are surfaced to the caller so it can cancel any pending outbound
  // upsert for those children — without that, a queued `scan.upsert` or
  // `projectScanEvent.upsert` would be pushed on the next flush against a
  // just-deleted parent.
  //
  // Using the pre-merge snapshot (rather than re-reading after each
  // persistence mutation) is intentional: it gives us a stable view of
  // which children the cascade will catch, independent of the order in
  // which the inbound batch's deletes are applied. If the same batch
  // contains drive.delete(A) and project.delete(P) and P's events are
  // already a subset of A's cascaded events, the event id appears in both
  // cascade buffers — the caller uses a Set-dedupe path via
  // `cancelPendingForRecord` which is idempotent on a missing queue
  // entry, so the duplicate is harmless.
  const cascadedScanIds = new Set<string>();
  const cascadedScanSessionIds = new Set<string>();
  const cascadedProjectScanEventIds = new Set<string>();

  let appliedCount = 0;
  let shouldRecomputeProjects = false;

  for (const change of params.changes) {
    switch (change.entity) {
      case "drive": {
        if (change.change === "delete") {
          const recordId = readDeletePayloadId(change.payload);
          if (!recordId) continue;
          const localDrive = driveMap.get(recordId);
          // No-op if we have nothing to delete. We do not count this as
          // applied — the remote and local agree the record is gone.
          if (!localDrive) continue;
          if (!shouldApplyRemote(localDrive.updatedAt, change.remoteUpdatedAt)) continue;
          driveMap.delete(recordId);
          driveDeleteIds.add(recordId);
          // F7 — enumerate the cascade against the pre-merge snapshot so the
          // caller can cancel pending outbound upserts for the children.
          // LWW has already passed above, so this enumeration runs for
          // applied deletes only.
          const cascade = computeDriveCascadeIds(snapshot, recordId);
          for (const id of cascade.scans) cascadedScanIds.add(id);
          for (const id of cascade.scanSessions) cascadedScanSessionIds.add(id);
          for (const id of cascade.projectScanEvents) cascadedProjectScanEventIds.add(id);
          appliedCount += 1;
          break;
        }
        const remoteDrive = change.payload as Drive;
        const localDrive = driveMap.get(remoteDrive.id);
        if (!shouldApplyRemote(localDrive?.updatedAt, change.remoteUpdatedAt)) {
          continue;
        }
        driveMap.set(remoteDrive.id, remoteDrive);
        // A newer upsert supersedes any earlier buffered delete in the same batch.
        driveDeleteIds.delete(remoteDrive.id);
        appliedCount += 1;
        break;
      }
      case "project": {
        if (change.change === "delete") {
          const recordId = readDeletePayloadId(change.payload);
          if (!recordId) continue;
          const localProject = projectMap.get(recordId);
          if (!localProject) continue;
          if (!shouldApplyRemote(localProject.updatedAt, change.remoteUpdatedAt)) continue;
          projectMap.delete(recordId);
          projectDeleteIds.add(recordId);
          // F7 — enumerate the cascade against the pre-merge snapshot.
          // Only `projectScanEvents` cascade for project deletion; scans
          // and sessions are keyed to the drive, not the project.
          const cascade = computeProjectCascadeIds(snapshot, recordId);
          for (const id of cascade.projectScanEvents) cascadedProjectScanEventIds.add(id);
          // Recompute derived states (e.g., duplicateStatus) across the
          // remaining projects — deleting one may free another from a
          // duplicate cluster.
          shouldRecomputeProjects = true;
          appliedCount += 1;
          break;
        }
        const remoteProject = change.payload as Project;
        const localProject = projectMap.get(remoteProject.id);
        if (!shouldApplyRemote(localProject?.updatedAt, change.remoteUpdatedAt)) {
          continue;
        }
        projectMap.set(remoteProject.id, remoteProject);
        projectDeleteIds.delete(remoteProject.id);
        shouldRecomputeProjects = true;
        appliedCount += 1;
        break;
      }
      case "scan": {
        // F4 — no outbound `scan.delete` exists (see `syncOperationTypes`),
        // and `LocalPersistenceAdapter` exposes no `deleteScan` method. Scan
        // rows are cleaned up only as a cascade of drive deletion. If a
        // hypothetical adapter emits a scan delete we silently skip it rather
        // than risk a corrupt write; the caller should either add a deleteScan
        // method to the adapter or route the cascade through drive deletion.
        if (change.change === "delete") continue;
        const remoteScan = change.payload as ScanRecord;
        const localScan = scanMap.get(remoteScan.id);
        if (!shouldApplyRemote(localScan?.updatedAt, change.remoteUpdatedAt)) {
          continue;
        }
        scanMap.set(remoteScan.id, remoteScan);
        appliedCount += 1;
        break;
      }
      case "projectScanEvent": {
        // Same rationale as `scan` — no outbound delete path, no adapter
        // method. Events are cleaned up as a cascade of project or drive
        // deletion.
        if (change.change === "delete") continue;
        const remoteEvent = change.payload as ProjectScanEvent;
        const localEvent = eventMap.get(remoteEvent.id);
        if (!shouldApplyRemote(localEvent?.updatedAt, change.remoteUpdatedAt)) {
          continue;
        }
        eventMap.set(remoteEvent.id, remoteEvent);
        appliedCount += 1;
        break;
      }
      case "scanSession": {
        // Same rationale as `scan` — no outbound delete path. Sessions are
        // cleaned up only when the requested drive is deleted.
        if (change.change === "delete") continue;
        const remoteSession = change.payload as ScanSessionSnapshot;
        const localSession = sessionMap.get(remoteSession.scanId);
        if (!shouldApplyRemote(localSession?.updatedAt, change.remoteUpdatedAt)) {
          continue;
        }
        sessionMap.set(remoteSession.scanId, mergeRemoteScanSession(localSession, remoteSession));
        appliedCount += 1;
        break;
      }
    }
  }

  if (shouldRecomputeProjects) {
    // projectMap is already stripped of deleted ids, so the derived recompute
    // sees the post-delete view — a project that was a duplicate of a just-
    // deleted project will be re-classified correctly.
    const nextProjects = applyDerivedProjectStates(Array.from(projectMap.values()));
    const changedProjects = getChangedById(snapshot.projects, nextProjects);
    if (changedProjects.length > 0) {
      await params.persistence.upsertProjects(changedProjects);
    }
  }

  const changedDrives = getChangedById(snapshot.drives, Array.from(driveMap.values()));
  if (changedDrives.length > 0) {
    await params.persistence.upsertDrives(changedDrives);
  }

  const changedScans = getChangedById(snapshot.scans, Array.from(scanMap.values()));
  for (const scan of changedScans) {
    await params.persistence.upsertScan(scan);
  }

  const changedEvents = getChangedById(snapshot.projectScanEvents, Array.from(eventMap.values()));
  if (changedEvents.length > 0) {
    await params.persistence.upsertProjectScanEvents(changedEvents);
  }

  const changedSessions = getChangedByScanId(snapshot.scanSessions, Array.from(sessionMap.values()));
  for (const session of changedSessions) {
    await params.persistence.upsertScanSession(session);
  }

  // Apply inbound deletes after the upsert flush. `deleteDrive` cascades
  // into projects / scans / project_scan_events / scan_sessions /
  // scan_session_projects (see Pass 1 F1 hardening in `sqliteLocalPersistence`
  // and the equivalent in `storageLocalPersistence` / `inMemoryLocalPersistence`).
  // `deleteProject` cascades into `project_scan_events`.
  //
  // These persistence calls bypass the sync queue — they apply a remote
  // deletion locally and must NOT echo an outbound delete back to the
  // remote (the remote is already the source of this change). The
  // companion to this silence is the `appliedDeletes` return value: the
  // caller is expected to surgically cancel any pending outbound upsert
  // for these ids from the local queue, otherwise the next flush would
  // push the stale upsert and resurrect the record on the remote.
  //
  // See `LocalCatalogRepository.runSyncCycle` for the cancellation
  // wiring and `SyncAdapter.cancelPendingForRecord` for the primitive
  // that performs the local-only queue mutation (no remote push).
  //
  // In-flight upserts are intentionally NOT cancelled at the adapter
  // level — they are already in transit to the remote and cannot be
  // cleanly interrupted. The worst case is a brief reanimation on the
  // remote (pushed upsert succeeds after the delete locally), which
  // matches the Pass 1 outbound-delete invariant.
  for (const driveId of driveDeleteIds) {
    await params.persistence.deleteDrive(driveId);
  }
  for (const projectId of projectDeleteIds) {
    await params.persistence.deleteProject(projectId);
  }

  return {
    appliedCount,
    appliedDeletes: {
      drives: Array.from(driveDeleteIds),
      projects: Array.from(projectDeleteIds),
      scans: Array.from(cascadedScanIds),
      scanSessions: Array.from(cascadedScanSessionIds),
      projectScanEvents: Array.from(cascadedProjectScanEventIds)
    }
  };
}

/**
 * Extract the primary-key id from an inbound delete payload.
 *
 * Outbound deletes carry `{ id: string; updatedAt: string }` (see
 * `LocalCatalogRepository.enqueueDelete`). For robustness against adapters
 * that send just the id or use a different shape, we accept any object with
 * a string `id` and fall back to `null` so the caller can treat a
 * malformed payload as a no-op rather than throwing.
 */
function readDeletePayloadId(payload: unknown): string | null {
  if (payload && typeof payload === "object") {
    const candidate = (payload as { id?: unknown }).id;
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return null;
}

function shouldApplyRemote(localUpdatedAt: string | undefined, remoteUpdatedAt: string) {
  if (!localUpdatedAt) {
    return true;
  }

  return remoteUpdatedAt > localUpdatedAt;
}

/**
 * Merge a remote scan session row onto the local record.
 *
 * Two of the session fields are local-only by contract (see
 * `localOnlySyncFields.scanSession` in `supabaseSyncMapping.ts`):
 *
 *   - `rootPath`  — filesystem path with no meaning on another device; never
 *                   serialized to Supabase, never readable from the remote.
 *                   `fromSupabaseScanSessionRow` rehydrates it as `""`.
 *   - `projects`  — the observed child collection. The remote table does not
 *                   have a column for it; `fromSupabaseScanSessionRow` always
 *                   rehydrates this as `[]`. Cross-device sync of the
 *                   observed project list would require a dedicated
 *                   `scan_session_projects` entity with its own push/pull
 *                   path — that is out of scope for the current sync design.
 *
 * Under that contract, the merge must never let a remote pull wipe out the
 * locally-observed projects (which are populated during live scan ingestion).
 * The union below is defensive on two axes:
 *
 *   1. Nullish coalescing alone would not defend against a `local.projects
 *      === []` edge case if `remote.projects` ever became non-empty in the
 *      future (empty arrays are not nullish). The id-keyed union handles
 *      that correctly: local entries always win, and any remote-only ids
 *      are appended without clobbering.
 *   2. Today `remote.projects` is always `[]`, so the union reduces to the
 *      local list — a no-op for the current data shape, which keeps this
 *      change a pure hardening against future adapter changes rather than
 *      a behavior-visible fix.
 *
 * `rootPath` receives the same treatment: prefer the local copy, fall back
 * to any non-empty remote value (currently impossible but cheap), otherwise
 * empty string.
 */
function mergeRemoteScanSession(local: ScanSessionSnapshot | undefined, remote: ScanSessionSnapshot): ScanSessionSnapshot {
  return {
    ...remote,
    rootPath: local?.rootPath ?? remote.rootPath ?? "",
    projects: unionScanProjectsById(local?.projects, remote.projects),
    requestedDriveId: remote.requestedDriveId ?? local?.requestedDriveId ?? null,
    requestedDriveName: remote.requestedDriveName ?? local?.requestedDriveName ?? null,
    summary: remote.summary ?? local?.summary ?? null,
    createdAt: local?.createdAt ?? remote.createdAt,
    updatedAt: remote.updatedAt
  };
}

function unionScanProjectsById(
  local: ScanSessionSnapshot["projects"] | undefined,
  remote: ScanSessionSnapshot["projects"] | undefined
): ScanSessionSnapshot["projects"] {
  const localList = local ?? [];
  const remoteList = remote ?? [];
  if (localList.length === 0) {
    return remoteList;
  }
  if (remoteList.length === 0) {
    return localList;
  }
  const localIds = new Set(localList.map((project) => project.id));
  const remoteOnly = remoteList.filter((project) => !localIds.has(project.id));
  if (remoteOnly.length === 0) {
    return localList;
  }
  return [...localList, ...remoteOnly];
}

function getChangedById<T extends { id: string }>(previous: T[], next: T[]) {
  const previousById = new Map(previous.map((item) => [item.id, item] as const));
  return next.filter((item) => JSON.stringify(previousById.get(item.id)) !== JSON.stringify(item));
}

function getChangedByScanId<T extends { scanId: string }>(previous: T[], next: T[]) {
  const previousById = new Map(previous.map((item) => [item.scanId, item] as const));
  return next.filter((item) => JSON.stringify(previousById.get(item.scanId)) !== JSON.stringify(item));
}
