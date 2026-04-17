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
  "drive.delete",
  "project.upsert",
  "project.delete",
  "scan.upsert",
  "scanSession.upsert",
  "projectScanEvent.upsert"
] as const;

export type SyncOperationType = (typeof syncOperationTypes)[number];
/**
 * Kind of change the queue entry represents.
 *
 *  - `upsert` — insert-or-update with the full record payload. Idempotent
 *    on the remote via PostgREST `Prefer: resolution=merge-duplicates`.
 *  - `delete` — remove the record by id on the remote. Payload only needs
 *    to carry the primary key (+ recordUpdatedAt for diagnostics); the
 *    Supabase adapter does not read any other field for delete ops.
 *
 * The queue compactor (`findCompactionCandidateIndex` in `syncQueue.ts`)
 * never merges across change kinds, so a pending `upsert` and a later
 * `delete` for the same record remain independent entries. In practice
 * the repository layer calls `SyncAdapter.cancelPendingForRecord` before
 * enqueueing a delete, which removes prior upserts for the same record —
 * so the ordered queue typically ends with a single delete op, not a
 * mixed pair.
 */
export type SyncChangeKind = "upsert" | "delete";
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
  syncInProgress: boolean;
  lastPushAt: string | null;
  lastPullAt: string | null;
  lastError: string | null;
  lastSyncError: string | null;
  remoteCursor: string | null;
  conflictPolicy: SyncConflictPolicy;
}

export interface SyncRecoveryResult {
  recoveredCount: number;
  state: SyncState;
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

export interface SyncCycleResult {
  pushed: number;
  pulled: number;
  pending: number;
  state: SyncState;
}

export type StartupSyncStatus = "skipped" | "completed" | "failed";
export type StartupSyncReason =
  | "disabled"
  | "offline"
  | "not-needed"
  | "recovered-and-ran"
  | "initial-pull"
  | "pending-queue"
  | "existing-run"
  | "failed";

export interface StartupSyncResult {
  status: StartupSyncStatus;
  reason: StartupSyncReason;
  message: string;
  recoveredCount: number;
  cycle: SyncCycleResult | null;
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
  pull(): Promise<SyncPullResult>;
  getState(): Promise<SyncState>;
  recoverInterruptedState(): Promise<SyncRecoveryResult>;
  /**
   * F5 — surgical cancellation of pending / failed queue entries for a given
   * (entity, recordId). In-flight entries MUST be preserved by every
   * implementation — they are already being pushed and cannot be cleanly
   * interrupted.
   *
   * Unlike `flush`, this method must NEVER push to the remote. The queue is
   * mutated locally only. Returns the number of entries cancelled (for
   * telemetry and test assertions). A zero return is a valid "nothing to
   * cancel" outcome and must not throw.
   *
   * Intended caller: `LocalCatalogRepository.runSyncCycle` after an inbound
   * delete is applied, to prevent a stale pending upsert from resurrecting
   * the just-deleted record on the remote on the next cycle.
   */
  cancelPendingForRecord(entity: SyncableCatalogEntity, recordId: string): Promise<number>;
}

export function getDefaultSyncState(): SyncState {
  return {
    mode: "local-only",
    pendingCount: 0,
    queuedCount: 0,
    failedCount: 0,
    inFlightCount: 0,
    syncInProgress: false,
    lastPushAt: null,
    lastPullAt: null,
    lastError: null,
    lastSyncError: null,
    remoteCursor: null,
    conflictPolicy: "updated-at-last-write-wins-local-tie-break"
  };
}

