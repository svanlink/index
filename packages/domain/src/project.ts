import type { Category, DuplicateStatus, MissingStatus, MoveStatus, SizeStatus } from "./enums";

export interface Project {
  id: string;
  parsedDate: string;
  parsedClient: string;
  parsedProject: string;
  correctedClient: string | null;
  correctedProject: string | null;
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

