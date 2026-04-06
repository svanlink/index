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

      const reason = rejectedById.get(operation.id) ?? params.fallbackError ?? null;
      if (!reason) {
        return operation;
      }

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

  return {
    ...previous,
    type: incoming.type,
    occurredAt: previous.occurredAt,
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
