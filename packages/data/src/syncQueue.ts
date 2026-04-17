import {
  getDefaultSyncState,
  type SyncOperation,
  type SyncQueueStatus,
  type SyncState
} from "./sync";

const dispatchableStatuses: SyncQueueStatus[] = ["pending", "failed"];

export function normalizeSyncOperation(operation: SyncOperation): SyncOperation {
  return {
    ...operation,
    status: operation.status ?? "pending",
    attempts: operation.attempts ?? 0,
    lastAttemptAt: operation.lastAttemptAt ?? null,
    lastError: operation.lastError ?? null
  };
}

export function listDispatchableSyncOperations(queue: SyncOperation[]): SyncOperation[] {
  return clone(queue)
    .map(normalizeSyncOperation)
    .filter((operation) => dispatchableStatuses.includes(operation.status))
    .sort(compareByOccurredAt);
}

export function compactSyncQueue(queue: SyncOperation[], incoming: SyncOperation): SyncOperation[] {
  const normalizedQueue = clone(queue).map(normalizeSyncOperation);
  const normalizedIncoming = normalizeSyncOperation({
    ...incoming,
    status: "pending",
    attempts: 0,
    lastAttemptAt: null,
    lastError: null
  });

  const candidateIndex = findCompactionCandidateIndex(normalizedQueue, normalizedIncoming);
  if (candidateIndex === -1) {
    return [...normalizedQueue, normalizedIncoming];
  }

  const candidate = normalizedQueue[candidateIndex]!;
  normalizedQueue[candidateIndex] = mergeSyncOperations(candidate, normalizedIncoming);
  return normalizedQueue;
}

export function getSyncStateForQueue(params: {
  queue: SyncOperation[];
  remoteEnabled: boolean;
  mode?: SyncState["mode"];
  previous?: SyncState;
}): SyncState {
  const queue = params.queue.map(normalizeSyncOperation);
  const pendingCount = queue.filter((operation) => operation.status === "pending").length;
  const failedCount = queue.filter((operation) => operation.status === "failed").length;
  const inFlightCount = queue.filter((operation) => operation.status === "in-flight").length;
  const mode = params.mode ?? (params.remoteEnabled ? "remote-ready" : "local-only");

  return {
    ...(params.previous ?? getDefaultSyncState()),
    mode,
    pendingCount,
    queuedCount: queue.length,
    failedCount,
    inFlightCount,
    syncInProgress: mode === "syncing"
  };
}

export function markSyncOperationsInFlight(
  queue: SyncOperation[],
  operationIds: string[],
  attemptedAt: string
): SyncOperation[] {
  const targetIds = new Set(operationIds);
  return queue.map((operation) => {
    const normalized = normalizeSyncOperation(operation);
    if (!targetIds.has(normalized.id)) {
      return normalized;
    }

    return {
      ...normalized,
      status: "in-flight",
      attempts: normalized.attempts + 1,
      lastAttemptAt: attemptedAt,
      lastError: null
    };
  });
}

/**
 * Reconcile any stranded in-flight sync operations by flipping them to `failed`.
 *
 * This is the mid-run recovery counterpart to `recoverInterruptedState` (which is
 * designed to run at boot). Any caller that observes a queue containing in-flight
 * rows — outside of a currently-running flush cycle — is looking at orphaned state
 * from a prior interrupted push. This helper rewrites those rows to `failed` so
 * the next `listDispatchableSyncOperations` call will retry them.
 *
 * The fallbackError message is only applied to operations that do not already
 * carry a lastError (e.g. from a previous settled rejection); an existing error
 * is preserved so diagnostic context is not lost.
 */
export function reconcileInFlightSyncOperations(
  queue: SyncOperation[],
  fallbackError: string
): { queue: SyncOperation[]; recoveredCount: number } {
  let recoveredCount = 0;
  const nextQueue = queue.map((operation) => {
    const normalized = normalizeSyncOperation(operation);
    if (normalized.status !== "in-flight") {
      return normalized;
    }
    recoveredCount += 1;
    return {
      ...normalized,
      status: "failed" as const,
      lastError: normalized.lastError ?? fallbackError
    };
  });
  return { queue: nextQueue, recoveredCount };
}

/**
 * Surgically remove pending / failed queue entries matching
 * (entity, recordId). In-flight entries are preserved — a push is already
 * underway for them and we have no way to unsend it.
 *
 * This is the primitive that `SyncAdapter.cancelPendingForRecord` implementations
 * wrap. It is a pure local filter and never touches the remote.
 *
 * That purity is load-bearing:
 *
 *  - Inbound-delete coordination (F5 / Pass 3): when the merge applies a
 *    remote delete for a record that still has a pending outbound upsert
 *    locally, cancelling through any push-first path would re-send the
 *    upsert and resurrect the record on the remote — the exact echo loop
 *    Pass 3 exists to prevent.
 *  - Outbound delete (F8 / Pass 5): `deleteDrive` / `deleteProject` now
 *    call `cancelPendingForRecord` directly for both the parent and its
 *    cascaded children. The previous flush-based helper pushed unrelated
 *    queue entries to the remote as a side-effect of every delete and
 *    erased retry/error state by re-enqueueing survivors; this pure
 *    filter avoids both failure modes.
 */
export function cancelPendingSyncOperationsForRecord(
  queue: SyncOperation[],
  entity: SyncOperation["entity"],
  recordId: string
): { queue: SyncOperation[]; cancelledCount: number } {
  let cancelledCount = 0;
  const nextQueue: SyncOperation[] = [];
  for (const operation of queue) {
    const normalized = normalizeSyncOperation(operation);
    if (
      normalized.entity === entity &&
      normalized.recordId === recordId &&
      normalized.status !== "in-flight"
    ) {
      cancelledCount += 1;
      continue;
    }
    nextQueue.push(normalized);
  }
  return { queue: nextQueue, cancelledCount };
}

export function settleSyncQueue(params: {
  queue: SyncOperation[];
  acceptedOperationIds: string[];
  rejected: Array<{ operationId: string; reason: string }>;
  fallbackError?: string | null;
}): SyncOperation[] {
  const accepted = new Set(params.acceptedOperationIds);
  const rejectedById = new Map(params.rejected.map((entry) => [entry.operationId, entry.reason]));

  return params.queue
    .map(normalizeSyncOperation)
    .filter((operation) => !accepted.has(operation.id))
    .map((operation) => {
      if (operation.status !== "in-flight") {
        return operation;
      }

      const reason = rejectedById.get(operation.id) ?? params.fallbackError ?? "Unacknowledged in-flight operation";

      return {
        ...operation,
        status: "failed",
        lastError: reason
      };
    });
}

function findCompactionCandidateIndex(queue: SyncOperation[], incoming: SyncOperation) {
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const operation = queue[index]!;
    if (
      operation.entity === incoming.entity &&
      operation.recordId === incoming.recordId &&
      operation.change === incoming.change &&
      operation.status !== "in-flight"
    ) {
      return index;
    }
  }

  return -1;
}

function mergeSyncOperations(previous: SyncOperation, incoming: SyncOperation): SyncOperation {
  const takeIncoming = shouldPreferIncoming(previous, incoming);

  // `occurredAt` tracks when the merged operation was most recently mutated
  // from the caller's perspective, so we keep the later of the two stamps.
  // The operation id and enqueue-order position are preserved from `previous`
  // (see the spread) — only the wall-clock marker advances. Listing/ordering
  // via `listDispatchableSyncOperations` uses `occurredAt`, so carrying the
  // older stamp would make a just-edited record appear to have stale activity.
  const occurredAt =
    incoming.occurredAt > previous.occurredAt ? incoming.occurredAt : previous.occurredAt;

  return {
    ...previous,
    type: incoming.type,
    occurredAt,
    recordUpdatedAt: takeIncoming ? incoming.recordUpdatedAt : previous.recordUpdatedAt,
    payload: takeIncoming ? incoming.payload : previous.payload,
    source: takeIncoming ? incoming.source : previous.source,
    status: "pending",
    attempts: 0,
    lastAttemptAt: null,
    lastError: null
  };
}

function shouldPreferIncoming(previous: SyncOperation, incoming: SyncOperation) {
  if (incoming.recordUpdatedAt !== previous.recordUpdatedAt) {
    return incoming.recordUpdatedAt > previous.recordUpdatedAt;
  }

  return incoming.occurredAt >= previous.occurredAt;
}

function compareByOccurredAt(left: SyncOperation, right: SyncOperation) {
  const occurredComparison = left.occurredAt.localeCompare(right.occurredAt);
  if (occurredComparison !== 0) {
    return occurredComparison;
  }

  return left.id.localeCompare(right.id);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
