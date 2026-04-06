export const syncableCatalogEntities = [
  "drive",
  "project",
  "scan",
  "scanSession",
  "projectScanEvent"
] as const;

export type SyncableCatalogEntity = (typeof syncableCatalogEntities)[number];

export const localOnlyCatalogFields = {
  scanSession: ["rootPath"],
  scanSessionProject: ["folderPath"]
} as const;

export const syncOperationTypes = [
  "drive.upsert",
  "project.upsert",
  "scan.upsert",
  "scanSession.upsert",
  "projectScanEvent.upsert"
] as const;

export type SyncOperationType = (typeof syncOperationTypes)[number];
export type SyncChangeKind = "upsert";
export type SyncMutationSource = "manual" | "batch" | "scan" | "system";
export type SyncMode = "local-only" | "remote-ready" | "syncing";
export type SyncConflictPolicy = "updated-at-last-write-wins-local-tie-break";
export type SyncQueueStatus = "pending" | "in-flight" | "failed";

export interface SyncRecordMetadata {
  recordId: string;
  entity: SyncableCatalogEntity;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface SyncOperation<TPayload = unknown> {
  id: string;
  type: SyncOperationType;
  entity: SyncableCatalogEntity;
  recordId: string;
  change: SyncChangeKind;
  occurredAt: string;
  recordUpdatedAt: string;
  payload: TPayload;
  source: SyncMutationSource;
  status: SyncQueueStatus;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
}

export interface SyncState {
  mode: SyncMode;
  pendingCount: number;
  queuedCount: number;
  failedCount: number;
  inFlightCount: number;
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastError: string | null;
  remoteCursor: string | null;
  conflictPolicy: SyncConflictPolicy;
}

export interface SyncPushRequest {
  operations: SyncOperation[];
  conflictPolicy: SyncConflictPolicy;
}

export interface SyncPushResult {
  acceptedOperationIds: string[];
  rejected: Array<{ operationId: string; reason: string }>;
  remoteCursor?: string | null;
}

export interface SyncPullRequest {
  sinceCursor?: string | null;
}

export interface RemoteSyncChange<TPayload = unknown> {
  entity: SyncableCatalogEntity;
  change: SyncChangeKind;
  payload: TPayload;
  remoteUpdatedAt: string;
}

export interface SyncPullResult {
  changes: RemoteSyncChange[];
  remoteCursor: string | null;
}

export interface SyncResult {
  pushed: number;
  pending: number;
}

export interface RemoteSyncAdapter {
  readonly mode: SyncMode;
  pushChanges(request: SyncPushRequest): Promise<SyncPushResult>;
  pullChanges(request: SyncPullRequest): Promise<SyncPullResult>;
}

export interface SyncAdapter {
  enqueue(operation: SyncOperation): Promise<void>;
  listPending(): Promise<SyncOperation[]>;
  listQueue(): Promise<SyncOperation[]>;
  flush(): Promise<SyncResult>;
  getState(): Promise<SyncState>;
}

export function getDefaultSyncState(): SyncState {
  return {
    mode: "local-only",
    pendingCount: 0,
    queuedCount: 0,
    failedCount: 0,
    inFlightCount: 0,
    lastPushAt: null,
    lastPullAt: null,
    lastError: null,
    remoteCursor: null,
    conflictPolicy: "updated-at-last-write-wins-local-tie-break"
  };
}

export function resolveSyncConflictByUpdatedAt(params: {
  localUpdatedAt: string;
  remoteUpdatedAt: string;
}): "keep-local" | "accept-remote" {
  if (params.remoteUpdatedAt > params.localUpdatedAt) {
    return "accept-remote";
  }

  return "keep-local";
}
