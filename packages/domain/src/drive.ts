export interface Drive {
  id: string;
  volumeName: string;
  displayName: string;
  totalCapacityBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  reservedIncomingBytes: number;
  lastScannedAt: string | null;
  createdManually: boolean;
  createdAt: string;
  updatedAt: string;
  /** macOS volume UUID — stable across remounts. Added in schema migration 8. */
  volumeUuid?: string | null;
  /** Last observed mount path (e.g. `/Volumes/MyDrive`). Added in schema migration 8. */
  mountPath?: string | null;
  /** Filesystem type reported by diskutil (e.g. `"APFS"`, `"ExFAT"`). Added in schema migration 8. */
  filesystem?: string | null;
}

