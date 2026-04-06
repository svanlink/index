import type { StorageLike } from "./storageLocalPersistence";
import {
  getDefaultSyncState,
  type RemoteSyncAdapter,
  type SyncAdapter,
  type SyncOperation,
  type SyncRecoveryResult,
  type SyncResult,
  type SyncState
} from "./sync";
import {
  compactSyncQueue,
  getSyncStateForQueue,
  listDispatchableSyncOperations,
  markSyncOperationsInFlight,
  normalizeSyncOperation,
  settleSyncQueue
} from "./syncQueue";

const clone = <T>(value: T): T => structuredClone(value);

interface PersistedSyncEnvelope {
  version: number;
  queue: SyncOperation[];
  state: SyncState;
}

interface StorageSyncAdapterOptions {
  storage: StorageLike;
  storageKey: string;
  remote?: RemoteSyncAdapter | null;
}

const STORAGE_VERSION = 1;
const interruptedSyncMessage = "A previous sync attempt was interrupted before completion. Retry sync to continue.";

export class StorageSyncAdapter implements SyncAdapter {
  readonly #storage: StorageLike;
  readonly #storageKey: string;
  readonly #remote: RemoteSyncAdapter | null;

  constructor(options: StorageSyncAdapterOptions) {
    this.#storage = options.storage;
    this.#storageKey = options.storageKey;
    this.#remote = options.remote ?? null;
  }

  async enqueue(operation: SyncOperation): Promise<void> {
    const envelope = this.#readEnvelope();
    envelope.queue = compactSyncQueue(envelope.queue, operation);
    envelope.state = getSyncStateForQueue({
      queue: envelope.queue,
      remoteEnabled: Boolean(this.#remote),
      previous: envelope.state
    });
    this.#writeEnvelope(envelope);
  }

  async listPending(): Promise<SyncOperation[]> {
    return clone(listDispatchableSyncOperations(this.#readEnvelope().queue));
  }

  async listQueue(): Promise<SyncOperation[]> {
    return clone(this.#readEnvelope().queue.map(normalizeSyncOperation));
  }

  async flush(): Promise<SyncResult> {
    const envelope = this.#readEnvelope();
    const dispatchable = listDispatchableSyncOperations(envelope.queue);

    if (!this.#remote || dispatchable.length === 0) {
      envelope.state = getSyncStateForQueue({
        queue: envelope.queue,
        remoteEnabled: Boolean(this.#remote),
        previous: envelope.state
      });
      this.#writeEnvelope(envelope);
      return { pushed: 0, pending: dispatchable.length };
    }

    const attemptedAt = new Date().toISOString();
    envelope.queue = markSyncOperationsInFlight(
      envelope.queue,
      dispatchable.map((operation) => operation.id),
      attemptedAt
    );
    envelope.state = getSyncStateForQueue({
      queue: envelope.queue,
      remoteEnabled: true,
      mode: "syncing",
      previous: {
        ...envelope.state,
        lastError: null,
        lastSyncError: null
      }
    });
    this.#writeEnvelope(envelope);

    try {
      const inFlight = envelope.queue.filter((operation) => operation.status === "in-flight");
      const pushResult = await this.#remote.pushChanges({
        operations: inFlight,
        conflictPolicy: envelope.state.conflictPolicy
      });

      envelope.queue = settleSyncQueue({
        queue: envelope.queue,
        acceptedOperationIds: pushResult.acceptedOperationIds,
        rejected: pushResult.rejected,
        fallbackError: "Remote transport did not acknowledge the queued change."
      });
      envelope.state = getSyncStateForQueue({
        queue: envelope.queue,
        remoteEnabled: true,
        previous: {
          ...envelope.state,
          mode: "remote-ready",
          lastPushAt: attemptedAt,
          lastError: pushResult.rejected[0]?.reason ?? null,
          lastSyncError: pushResult.rejected[0]?.reason ?? null,
          remoteCursor: pushResult.remoteCursor ?? envelope.state.remoteCursor
        }
      });
      this.#writeEnvelope(envelope);

      return {
        pushed: pushResult.acceptedOperationIds.length,
        pending: listDispatchableSyncOperations(envelope.queue).length
      };
    } catch (error) {
      envelope.queue = settleSyncQueue({
        queue: envelope.queue,
        acceptedOperationIds: [],
        rejected: [],
        fallbackError: error instanceof Error ? error.message : "Remote sync failed."
      });
      envelope.state = getSyncStateForQueue({
        queue: envelope.queue,
        remoteEnabled: true,
        previous: {
          ...envelope.state,
          mode: "remote-ready",
          lastError: error instanceof Error ? error.message : "Remote sync failed.",
          lastSyncError: error instanceof Error ? error.message : "Remote sync failed."
        }
      });
      this.#writeEnvelope(envelope);
      return {
        pushed: 0,
        pending: listDispatchableSyncOperations(envelope.queue).length
      };
    }
  }

  async getState(): Promise<SyncState> {
    const envelope = this.#readEnvelope();
    envelope.state = getSyncStateForQueue({
      queue: envelope.queue,
      remoteEnabled: Boolean(this.#remote),
      previous: envelope.state
    });
    this.#writeEnvelope(envelope);
    return clone(envelope.state);
  }

  async recoverInterruptedState(): Promise<SyncRecoveryResult> {
    const envelope = this.#readEnvelope();
    const recoveredCount = envelope.queue.filter((operation) => operation.status === "in-flight").length;

    if (recoveredCount > 0) {
      envelope.queue = envelope.queue.map((operation) =>
        operation.status === "in-flight"
          ? {
              ...operation,
              status: "failed",
              lastError: operation.lastError ?? interruptedSyncMessage
            }
          : operation
      );
    }

    envelope.state = getSyncStateForQueue({
      queue: envelope.queue,
      remoteEnabled: Boolean(this.#remote),
      previous: {
        ...envelope.state,
        mode: this.#remote ? "remote-ready" : "local-only",
        lastError: recoveredCount > 0 ? interruptedSyncMessage : envelope.state.lastError,
        lastSyncError: recoveredCount > 0 ? interruptedSyncMessage : envelope.state.lastSyncError
      }
    });
    this.#writeEnvelope(envelope);

    return {
      recoveredCount,
      state: clone(envelope.state)
    };
  }

  async pull() {
    const envelope = this.#readEnvelope();
    if (!this.#remote) {
      envelope.state = getSyncStateForQueue({
        queue: envelope.queue,
        remoteEnabled: false,
        previous: envelope.state
      });
      this.#writeEnvelope(envelope);
      return {
        changes: [],
        remoteCursor: envelope.state.remoteCursor
      };
    }

    envelope.state = getSyncStateForQueue({
      queue: envelope.queue,
      remoteEnabled: true,
      mode: "syncing",
      previous: {
        ...envelope.state,
        lastError: null,
        lastSyncError: null
      }
    });
    this.#writeEnvelope(envelope);

    try {
      const result = await this.#remote.pullChanges({
        sinceCursor: envelope.state.remoteCursor
      });
      envelope.state = getSyncStateForQueue({
        queue: envelope.queue,
        remoteEnabled: true,
        mode: "remote-ready",
        previous: {
          ...envelope.state,
          lastPullAt: new Date().toISOString(),
          lastError: null,
          lastSyncError: null,
          remoteCursor: result.remoteCursor ?? envelope.state.remoteCursor
        }
      });
      this.#writeEnvelope(envelope);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Remote sync pull failed.";
      envelope.state = getSyncStateForQueue({
        queue: envelope.queue,
        remoteEnabled: true,
        mode: "remote-ready",
        previous: {
          ...envelope.state,
          lastError: message,
          lastSyncError: message
        }
      });
      this.#writeEnvelope(envelope);
      throw error;
    }
  }

  #readEnvelope(): PersistedSyncEnvelope {
    const serialized = this.#storage.getItem(this.#storageKey);
    if (!serialized) {
      return this.#createInitialEnvelope();
    }

    try {
      const parsed = JSON.parse(serialized) as Partial<PersistedSyncEnvelope>;
      return {
        version: STORAGE_VERSION,
        queue: clone(parsed.queue ?? []).map(normalizeSyncOperation),
        state: getSyncStateForQueue({
          queue: clone(parsed.queue ?? []).map(normalizeSyncOperation),
          remoteEnabled: Boolean(this.#remote),
          previous: {
            ...getDefaultSyncState(),
            ...(parsed.state ?? {})
          }
        })
      };
    } catch {
      return this.#createInitialEnvelope();
    }
  }

  #writeEnvelope(envelope: PersistedSyncEnvelope) {
    this.#storage.setItem(this.#storageKey, JSON.stringify(envelope));
  }

  #createInitialEnvelope(): PersistedSyncEnvelope {
    return {
      version: STORAGE_VERSION,
      queue: [],
      state: {
        ...getDefaultSyncState(),
        mode: this.#remote ? "remote-ready" : "local-only"
      }
    };
  }
}
