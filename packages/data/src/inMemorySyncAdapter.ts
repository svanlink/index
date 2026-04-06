import { getDefaultSyncState, type SyncAdapter, type SyncOperation, type SyncResult, type SyncState } from "./sync";

const clone = <T>(value: T): T => structuredClone(value);

export class InMemorySyncAdapter implements SyncAdapter {
  #pending: SyncOperation[] = [];
  #state: SyncState = getDefaultSyncState();

  async enqueue(operation: SyncOperation): Promise<void> {
    this.#pending.push(clone(operation));
    this.#state = {
      ...this.#state,
      pendingCount: this.#pending.length
    };
  }

  async listPending(): Promise<SyncOperation[]> {
    return clone(this.#pending);
  }

  async flush(): Promise<SyncResult> {
    const pushed = this.#pending.length;
    this.#pending = [];
    this.#state = {
      ...this.#state,
      pendingCount: 0,
      lastPushAt: pushed > 0 ? new Date().toISOString() : this.#state.lastPushAt
    };

    return {
      pushed,
      pending: 0
    };
  }

  async getState(): Promise<SyncState> {
    return clone({
      ...this.#state,
      pendingCount: this.#pending.length
    });
  }
}
