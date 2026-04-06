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

export function ingestScanSessionSnapshot(snapshot: CatalogSnapshot, session: ScanSessionSnapshot): ScanIngestionResult {
  const nextSnapshot = clone(snapshot);
  const previousDuplicateIds = new Set(
    snapshot.projects.filter((project) => project.duplicateStatus === "duplicate").map((project) => project.id)
  );
  const summary = createEmptyScanSummary();
  const observedDrive = upsertObservedDrive(nextSnapshot.drives, session);
  const observedProjectIds = new Set<string>();

  for (const record of session.projects) {
    const { project: reconciledProject, isNew } = reconcileObservedProject(nextSnapshot.projects, observedDrive, session, record);
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

function upsertObservedDrive(drives: Drive[], session: ScanSessionSnapshot) {
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

  const nextDrives = upsertById(drives, drive);
  drives.splice(0, drives.length, ...nextDrives);

  return drive;
}

function reconcileObservedProject(
  projects: Project[],
  drive: Drive,
  session: ScanSessionSnapshot,
  record: ScanSessionSnapshot["projects"][number]
) {
  const matchedProject =
    findProjectOnDrive(projects, drive.id, record) ??
    findManualUnassignedProject(projects, record);

  const timestamp = record.scanTimestamp || session.finishedAt || session.startedAt;
  const project: Project = matchedProject
    ? {
        ...matchedProject,
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
        id: `project-${slugify(record.parsedDate)}-${slugify(record.parsedClient)}-${slugify(record.parsedProject)}-${slugify(drive.id)}`,
        parsedDate: record.parsedDate,
        parsedClient: record.parsedClient,
        parsedProject: record.parsedProject,
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

  const nextProjects = upsertById(projects, project);
  projects.splice(0, projects.length, ...nextProjects);

  return {
    project,
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
    observedAt: record.scanTimestamp,
    createdAt: record.scanTimestamp,
    updatedAt: record.scanTimestamp
  };
}

function findProjectOnDrive(projects: Project[], driveId: string, record: ScanSessionSnapshot["projects"][number]) {
  return projects.find(
    (project) =>
      project.parsedDate === record.parsedDate &&
      project.parsedClient === record.parsedClient &&
      project.parsedProject === record.parsedProject &&
      project.currentDriveId === driveId
  );
}

function findManualUnassignedProject(projects: Project[], record: ScanSessionSnapshot["projects"][number]) {
  return projects.find(
    (project) =>
      project.isManual &&
      project.currentDriveId === null &&
      project.parsedDate === record.parsedDate &&
      project.parsedClient === record.parsedClient &&
      project.parsedProject === record.parsedProject
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
