import type { SqlDatabase } from "./sqliteLocalPersistence";
import {
  getDefaultSyncState,
  type RemoteSyncAdapter,
  type SyncAdapter,
  type SyncOperation,
  type SyncResult,
  type SyncState
} from "./sync";

interface SqliteSyncAdapterOptions {
  loadDatabase(): Promise<SqlDatabase>;
  remote?: RemoteSyncAdapter | null;
}

type SyncQueueRow = {
  id: string;
  type: SyncOperation["type"];
  entity: SyncOperation["entity"];
  record_id: string;
  change_kind: SyncOperation["change"];
  occurred_at: string;
  record_updated_at: string;
  payload_json: string;
  source: SyncOperation["source"];
  attempts: number;
  last_error: string | null;
};

type SyncStateRow = {
  mode: SyncState["mode"];
  pending_count: number;
  last_push_at: string | null;
  last_pull_at: string | null;
  last_error: string | null;
  remote_cursor: string | null;
  conflict_policy: SyncState["conflictPolicy"];
};

export class SqliteSyncAdapter implements SyncAdapter {
  readonly #loadDatabase: SqliteSyncAdapterOptions["loadDatabase"];
  readonly #remote: RemoteSyncAdapter | null;
  #databasePromise: Promise<SqlDatabase> | null = null;
  #readyPromise: Promise<SqlDatabase> | null = null;

  constructor(options: SqliteSyncAdapterOptions) {
    this.#loadDatabase = options.loadDatabase;
    this.#remote = options.remote ?? null;
  }

  async enqueue(operation: SyncOperation): Promise<void> {
    const database = await this.#ensureReady();
    await database.execute(
      `INSERT INTO sync_queue (
        id, type, entity, record_id, change_kind, occurred_at,
        record_updated_at, payload_json, source, attempts, last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        entity = excluded.entity,
        record_id = excluded.record_id,
        change_kind = excluded.change_kind,
        occurred_at = excluded.occurred_at,
        record_updated_at = excluded.record_updated_at,
        payload_json = excluded.payload_json,
        source = excluded.source,
        attempts = excluded.attempts,
        last_error = excluded.last_error`,
      [
        operation.id,
        operation.type,
        operation.entity,
        operation.recordId,
        operation.change,
        operation.occurredAt,
        operation.recordUpdatedAt,
        JSON.stringify(operation.payload),
        operation.source,
        operation.attempts,
        operation.lastError
      ]
    );
    await this.#writeState(database, async (current) => ({
      ...current,
      mode: this.#remote ? "remote-ready" : "local-only",
      pendingCount: current.pendingCount + 1
    }));
  }

  async listPending(): Promise<SyncOperation[]> {
    const database = await this.#ensureReady();
    const rows = await database.select<SyncQueueRow>(
      "SELECT * FROM sync_queue ORDER BY occurred_at ASC"
    );
    return rows.map(mapSyncQueueRow);
  }

  async flush(): Promise<SyncResult> {
    const database = await this.#ensureReady();
    const queue = await this.listPending();
    if (!this.#remote || queue.length === 0) {
      await this.#writeState(database, async (current) => ({
        ...current,
        mode: this.#remote ? "remote-ready" : "local-only",
        pendingCount: queue.length
      }));
      return { pushed: 0, pending: queue.length };
    }

    const pushResult = await this.#remote.pushChanges({
      operations: queue,
      conflictPolicy: (await this.getState()).conflictPolicy
    });
    const accepted = new Set(pushResult.acceptedOperationIds);

    for (const operationId of accepted) {
      await database.execute("DELETE FROM sync_queue WHERE id = ?", [operationId]);
    }

    const remaining = await this.listPending();
    await this.#writeState(database, async (current) => ({
      ...current,
      mode: "remote-ready",
      pendingCount: remaining.length,
      lastPushAt: new Date().toISOString(),
      lastError: pushResult.rejected[0]?.reason ?? null,
      remoteCursor: pushResult.remoteCursor ?? current.remoteCursor
    }));

    return {
      pushed: pushResult.acceptedOperationIds.length,
      pending: remaining.length
    };
  }

  async getState(): Promise<SyncState> {
    const database = await this.#ensureReady();
    return this.#readState(database);
  }

  async #readState(database: SqlDatabase): Promise<SyncState> {
    const rows = await database.select<SyncStateRow>(
      "SELECT mode, pending_count, last_push_at, last_pull_at, last_error, remote_cursor, conflict_policy FROM sync_state WHERE singleton = 1 LIMIT 1"
    );
    const state = rows[0];
    if (!state) {
      const initial: SyncState = {
        ...getDefaultSyncState(),
        mode: this.#remote ? "remote-ready" : "local-only"
      };
      await this.#insertInitialState(database, initial);
      return initial;
    }

    return {
      mode: state.mode,
      pendingCount: state.pending_count,
      lastPushAt: state.last_push_at,
      lastPullAt: state.last_pull_at,
      lastError: state.last_error,
      remoteCursor: state.remote_cursor,
      conflictPolicy: state.conflict_policy
    };
  }

  async #ensureReady() {
    if (!this.#readyPromise) {
      this.#readyPromise = (async () => {
        const database = await this.#getDatabase();
        await database.execute(
          `CREATE TABLE IF NOT EXISTS sync_queue (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            entity TEXT NOT NULL,
            record_id TEXT NOT NULL,
            change_kind TEXT NOT NULL,
            occurred_at TEXT NOT NULL,
            record_updated_at TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            source TEXT NOT NULL,
            attempts INTEGER NOT NULL,
            last_error TEXT
          )`
        );
        await database.execute(
          `CREATE TABLE IF NOT EXISTS sync_state (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            mode TEXT NOT NULL,
            pending_count INTEGER NOT NULL,
            last_push_at TEXT,
            last_pull_at TEXT,
            last_error TEXT,
            remote_cursor TEXT,
            conflict_policy TEXT NOT NULL
          )`
        );

        const state = await this.#readState(database);
        await this.#writeState(database, async () => ({
          ...state,
          mode: this.#remote ? "remote-ready" : "local-only"
        }));

        return database;
      })();
    }

    return this.#readyPromise;
  }

  async #getDatabase() {
    if (!this.#databasePromise) {
      this.#databasePromise = this.#loadDatabase();
    }

    return this.#databasePromise;
  }

  async #insertInitialState(database: SqlDatabase, state: SyncState) {
    await database.execute(
      `INSERT INTO sync_state (
        singleton, mode, pending_count, last_push_at, last_pull_at, last_error, remote_cursor, conflict_policy
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        state.mode,
        state.pendingCount,
        state.lastPushAt,
        state.lastPullAt,
        state.lastError,
        state.remoteCursor,
        state.conflictPolicy
      ]
    );
  }

  async #writeState(database: SqlDatabase, updater: (current: SyncState) => Promise<SyncState> | SyncState) {
    const current = await this.#readState(database);
    const next = await updater(current);
    await database.execute(
      `INSERT INTO sync_state (
        singleton, mode, pending_count, last_push_at, last_pull_at, last_error, remote_cursor, conflict_policy
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(singleton) DO UPDATE SET
        mode = excluded.mode,
        pending_count = excluded.pending_count,
        last_push_at = excluded.last_push_at,
        last_pull_at = excluded.last_pull_at,
        last_error = excluded.last_error,
        remote_cursor = excluded.remote_cursor,
        conflict_policy = excluded.conflict_policy`,
      [
        next.mode,
        next.pendingCount,
        next.lastPushAt,
        next.lastPullAt,
        next.lastError,
        next.remoteCursor,
        next.conflictPolicy
      ]
    );
  }
}

function mapSyncQueueRow(row: SyncQueueRow): SyncOperation {
  return {
    id: row.id,
    type: row.type,
    entity: row.entity,
    recordId: row.record_id,
    change: row.change_kind,
    occurredAt: row.occurred_at,
    recordUpdatedAt: row.record_updated_at,
    payload: JSON.parse(row.payload_json),
    source: row.source,
    attempts: row.attempts,
    lastError: row.last_error
  };
}
