import type { Drive, ScanProjectRecord, ScanSessionSnapshot } from "@drive-project-catalog/domain";
import { createEmptyScanSummary } from "./scanSelectors";

export type ScanHistoryStatusFilter =
  | "all"
  | "completed"
  | "running"
  | "cancelled"
  | "failed"
  | "interrupted";

export interface ScanHistoryFilters {
  status?: ScanHistoryStatusFilter;
  driveId?: string;
}

export interface ScanSessionListItem {
  scanId: string;
  status: ScanSessionSnapshot["status"];
  driveName: string;
  driveId: string | null;
  targetPath: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  foldersScanned: number;
  matchesFound: number;
  newProjectsCount: number;
  updatedProjectsCount: number;
  missingProjectsCount: number;
  duplicatesFlaggedCount: number;
  error: string | null;
}

export interface ScanSessionDetailView extends ScanSessionListItem {
  summaryMessage: string | null;
  projects: ScanProjectRecord[];
}

export function sortScanSessionsNewestFirst(scanSessions: ScanSessionSnapshot[]) {
  return [...scanSessions].sort((left, right) =>
    (right.finishedAt ?? right.startedAt).localeCompare(left.finishedAt ?? left.startedAt)
  );
}

export function filterScanSessions(
  scanSessions: ScanSessionSnapshot[],
  drives: Drive[],
  filters?: ScanHistoryFilters
) {
  const driveId = filters?.driveId ?? "";
  const status = filters?.status ?? "all";

  return sortScanSessionsNewestFirst(scanSessions).filter((session) => {
    if (status !== "all" && session.status !== status) {
      return false;
    }

    if (!driveId) {
      return true;
    }

    return getMappedDriveId(session, drives) === driveId;
  });
}

export function buildScanSessionListItems(scanSessions: ScanSessionSnapshot[], drives: Drive[], filters?: ScanHistoryFilters) {
  return filterScanSessions(scanSessions, drives, filters).map((session) => buildScanSessionListItem(session, drives));
}

export function buildScanSessionListItem(session: ScanSessionSnapshot, drives: Drive[]): ScanSessionListItem {
  const mappedDriveId = getMappedDriveId(session, drives);
  const summary = session.summary ?? createEmptyScanSummary();

  return {
    scanId: session.scanId,
    status: session.status,
    driveName: getMappedDriveName(session, drives),
    driveId: mappedDriveId,
    targetPath: session.rootPath,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    durationMs: summary.durationMs ?? getDurationMs(session),
    foldersScanned: session.foldersScanned,
    matchesFound: session.matchesFound,
    newProjectsCount: summary.newProjectsCount,
    updatedProjectsCount: summary.updatedProjectsCount,
    missingProjectsCount: summary.missingProjectsCount,
    duplicatesFlaggedCount: summary.duplicatesFlaggedCount,
    error: session.error
  };
}

export function buildScanSessionDetailView(
  scanSessions: ScanSessionSnapshot[],
  drives: Drive[],
  scanId: string
): ScanSessionDetailView | null {
  const session = scanSessions.find((entry) => entry.scanId === scanId);

  if (!session) {
    return null;
  }

  return {
    ...buildScanSessionListItem(session, drives),
    summaryMessage: session.error,
    projects: [...session.projects].sort((left, right) => right.scanTimestamp.localeCompare(left.scanTimestamp))
  };
}

export function getMappedDriveName(session: ScanSessionSnapshot, drives: Drive[]) {
  if (session.requestedDriveName) {
    return session.requestedDriveName;
  }

  if (session.requestedDriveId) {
    return drives.find((drive) => drive.id === session.requestedDriveId)?.displayName ?? session.driveName;
  }

  return drives.find((drive) => drive.volumeName === session.driveName || drive.displayName === session.driveName)?.displayName
    ?? session.driveName;
}

export function getMappedDriveId(session: ScanSessionSnapshot, drives: Drive[]) {
  if (session.requestedDriveId) {
    return session.requestedDriveId;
  }

  return drives.find((drive) => drive.volumeName === session.driveName || drive.displayName === session.driveName)?.id ?? null;
}

function getDurationMs(session: ScanSessionSnapshot) {
  if (!session.finishedAt) {
    return null;
  }

  const startedAt = Date.parse(session.startedAt);
  const finishedAt = Date.parse(session.finishedAt);

  if (Number.isNaN(startedAt) || Number.isNaN(finishedAt)) {
    return null;
  }

  return Math.max(0, finishedAt - startedAt);
}
