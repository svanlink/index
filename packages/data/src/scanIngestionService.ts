/**
 * @module scanIngestionService
 *
 * IMPORT SAFETY CONTRACT — this module is read-only with respect to the filesystem.
 *
 * Allowed:
 *   - Classify and parse folder names from scan records
 *   - Transform ScanSessionSnapshot into Project/Drive/ScanRecord domain objects
 *   - Write results to the database (via the persistence adapter)
 *
 * Never allowed:
 *   - Rename, move, copy, or delete files or directories
 *   - Auto-correct folder names on disk
 *   - Invoke any Tauri filesystem plugin (`@tauri-apps/plugin-fs` must not be imported here)
 *   - Apply correctedClient / correctedProject to the filesystem path
 *
 * Folder corrections are purely database metadata and are only written through
 * the explicit user edit flow (`updateProjectMetadata`), never during ingest.
 *
 * @see localCatalogRepository.updateProjectMetadata — the only path that writes corrections
 */
import {
  applyDerivedProjectStates,
  type Drive,
  type Project,
  type ProjectScanEvent,
  type ScanIngestionSummary,
  type ScanRecord,
  type ScanSessionSnapshot
} from "@drive-project-catalog/domain";
import { createEmptyScanSummary } from "./scanSelectors";
import type { CatalogSnapshot } from "./localPersistence";

const clone = <T>(value: T): T => structuredClone(value);

export interface ScanIngestionResult {
  snapshot: CatalogSnapshot;
  drive: Drive;
  scan: ScanRecord;
  session: ScanSessionSnapshot;
}

/**
 * Terminal statuses in descending priority order.
 *
 * A non-terminal status (e.g. "running") must never overwrite a terminal one,
 * and within the terminal set a lower-priority status must never overwrite a
 * higher-priority one. `failed` is ranked highest because a hard failure
 * should not be silently upgraded by a stale "completed" / "interrupted" /
 * "cancelled" snapshot that was already in flight when the engine gave up.
 *
 * Non-terminal statuses (e.g. `running`) are intentionally absent from this
 * map — `isTerminal()` treats them as upgradeable, and `isDowngrade()` blocks
 * any attempt to replace a terminal status with them.
 */
const TERMINAL_STATUS_PRIORITY: Record<string, number> = {
  failed: 4,
  completed: 3,
  interrupted: 2,
  cancelled: 1
};

function isTerminalStatus(status: string): boolean {
  return Object.prototype.hasOwnProperty.call(TERMINAL_STATUS_PRIORITY, status);
}

/**
 * Returns true when writing `incomingStatus` on top of `existingStatus` would
 * lose information.
 *
 * Cases handled:
 *   - Terminal → non-terminal (e.g. completed → running): DOWNGRADE
 *   - Lower terminal → higher terminal (e.g. completed → cancelled,
 *     completed → failed's inverse): DOWNGRADE
 *   - Non-terminal → anything: UPGRADE (allowed) — a fresh run naturally
 *     replaces a stale running/unknown snapshot
 *   - Higher terminal → lower terminal never occurs because the guard blocks
 *     it first; the symmetric upgrade direction (cancelled → completed) is
 *     allowed since a real completion is stronger signal than a cancel.
 */
function isDowngrade(existingStatus: string, incomingStatus: string): boolean {
  const existingTerminal = isTerminalStatus(existingStatus);
  if (!existingTerminal) {
    return false;
  }
  if (!isTerminalStatus(incomingStatus)) {
    return true;
  }
  return TERMINAL_STATUS_PRIORITY[incomingStatus] < TERMINAL_STATUS_PRIORITY[existingStatus];
}

export function ingestScanSessionSnapshot(snapshot: CatalogSnapshot, session: ScanSessionSnapshot): ScanIngestionResult {
  // Guard: never overwrite a completed/interrupted session with a lower-priority terminal status.
  // Prevents a late "cancelled" event from erasing scan results that already finished cleanly.
  const existingSession = snapshot.scanSessions.find((s) => s.scanId === session.scanId);
  if (existingSession && isDowngrade(existingSession.status, session.status)) {
    const existingScan = snapshot.scans.find((s) => s.id === session.scanId);
    const existingDrive = existingScan
      ? snapshot.drives.find((d) => d.id === existingScan.driveId) ?? snapshot.drives[0] ?? null
      : snapshot.drives[0] ?? null;
    if (existingScan && existingDrive) {
      return { snapshot: clone(snapshot), drive: existingDrive, scan: existingScan, session: existingSession };
    }
    // Fall through to re-ingest when the prior scan/drive record is missing.
  }

  const nextSnapshot = clone(snapshot);
  const previousDuplicateIds = new Set(
    snapshot.projects.filter((project) => project.duplicateStatus === "duplicate").map((project) => project.id)
  );
  const summary = createEmptyScanSummary();
  const { drive: observedDrive, nextDrives } = upsertObservedDrive(nextSnapshot.drives, session);
  nextSnapshot.drives = nextDrives;
  const observedProjectIds = new Set<string>();

  for (const record of session.projects) {
    const { project: reconciledProject, nextProjects, isNew } = reconcileObservedProject(nextSnapshot.projects, observedDrive, session, record);
    nextSnapshot.projects = nextProjects;
    observedProjectIds.add(reconciledProject.id);
    nextSnapshot.projectScanEvents = upsertById(nextSnapshot.projectScanEvents, buildProjectScanEvent(reconciledProject.id, session, record));
    if (isNew) {
      summary.newProjectsCount += 1;
    } else {
      summary.updatedProjectsCount += 1;
    }
  }

  if (session.status === "completed") {
    nextSnapshot.projects = markMissingProjects(
      nextSnapshot.projects,
      observedDrive.id,
      observedProjectIds,
      session.finishedAt ?? session.startedAt,
      summary
    );
  }

  const scanRecord = buildScanRecord(session, observedDrive.id);
  nextSnapshot.scans = upsertById(nextSnapshot.scans, scanRecord);
  nextSnapshot.projects = applyDerivedProjectStates(nextSnapshot.projects);
  summary.duplicatesFlaggedCount = nextSnapshot.projects.filter(
    (project) => project.duplicateStatus === "duplicate" && !previousDuplicateIds.has(project.id)
  ).length;
  summary.durationMs = getScanDurationMs(session);

  const enrichedSession: ScanSessionSnapshot = {
    ...session,
    requestedDriveId: session.requestedDriveId ?? null,
    requestedDriveName: session.requestedDriveName ?? observedDrive.displayName,
    summary,
    createdAt: session.createdAt,
    updatedAt: session.finishedAt ?? session.updatedAt ?? session.startedAt
  };
  nextSnapshot.scanSessions = upsertByScanId(nextSnapshot.scanSessions, enrichedSession);

  return {
    snapshot: nextSnapshot,
    drive: observedDrive,
    scan: scanRecord,
    session: enrichedSession
  };
}

function upsertObservedDrive(drives: Drive[], session: ScanSessionSnapshot): { drive: Drive; nextDrives: Drive[] } {
  const existingDrive =
    (session.requestedDriveId
      ? drives.find((drive) => drive.id === session.requestedDriveId)
      : null) ??
    drives.find((drive) => drive.volumeName === session.driveName || drive.displayName === session.driveName);
  const timestamp = session.finishedAt ?? session.startedAt;

  const drive: Drive = existingDrive
    ? {
        ...existingDrive,
        volumeName: session.driveName,
        displayName: existingDrive.displayName || session.driveName,
        lastScannedAt: timestamp,
        updatedAt: timestamp
      }
    : {
        id: `drive-${slugify(session.driveName)}`,
        volumeName: session.driveName,
        displayName: session.driveName,
        totalCapacityBytes: null,
        usedBytes: null,
        freeBytes: null,
        reservedIncomingBytes: 0,
        lastScannedAt: timestamp,
        createdManually: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };

  return { drive, nextDrives: upsertById(drives, drive) };
}

function reconcileObservedProject(
  projects: Project[],
  drive: Drive,
  session: ScanSessionSnapshot,
  record: ScanSessionSnapshot["projects"][number]
): { project: Project; nextProjects: Project[]; isNew: boolean } {
  const matchedProject =
    findProjectOnDrive(projects, drive.id, record) ??
    findManualUnassignedProject(projects, record);

  const timestamp = record.scanTimestamp || session.finishedAt || session.startedAt;
  const project: Project = matchedProject
    ? {
        ...matchedProject,
        // Refresh filesystem-derived fields on every rescan so that renames or
        // path changes are reflected in the catalog immediately. folderName and
        // folderPath are the on-disk truth; they must not be left stale from
        // the first time the project was discovered.
        folderName: record.folderName,
        folderPath: record.folderPath,
        parsedDate: record.parsedDate,
        parsedClient: record.parsedClient,
        parsedProject: record.parsedProject,
        sizeBytes: record.sizeBytes,
        sizeStatus: record.sizeStatus,
        currentDriveId: drive.id,
        isUnassigned: false,
        missingStatus: "normal",
        lastSeenAt: timestamp,
        lastScannedAt: timestamp,
        updatedAt: timestamp
      }
    : {
        id: `project-${slugify(record.parsedDate ?? record.folderName)}-${slugify(record.parsedClient ?? "")}-${slugify(record.parsedProject ?? "")}-${slugify(drive.id)}`,
        folderType: record.folderType ?? "client",
        isStandardized: (record.folderType ?? "client") !== "personal_folder",
        folderName: record.folderName,
        folderPath: record.folderPath,
        parsedDate: record.parsedDate,
        parsedClient: record.parsedClient,
        parsedProject: record.parsedProject,
        correctedDate: null,
        correctedClient: null,
        correctedProject: null,
        category: null,
        sizeBytes: record.sizeBytes,
        sizeStatus: record.sizeStatus,
        currentDriveId: drive.id,
        targetDriveId: null,
        moveStatus: "none",
        missingStatus: "normal",
        duplicateStatus: "normal",
        isUnassigned: false,
        isManual: false,
        lastSeenAt: timestamp,
        lastScannedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      };

  return {
    project,
    nextProjects: upsertById(projects, project),
    isNew: !matchedProject
  };
}

function markMissingProjects(
  projects: Project[],
  driveId: string,
  observedProjectIds: Set<string>,
  missingTimestamp: string,
  summary: ScanIngestionSummary
) {
  return projects.map((project): Project => {
    if (project.currentDriveId !== driveId) {
      return project;
    }
    if (observedProjectIds.has(project.id)) {
      return project;
    }

    summary.missingProjectsCount += 1;
    return {
      ...project,
      missingStatus: "missing",
      updatedAt: missingTimestamp,
      lastScannedAt: missingTimestamp
    };
  });
}

function buildScanRecord(session: ScanSessionSnapshot, driveId: string): ScanRecord {
  return {
    id: session.scanId,
    driveId,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    status: session.status,
    foldersScanned: session.foldersScanned,
    matchesFound: session.matchesFound,
    notes: session.error,
    createdAt: session.createdAt,
    updatedAt: session.finishedAt ?? session.updatedAt ?? session.startedAt
  };
}

function buildProjectScanEvent(
  projectId: string,
  session: ScanSessionSnapshot,
  record: ScanSessionSnapshot["projects"][number]
): ProjectScanEvent {
  return {
    id: `event-${session.scanId}-${record.id}`,
    projectId,
    scanId: session.scanId,
    observedFolderName: record.folderName,
    observedDriveName: record.sourceDriveName,
    observedFolderType: record.folderType,
    observedAt: record.scanTimestamp,
    createdAt: record.scanTimestamp,
    updatedAt: record.scanTimestamp
  };
}

function matchesScanRecord(project: Project, record: ScanSessionSnapshot["projects"][number]) {
  if (record.folderType === "personal_folder") {
    return project.folderName === record.folderName;
  }
  return (
    project.parsedDate === record.parsedDate &&
    project.parsedClient === record.parsedClient &&
    project.parsedProject === record.parsedProject
  );
}

function findProjectOnDrive(projects: Project[], driveId: string, record: ScanSessionSnapshot["projects"][number]) {
  return projects.find((project) => matchesScanRecord(project, record) && project.currentDriveId === driveId);
}

function findManualUnassignedProject(projects: Project[], record: ScanSessionSnapshot["projects"][number]) {
  return projects.find(
    (project) => project.isManual && project.currentDriveId === null && matchesScanRecord(project, record)
  );
}

function upsertById<T extends { id: string }>(items: T[], input: T) {
  const index = items.findIndex((item) => item.id === input.id);
  if (index === -1) {
    return [...items, input];
  }

  const next = clone(items);
  next[index] = input;
  return next;
}

function upsertByScanId<T extends { scanId: string }>(items: T[], input: T) {
  const index = items.findIndex((item) => item.scanId === input.scanId);
  if (index === -1) {
    return [...items, input];
  }

  const next = clone(items);
  next[index] = input;
  return next;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getScanDurationMs(session: ScanSessionSnapshot) {
  if (!session.finishedAt) {
    return null;
  }

  const duration = Date.parse(session.finishedAt) - Date.parse(session.startedAt);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}
