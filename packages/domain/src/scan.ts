import type { ScanStatus } from "./enums";

export interface ScanRecord {
  id: string;
  driveId: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: ScanStatus;
  foldersScanned: number;
  matchesFound: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectScanEvent {
  id: string;
  projectId: string;
  scanId: string;
  observedFolderName: string;
  observedDriveName: string;
  observedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScanProjectRecord {
  id: string;
  folderName: string;
  folderPath: string;
  relativePath: string;
  parsedDate: string;
  parsedClient: string;
  parsedProject: string;
  sourceDriveName: string;
  scanTimestamp: string;
  sizeStatus: "unknown" | "pending" | "ready" | "failed";
  sizeBytes: number | null;
  sizeError: string | null;
}

export interface ScanSessionSnapshot {
  scanId: string;
  rootPath: string;
  driveName: string;
  status: ScanStatus;
  startedAt: string;
  finishedAt: string | null;
  foldersScanned: number;
  matchesFound: number;
  error: string | null;
  sizeJobsPending: number;
  projects: ScanProjectRecord[];
  requestedDriveId?: string | null;
  requestedDriveName?: string | null;
  summary?: ScanIngestionSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScanStartRequest {
  rootPath: string;
}

export interface ScanStartResponse {
  scanId: string;
  status: ScanStatus | "running";
}

export interface ScanIngestionSummary {
  newProjectsCount: number;
  updatedProjectsCount: number;
  missingProjectsCount: number;
  duplicatesFlaggedCount: number;
  durationMs: number | null;
}

export interface ScanSummary {
  id: string;
  driveId: string | null;
  driveName: string;
  lastScannedAt: string | null;
  projectCount: number;
  totalCapacityBytes: number | null;
  freeBytes: number | null;
  reservedIncomingBytes: number;
}

export interface DriveCapacitySnapshot {
  reservedIncomingBytes: number;
  remainingFreeBytes: number | null;
  hasUnknownIncoming: boolean;
}
