import type { Category, DuplicateStatus, FolderType, MissingStatus, MoveStatus, SizeStatus } from "./enums";

export interface Project {
  id: string;

  // Classification — set at import time, never mutated by import
  folderType: FolderType;
  isStandardized: boolean;

  // Raw filesystem identity — write-once at import, never transformed
  folderName: string;
  folderPath: string | null;

  // Parsed fields — null for personal_folder entries
  parsedDate: string | null;
  parsedClient: string | null;
  parsedProject: string | null;

  // User corrections — only written through the explicit edit/update flow
  correctedDate: string | null;
  correctedClient: string | null;
  correctedProject: string | null;

  // Media/workflow category — orthogonal to folderType
  category: Category | null;

  sizeBytes: number | null;
  sizeStatus: SizeStatus;
  currentDriveId: string | null;
  targetDriveId: string | null;
  moveStatus: MoveStatus;
  missingStatus: MissingStatus;
  duplicateStatus: DuplicateStatus;
  isUnassigned: boolean;
  isManual: boolean;
  lastSeenAt: string | null;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

