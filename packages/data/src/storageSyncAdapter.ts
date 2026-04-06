import type { StorageLike } from "./storageLocalPersistence";
import {
  getDefaultSyncState,
  type RemoteSyncAdapter,
  type SyncAdapter,
  type SyncOperation,
  type SyncResult,
  type SyncState
} from "./sync";

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
    envelope.queue.push(clone(operation));
    envelope.state.pendingCount = envelope.queue.length;
    envelope.state.mode = this.#remote ? "remote-ready" : "local-only";
    this.#writeEnvelope(envelope);
  }

  async listPending(): Promise<SyncOperation[]> {
    return clone(this.#readEnvelope().queue);
  }

  async flush(): Promise<SyncResult> {
    const envelope = this.#readEnvelope();
    if (!this.#remote || envelope.queue.length === 0) {
      envelope.state.pendingCount = envelope.queue.length;
      envelope.state.mode = this.#remote ? "remote-ready" : "local-only";
      this.#writeEnvelope(envelope);
      return { pushed: 0, pending: envelope.queue.length };
    }

    const pushResult = await this.#remote.pushChanges({
      operations: envelope.queue,
      conflictPolicy: envelope.state.conflictPolicy
    });
    const accepted = new Set(pushResult.acceptedOperationIds);
    envelope.queue = envelope.queue.filter((operation) => !accepted.has(operation.id));
    envelope.state.pendingCount = envelope.queue.length;
    envelope.state.mode = "remote-ready";
    envelope.state.lastPushAt = new Date().toISOString();
    envelope.state.lastError = pushResult.rejected[0]?.reason ?? null;
    envelope.state.remoteCursor = pushResult.remoteCursor ?? envelope.state.remoteCursor;
    this.#writeEnvelope(envelope);

    return {
      pushed: pushResult.acceptedOperationIds.length,
      pending: envelope.queue.length
    };
  }

  async getState(): Promise<SyncState> {
    const envelope = this.#readEnvelope();
    envelope.state.pendingCount = envelope.queue.length;
    envelope.state.mode = this.#remote ? "remote-ready" : "local-only";
    this.#writeEnvelope(envelope);
    return clone(envelope.state);
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
        queue: clone(parsed.queue ?? []),
        state: {
          ...getDefaultSyncState(),
          ...(parsed.state ?? {})
        }
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
