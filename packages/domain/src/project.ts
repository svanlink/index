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

  // ── Schema migration 9 fields (optional — absent on rows created before the migration) ──

  /**
   * The canonical new-standard form of the folder name, computed by the
   * classifier at ingest time. Null for personal_folder and legacy
   * personal_project entries where the [P] form cannot be reconstructed.
   * Added in schema migration 9.
   */
  normalizedName?: string | null;

  /**
   * Confidence in the folder name classification.
   * - `"high"`   — new-standard 4-part convention
   * - `"medium"` — legacy 3-part convention
   * - `"low"`    — personal_folder fallback
   * Added in schema migration 9.
   */
  namingConfidence?: "high" | "medium" | "low" | null;

  /**
   * Lifecycle state for sidecar metadata (EXIF, XMP, etc.).
   * - `"pending"`    — not yet attempted
   * - `"complete"`   — metadata extracted successfully
   * - `"error"`      — extraction attempted but failed
   * Added in schema migration 9.
   */
  metadataStatus?: "pending" | "complete" | "error" | null;

  /**
   * Partial content hash (first N bytes) used for duplicate-candidate detection.
   * Null until an `"index_with_hash"` scan pass has been run on this project.
   * Added in schema migration 9.
   */
  partialHash?: string | null;

  // ── Schema migration 10 fields (optional — absent on rows created before the migration) ──

  /**
   * Human-readable naming status.
   * - `"valid"`   — matches the official `YYYY-MM-DD_Client - Project` convention
   * - `"legacy"`  — matches the old `YYMMDD_Client_Project` / `YYMMDD_Internal_Project` convention
   * - `"invalid"` — does not match any structured convention (personal_folder fallback)
   * - `"unknown"` — pre-migration row with NULL naming_status (only from DB reads)
   * Added in schema migration 10.
   */
  namingStatus?: "valid" | "legacy" | "invalid" | "unknown" | null;
  /**
   * ISO-8601 timestamp of the last time the user visited the project detail page.
   * NULL on rows that predate migration 13 or were never visited.
   * Added in schema migration 13.
   */
  openedAt?: string | null;
}
