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
}

