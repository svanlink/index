import type { Drive, ScanIngestionSummary, ScanSessionSnapshot } from "@drive-project-catalog/domain";

export function isTerminalScanStatus(status: ScanSessionSnapshot["status"]) {
  return status === "completed" || status === "cancelled" || status === "failed" || status === "interrupted";
}

export function getMappedDriveId(session: ScanSessionSnapshot, drives: Drive[]) {
  if (session.requestedDriveId) {
    return session.requestedDriveId;
  }

  return (
    drives.find(
      (drive) => drive.volumeName === session.driveName || drive.displayName === session.driveName
    )?.id ?? null
  );
}

export function getActiveScanSession(scanSessions: ScanSessionSnapshot[]) {
  return [...scanSessions]
    .filter((session) => session.status === "running")
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0] ?? null;
}

export function getLatestCompletedScanSession(scanSessions: ScanSessionSnapshot[]) {
  return [...scanSessions]
    .filter((session) => session.status === "completed")
    .sort((left, right) => (right.finishedAt ?? right.startedAt).localeCompare(left.finishedAt ?? left.startedAt))[0] ?? null;
}

export function getLatestTerminalScanSession(scanSessions: ScanSessionSnapshot[]) {
  return [...scanSessions]
    .filter((session) => isTerminalScanStatus(session.status))
    .sort((left, right) => (right.finishedAt ?? right.startedAt).localeCompare(left.finishedAt ?? left.startedAt))[0] ?? null;
}

export function createEmptyScanSummary(): ScanIngestionSummary {
  return {
    newProjectsCount: 0,
    updatedProjectsCount: 0,
    missingProjectsCount: 0,
    duplicatesFlaggedCount: 0,
    durationMs: null
  };
}

export function getScanStatusLabel(session: Pick<ScanSessionSnapshot, "status">) {
  if (session.status === "cancelled") {
    return "Cancelled";
  }
  if (session.status === "failed") {
    return "Failed";
  }
  if (session.status === "interrupted") {
    return "Interrupted";
  }
  if (session.status === "completed") {
    return "Completed";
  }
  return "Running";
}

export function getScanStatusMessage(session: Pick<ScanSessionSnapshot, "status" | "error" | "summary" | "finishedAt" | "startedAt">) {
  if (session.error) {
    return session.error;
  }
  if (session.status === "interrupted") {
    return "This scan session was still marked as running, but no live desktop scan was available after restart.";
  }
  if (session.status === "failed") {
    return "The desktop scan ended with an error before ingestion could complete cleanly.";
  }
  if (session.status === "cancelled") {
    return "The scan was cancelled. Partial observations were preserved, but missing detection was not finalized.";
  }
  if (session.status === "completed" && session.summary?.durationMs !== null) {
    return "The scan completed and its results were fully reconciled into the local catalog.";
  }
  return "Desktop scan session is currently running.";
}
