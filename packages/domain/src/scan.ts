import type { FolderType, ScanStatus, SizeStatus } from "./enums";

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
  observedFolderType: FolderType | null;
  observedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScanProjectRecord {
  id: string;
  folderName: string;
  folderPath: string;
  relativePath: string;
  folderType: FolderType;
  parsedDate: string | null;
  parsedClient: string | null;
  parsedProject: string | null;
  sourceDriveName: string;
  scanTimestamp: string;
  sizeStatus: SizeStatus;
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
  /**
   * Controls how deeply the scan engine processed each top-level folder.
   *
   * - `"index_only"` (default) — top-level folder list only; `sizeStatus` is
   *   `"unknown"` on every project. Fast and safe for the default pass.
   * - `"index_with_size"` — a recursive size walk runs per top-level folder.
   * - `"index_with_hash"` — size walk + partial content hash for duplicate
   *   candidate detection (future).
   * - `"deep_analysis"` — full analysis pass including metadata extraction
   *   (future).
   *
   * Absent on sessions persisted before this field was introduced.
   */
  scanMode?: "index_only" | "index_with_size" | "index_with_hash" | "deep_analysis";
  projects: ScanProjectRecord[];
  requestedDriveId?: string | null;
  requestedDriveName?: string | null;
  summary?: ScanIngestionSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScanStartRequest {
  rootPath: string;
  /** Defaults to `"index_only"` when omitted. */
  scanMode?: "index_only" | "index_with_size" | "index_with_hash" | "deep_analysis";
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
