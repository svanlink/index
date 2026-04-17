import type { SqlDatabase } from "./sqliteLocalPersistence";
import {
  getDefaultSyncState,
  type RemoteSyncAdapter,
  type SyncableCatalogEntity,
  type SyncAdapter,
  type SyncOperation,
  type SyncRecoveryResult,
  type SyncResult,
  type SyncState
} from "./sync";
import {
  cancelPendingSyncOperationsForRecord,
  compactSyncQueue,
  getSyncStateForQueue,
  listDispatchableSyncOperations,
  markSyncOperationsInFlight,
  normalizeSyncOperation,
  reconcileInFlightSyncOperations,
  settleSyncQueue
} from "./syncQueue";

interface SqliteSyncAdapterOptions {
  loadDatabase(): Promise<SqlDatabase>;
  remote?: RemoteSyncAdapter | null;
}
const interruptedSyncMessage = "A previous sync attempt was interrupted before completion. Retry sync to continue.";
const strandedFlushMessage =
  "A previous sync attempt left operations in-flight. They have been rescheduled for retry.";

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
  status: SyncOperation["status"];
  attempts: number;
  last_attempt_at: string | null;
  last_error: string | null;
};

type SyncStateRow = {
  mode: SyncState["mode"];
  pending_count: number;
  queued_count: number;
  failed_count: number;
  in_flight_count: number;
  sync_in_progress: number;
  last_push_at: string | null;
  last_pull_at: string | null;
  last_error: string | null;
  last_sync_error: string | null;
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
    const queue = await this.#listQueue(database);
    const nextQueue = compactSyncQueue(queue, operation);
    await this.#writeQueue(database, nextQueue);
    await this.#writeState(database, async (current) =>
      getSyncStateForQueue({
        queue: nextQueue,
        remoteEnabled: Boolean(this.#remote),
        previous: current
      })
    );
  }

  async listPending(): Promise<SyncOperation[]> {
    const database = await this.#ensureReady();
    const queue = await this.#listQueue(database);
    return listDispatchableSyncOperations(queue);
  }

  async listQueue(): Promise<SyncOperation[]> {
    const database = await this.#ensureReady();
    return this.#listQueue(database);
  }

  async flush(): Promise<SyncResult> {
    const database = await this.#ensureReady();
    let queue = await this.#listQueue(database);

    // H4 — mid-run recovery. Any in-flight rows visible on flush entry must be
    // orphans from a prior interrupted push cycle (the repository serializes
    // flush() via #activeSyncPromise, so no other flush is in progress here).
    // Reconcile them to `failed` before starting a new push so they become
    // dispatchable and get retried in this very cycle.
    const reconciled = reconcileInFlightSyncOperations(queue, strandedFlushMessage);
    if (reconciled.recoveredCount > 0) {
      queue = reconciled.queue;
      await this.#writeQueue(database, queue);
      await this.#writeState(database, async (current) => ({
        ...getSyncStateForQueue({
          queue,
          remoteEnabled: Boolean(this.#remote),
          mode: this.#remote ? "remote-ready" : "local-only",
          previous: current
        }),
        lastError: strandedFlushMessage,
        lastSyncError: strandedFlushMessage
      }));
    }

    const dispatchable = listDispatchableSyncOperations(queue);
    if (!this.#remote || dispatchable.length === 0) {
      await this.#writeState(database, async (current) =>
        getSyncStateForQueue({
          queue,
          remoteEnabled: Boolean(this.#remote),
          previous: current
        })
      );
      return { pushed: 0, pending: dispatchable.length };
    }

    const currentState = await this.#readState(database);
    const attemptedAt = new Date().toISOString();
    const inFlightQueue = markSyncOperationsInFlight(
      queue,
      dispatchable.map((operation) => operation.id),
      attemptedAt
    );
    await this.#writeQueue(database, inFlightQueue);
    await this.#writeState(database, async (current) => ({
      ...getSyncStateForQueue({
        queue: inFlightQueue,
        remoteEnabled: true,
        mode: "syncing",
        previous: current
      }),
      lastError: null,
      lastSyncError: null
    }));

    try {
      const inFlight = inFlightQueue.filter((operation) => operation.status === "in-flight");
      const pushResult = await this.#remote.pushChanges({
        operations: inFlight,
        conflictPolicy: currentState.conflictPolicy
      });
      const settledQueue = settleSyncQueue({
        queue: inFlightQueue,
        acceptedOperationIds: pushResult.acceptedOperationIds,
        rejected: pushResult.rejected,
        fallbackError: "Remote transport did not acknowledge the queued change."
      });
      await this.#writeQueue(database, settledQueue);
      await this.#writeState(database, async (current) => ({
        ...getSyncStateForQueue({
          queue: settledQueue,
          remoteEnabled: true,
          mode: "remote-ready",
          previous: current
        }),
        lastPushAt: attemptedAt,
        lastError: pushResult.rejected[0]?.reason ?? null,
        lastSyncError: pushResult.rejected[0]?.reason ?? null,
        remoteCursor: pushResult.remoteCursor ?? current.remoteCursor
      }));

      return {
        pushed: pushResult.acceptedOperationIds.length,
        pending: listDispatchableSyncOperations(settledQueue).length
      };
    } catch (error) {
      const settledQueue = settleSyncQueue({
        queue: inFlightQueue,
        acceptedOperationIds: [],
        rejected: [],
        fallbackError: error instanceof Error ? error.message : "Remote sync failed."
      });
      await this.#writeQueue(database, settledQueue);
      await this.#writeState(database, async (current) => ({
        ...getSyncStateForQueue({
          queue: settledQueue,
          remoteEnabled: true,
          mode: "remote-ready",
          previous: current
        }),
        lastError: error instanceof Error ? error.message : "Remote sync failed.",
        lastSyncError: error instanceof Error ? error.message : "Remote sync failed."
      }));
      return {
        pushed: 0,
        pending: listDispatchableSyncOperations(settledQueue).length
      };
    }
  }

  async getState(): Promise<SyncState> {
    const database = await this.#ensureReady();
    return this.#readState(database);
  }

  async cancelPendingForRecord(entity: SyncableCatalogEntity, recordId: string): Promise<number> {
    const database = await this.#ensureReady();
    const queue = await this.#listQueue(database);
    const { queue: nextQueue, cancelledCount } = cancelPendingSyncOperationsForRecord(
      queue,
      entity,
      recordId
    );
    if (cancelledCount === 0) {
      return 0;
    }
    await this.#writeQueue(database, nextQueue);
    await this.#writeState(database, async (current) =>
      getSyncStateForQueue({
        queue: nextQueue,
        remoteEnabled: Boolean(this.#remote),
        previous: current
      })
    );
    return cancelledCount;
  }

  async recoverInterruptedState(): Promise<SyncRecoveryResult> {
    const database = await this.#ensureReady();
    const queue = await this.#listQueue(database);
    const recoveredCount = queue.filter((operation) => operation.status === "in-flight").length;
    const nextQueue =
      recoveredCount === 0
        ? queue
        : queue.map((operation) =>
            operation.status === "in-flight"
              ? {
                  ...operation,
                  status: "failed" as const,
                  lastError: operation.lastError ?? interruptedSyncMessage
                }
              : operation
          );

    if (recoveredCount > 0) {
      await this.#writeQueue(database, nextQueue);
    }

    await this.#writeState(database, async (current) => ({
      ...getSyncStateForQueue({
        queue: nextQueue,
        remoteEnabled: Boolean(this.#remote),
        previous: {
          ...current,
          mode: this.#remote ? "remote-ready" : "local-only",
          lastError: recoveredCount > 0 ? interruptedSyncMessage : current.lastError,
          lastSyncError: recoveredCount > 0 ? interruptedSyncMessage : current.lastSyncError
        }
      })
    }));

    return {
      recoveredCount,
      state: await this.#readState(database)
    };
  }

  async pull() {
    const database = await this.#ensureReady();
    const queue = await this.#listQueue(database);
    const current = await this.#readState(database);

    if (!this.#remote) {
      await this.#writeState(database, async (state) =>
        getSyncStateForQueue({
          queue,
          remoteEnabled: false,
          previous: state
        })
      );
      return {
        changes: [],
        remoteCursor: current.remoteCursor
      };
    }

    await this.#writeState(database, async (state) => ({
      ...getSyncStateForQueue({
        queue,
        remoteEnabled: true,
        mode: "syncing",
        previous: state
      }),
      lastError: null,
      lastSyncError: null
    }));

    try {
      const result = await this.#remote.pullChanges({
        sinceCursor: current.remoteCursor
      });
      await this.#writeState(database, async (state) => ({
        ...getSyncStateForQueue({
          queue,
          remoteEnabled: true,
          mode: "remote-ready",
          previous: state
        }),
        lastPullAt: new Date().toISOString(),
        lastError: null,
        lastSyncError: null,
        remoteCursor: result.remoteCursor ?? state.remoteCursor
      }));
      return result;
    } catch (error) {
      await this.#writeState(database, async (state) => ({
        ...getSyncStateForQueue({
          queue,
          remoteEnabled: true,
          mode: "remote-ready",
          previous: state
        }),
        lastError: error instanceof Error ? error.message : "Remote sync pull failed.",
        lastSyncError: error instanceof Error ? error.message : "Remote sync pull failed."
      }));
      throw error;
    }
  }

  async #readState(database: SqlDatabase): Promise<SyncState> {
    const rows = await database.select<SyncStateRow>(
      "SELECT mode, pending_count, queued_count, failed_count, in_flight_count, sync_in_progress, last_push_at, last_pull_at, last_error, last_sync_error, remote_cursor, conflict_policy FROM sync_state WHERE singleton = 1 LIMIT 1"
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
      queuedCount: state.queued_count,
      failedCount: state.failed_count,
      inFlightCount: state.in_flight_count,
      syncInProgress: Boolean(state.sync_in_progress),
      lastPushAt: state.last_push_at,
      lastPullAt: state.last_pull_at,
      lastError: state.last_error,
      lastSyncError: state.last_sync_error,
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
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL,
            last_attempt_at TEXT,
            last_error TEXT
          )`
        );
        await database.execute(
          `CREATE TABLE IF NOT EXISTS sync_state (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            mode TEXT NOT NULL,
            pending_count INTEGER NOT NULL,
            queued_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            in_flight_count INTEGER NOT NULL DEFAULT 0,
            sync_in_progress INTEGER NOT NULL DEFAULT 0,
            last_push_at TEXT,
            last_pull_at TEXT,
            last_error TEXT,
            last_sync_error TEXT,
            remote_cursor TEXT,
            conflict_policy TEXT NOT NULL
          )`
        );
        await this.#ensureColumn(database, "sync_queue", "status", "TEXT NOT NULL DEFAULT 'pending'");
        await this.#ensureColumn(database, "sync_queue", "last_attempt_at", "TEXT");
        await this.#ensureColumn(database, "sync_state", "queued_count", "INTEGER NOT NULL DEFAULT 0");
        await this.#ensureColumn(database, "sync_state", "failed_count", "INTEGER NOT NULL DEFAULT 0");
        await this.#ensureColumn(database, "sync_state", "in_flight_count", "INTEGER NOT NULL DEFAULT 0");
        await this.#ensureColumn(database, "sync_state", "sync_in_progress", "INTEGER NOT NULL DEFAULT 0");
        await this.#ensureColumn(database, "sync_state", "last_sync_error", "TEXT");

        const queue = await this.#listQueue(database);
        const state = await this.#readState(database);
        await this.#writeState(database, async () =>
          getSyncStateForQueue({
            queue,
            remoteEnabled: Boolean(this.#remote),
            previous: state
          })
        );

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
        singleton, mode, pending_count, queued_count, failed_count, in_flight_count, sync_in_progress, last_push_at, last_pull_at, last_error, last_sync_error, remote_cursor, conflict_policy
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        state.mode,
        state.pendingCount,
        state.queuedCount,
        state.failedCount,
        state.inFlightCount,
        state.syncInProgress ? 1 : 0,
        state.lastPushAt ?? null,
        state.lastPullAt ?? null,
        state.lastError ?? null,
        state.lastSyncError ?? null,
        state.remoteCursor ?? null,
        state.conflictPolicy
      ]
    );
  }

  async #writeState(database: SqlDatabase, updater: (current: SyncState) => Promise<SyncState> | SyncState) {
    const current = await this.#readState(database);
    const next = await updater(current);
    await database.execute(
      `INSERT INTO sync_state (
        singleton, mode, pending_count, queued_count, failed_count, in_flight_count, sync_in_progress, last_push_at, last_pull_at, last_error, last_sync_error, remote_cursor, conflict_policy
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(singleton) DO UPDATE SET
        mode = excluded.mode,
        pending_count = excluded.pending_count,
        queued_count = excluded.queued_count,
        failed_count = excluded.failed_count,
        in_flight_count = excluded.in_flight_count,
        sync_in_progress = excluded.sync_in_progress,
        last_push_at = excluded.last_push_at,
        last_pull_at = excluded.last_pull_at,
        last_error = excluded.last_error,
        last_sync_error = excluded.last_sync_error,
        remote_cursor = excluded.remote_cursor,
        conflict_policy = excluded.conflict_policy`,
      [
        next.mode,
        next.pendingCount,
        next.queuedCount,
        next.failedCount,
        next.inFlightCount,
        next.syncInProgress ? 1 : 0,
        next.lastPushAt ?? null,
        next.lastPullAt ?? null,
        next.lastError ?? null,
        next.lastSyncError ?? null,
        next.remoteCursor ?? null,
        next.conflictPolicy
      ]
    );
  }

  async #listQueue(database: SqlDatabase): Promise<SyncOperation[]> {
    const rows = await database.select<SyncQueueRow>(
      "SELECT * FROM sync_queue ORDER BY occurred_at ASC"
    );
    return rows.map(mapSyncQueueRow);
  }

  async #writeQueue(database: SqlDatabase, queue: SyncOperation[]) {
    await database.execute("DELETE FROM sync_queue");
    for (const operation of queue.map(normalizeSyncOperation)) {
      await database.execute(
        `INSERT INTO sync_queue (
          id, type, entity, record_id, change_kind, occurred_at,
          record_updated_at, payload_json, source, status, attempts, last_attempt_at, last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          operation.status,
          operation.attempts,
          operation.lastAttemptAt,
          operation.lastError
        ]
      );
    }
  }

  async #ensureColumn(database: SqlDatabase, tableName: string, columnName: string, definition: string) {
    const columns = await database.select<Array<{ name: string }>[number]>(
      `PRAGMA table_info(${tableName})`
    );
    const hasColumn = columns.some((column) => column.name === columnName);
    if (!hasColumn) {
      await database.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }
}

function mapSyncQueueRow(row: SyncQueueRow): SyncOperation {
  return normalizeSyncOperation({
    id: row.id,
    type: row.type,
    entity: row.entity,
    recordId: row.record_id,
    change: row.change_kind,
    occurredAt: row.occurred_at,
    recordUpdatedAt: row.record_updated_at,
    payload: JSON.parse(row.payload_json),
    source: row.source,
    status: row.status,
    attempts: row.attempts,
    lastAttemptAt: row.last_attempt_at,
    lastError: row.last_error
  });
}
