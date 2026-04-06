import { getDefaultSyncState, type SyncAdapter, type SyncOperation, type SyncRecoveryResult, type SyncResult, type SyncState } from "./sync";
import { compactSyncQueue, getSyncStateForQueue, listDispatchableSyncOperations, normalizeSyncOperation } from "./syncQueue";

const clone = <T>(value: T): T => structuredClone(value);

export class InMemorySyncAdapter implements SyncAdapter {
  #pending: SyncOperation[] = [];
  #state: SyncState = getDefaultSyncState();

  async enqueue(operation: SyncOperation): Promise<void> {
    this.#pending = compactSyncQueue(this.#pending, operation);
    this.#state = getSyncStateForQueue({
      queue: this.#pending,
      remoteEnabled: false,
      previous: this.#state
    });
  }

  async listPending(): Promise<SyncOperation[]> {
    return clone(listDispatchableSyncOperations(this.#pending));
  }

  async listQueue(): Promise<SyncOperation[]> {
    return clone(this.#pending.map(normalizeSyncOperation));
  }

  async flush(): Promise<SyncResult> {
    const pushed = listDispatchableSyncOperations(this.#pending).length;
    this.#pending = [];
    this.#state = {
      ...getSyncStateForQueue({
        queue: this.#pending,
        remoteEnabled: false,
        previous: this.#state
      }),
      lastPushAt: pushed > 0 ? new Date().toISOString() : this.#state.lastPushAt
    };

    return {
      pushed,
      pending: 0
    };
  }

  async pull() {
    this.#state = getSyncStateForQueue({
      queue: this.#pending,
      remoteEnabled: false,
      previous: this.#state
    });
    return {
      changes: [],
      remoteCursor: this.#state.remoteCursor
    };
  }

  async getState(): Promise<SyncState> {
    return clone(
      getSyncStateForQueue({
        queue: this.#pending,
        remoteEnabled: false,
        previous: this.#state
      })
    );
  }

  async recoverInterruptedState(): Promise<SyncRecoveryResult> {
    this.#state = getSyncStateForQueue({
      queue: this.#pending,
      remoteEnabled: false,
      previous: this.#state
    });

    return {
      recoveredCount: 0,
      state: clone(this.#state)
    };
  }
}
