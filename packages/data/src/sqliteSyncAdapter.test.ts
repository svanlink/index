import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteSyncAdapter } from "./sqliteSyncAdapter";
import type { SqlDatabase } from "./sqliteLocalPersistence";
import type { RemoteSyncAdapter } from "./sync";

const tempDirectories: string[] = [];

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("SqliteSyncAdapter", () => {
  it("persists queued mutations across adapter instances", async () => {
    const databasePath = createTempDatabasePath();
    const first = new SqliteSyncAdapter({
      loadDatabase: async () => openNodeSqlDatabase(databasePath)
    });

    await first.enqueue({
      id: "op-1",
      type: "drive.upsert",
      entity: "drive",
      recordId: "drive-a",
      change: "upsert",
      occurredAt: "2026-04-06T12:00:00.000Z",
      recordUpdatedAt: "2026-04-06T12:00:00.000Z",
      payload: { id: "drive-a" },
      source: "manual",
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      lastError: null
    });

    const second = new SqliteSyncAdapter({
      loadDatabase: async () => openNodeSqlDatabase(databasePath)
    });

    expect(await second.listPending()).toHaveLength(1);
    expect((await second.getState()).pendingCount).toBe(1);
  });

  it("compacts repeated drive upserts for the same record", async () => {
    const databasePath = createTempDatabasePath();
    const adapter = new SqliteSyncAdapter({
      loadDatabase: async () => openNodeSqlDatabase(databasePath)
    });

    await adapter.enqueue({
      id: "op-1",
      type: "drive.upsert",
      entity: "drive",
      recordId: "drive-a",
      change: "upsert",
      occurredAt: "2026-04-06T12:00:00.000Z",
      recordUpdatedAt: "2026-04-06T12:00:00.000Z",
      payload: { id: "drive-a", displayName: "Drive A" },
      source: "manual",
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      lastError: null
    });
    await adapter.enqueue({
      id: "op-2",
      type: "drive.upsert",
      entity: "drive",
      recordId: "drive-a",
      change: "upsert",
      occurredAt: "2026-04-06T12:02:00.000Z",
      recordUpdatedAt: "2026-04-06T12:02:00.000Z",
      payload: { id: "drive-a", displayName: "Archive Drive" },
      source: "batch",
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      lastError: null
    });

    const queue = await adapter.listQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.id).toBe("op-1");
    expect(queue[0]?.payload).toEqual({ id: "drive-a", displayName: "Archive Drive" });
  });

  it("persists failed retry metadata after a rejected push", async () => {
    const databasePath = createTempDatabasePath();
    const remote: RemoteSyncAdapter = {
      mode: "remote-ready",
      async pushChanges() {
        return {
          acceptedOperationIds: [],
          rejected: [{ operationId: "op-1", reason: "Remote rejected the change." }],
          remoteCursor: "cursor-1"
        };
      },
      async pullChanges() {
        return { changes: [], remoteCursor: "cursor-1" };
      }
    };
    const adapter = new SqliteSyncAdapter({
      loadDatabase: async () => openNodeSqlDatabase(databasePath),
      remote
    });

    await adapter.enqueue({
      id: "op-1",
      type: "project.upsert",
      entity: "project",
      recordId: "project-1",
      change: "upsert",
      occurredAt: "2026-04-06T12:00:00.000Z",
      recordUpdatedAt: "2026-04-06T12:00:00.000Z",
      payload: { id: "project-1" },
      source: "manual",
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      lastError: null
    });

    await expect(adapter.flush()).resolves.toEqual({ pushed: 0, pending: 1 });

    const queue = await adapter.listQueue();
    const state = await adapter.getState();

    expect(queue[0]?.status).toBe("failed");
    expect(queue[0]?.attempts).toBe(1);
    expect(queue[0]?.lastError).toBe("Remote rejected the change.");
    expect(queue[0]?.lastAttemptAt).not.toBeNull();
    expect(state.failedCount).toBe(1);
    expect(state.remoteCursor).toBe("cursor-1");
  });

  it("S4/H4 — reconciles stranded in-flight rows at flush entry and retries them in the same cycle", async () => {
    const databasePath = createTempDatabasePath();
    const pushes: string[][] = [];
    const remote: RemoteSyncAdapter = {
      mode: "remote-ready",
      async pushChanges(request) {
        pushes.push(request.operations.map((operation) => operation.id));
        return {
          acceptedOperationIds: request.operations.map((operation) => operation.id),
          rejected: [],
          remoteCursor: "cursor-recovered"
        };
      },
      async pullChanges() {
        return { changes: [], remoteCursor: "cursor-recovered" };
      }
    };
    const adapter = new SqliteSyncAdapter({
      loadDatabase: async () => openNodeSqlDatabase(databasePath),
      remote
    });

    await adapter.enqueue({
      id: "op-stranded",
      type: "project.upsert",
      entity: "project",
      recordId: "project-stranded",
      change: "upsert",
      occurredAt: "2026-04-06T12:00:00.000Z",
      recordUpdatedAt: "2026-04-06T12:00:00.000Z",
      payload: { id: "project-stranded" },
      source: "manual",
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      lastError: null
    });

    // Simulate a prior flush() that marked the row in-flight but never settled
    // it (e.g. pushChanges hung and the process was killed). Crucially, leave
    // sync_state at remote-ready + sync_in_progress=0 so that the boot-time
    // `recoverInterruptedState` guard in runSyncCycle would NOT be triggered —
    // the only path that can rescue this row is the in-flush reconciliation.
    const rawDatabase = openNodeSqlDatabase(databasePath);
    await rawDatabase.execute(
      "UPDATE sync_queue SET status = 'in-flight', attempts = 1, last_attempt_at = '2026-04-06T12:05:00.000Z'"
    );
    await rawDatabase.execute(
      "UPDATE sync_state SET mode = 'remote-ready', in_flight_count = 1, sync_in_progress = 0"
    );

    // Now call flush() on the SAME adapter instance — no restart, no explicit
    // recoverInterruptedState() call. The fix should reconcile the stranded op
    // and immediately retry it in this cycle.
    const result = await adapter.flush();

    expect(result.pushed).toBe(1);
    expect(result.pending).toBe(0);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toEqual(["op-stranded"]);

    const queue = await adapter.listQueue();
    expect(queue).toHaveLength(0);

    const state = await adapter.getState();
    expect(state.inFlightCount).toBe(0);
    expect(state.pendingCount).toBe(0);
    expect(state.failedCount).toBe(0);
    expect(state.remoteCursor).toBe("cursor-recovered");
  });

  it("S4/H4 — reconciliation happens even when remote is absent (no retry path)", async () => {
    const databasePath = createTempDatabasePath();
    const adapter = new SqliteSyncAdapter({
      loadDatabase: async () => openNodeSqlDatabase(databasePath)
      // no remote — flush() should still clean up stranded in-flight rows
    });

    await adapter.enqueue({
      id: "op-stranded",
      type: "drive.upsert",
      entity: "drive",
      recordId: "drive-a",
      change: "upsert",
      occurredAt: "2026-04-06T12:00:00.000Z",
      recordUpdatedAt: "2026-04-06T12:00:00.000Z",
      payload: { id: "drive-a" },
      source: "manual",
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      lastError: null
    });

    const rawDatabase = openNodeSqlDatabase(databasePath);
    await rawDatabase.execute("UPDATE sync_queue SET status = 'in-flight', attempts = 1");

    const result = await adapter.flush();
    // With no remote, flush returns 0 pushed but still reports the dispatchable
    // count — and the queue/state must no longer show in-flight rows.
    expect(result.pushed).toBe(0);

    const queue = await adapter.listQueue();
    expect(queue[0]?.status).toBe("failed");
    expect(queue[0]?.lastError).toContain("rescheduled");

    const state = await adapter.getState();
    expect(state.inFlightCount).toBe(0);
    expect(state.failedCount).toBe(1);
  });

  it("recovers stale in-flight rows after restart", async () => {
    const databasePath = createTempDatabasePath();
    const adapter = new SqliteSyncAdapter({
      loadDatabase: async () => openNodeSqlDatabase(databasePath),
      remote: {
        mode: "remote-ready",
        async pushChanges() {
          return { acceptedOperationIds: [], rejected: [], remoteCursor: null };
        },
        async pullChanges() {
          return { changes: [], remoteCursor: null };
        }
      }
    });

    await adapter.enqueue({
      id: "op-1",
      type: "project.upsert",
      entity: "project",
      recordId: "project-1",
      change: "upsert",
      occurredAt: "2026-04-06T12:00:00.000Z",
      recordUpdatedAt: "2026-04-06T12:00:00.000Z",
      payload: { id: "project-1" },
      source: "manual",
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      lastError: null
    });

    const database = openNodeSqlDatabase(databasePath);
    await database.execute("UPDATE sync_queue SET status = 'in-flight', attempts = 1");
    await database.execute("UPDATE sync_state SET mode = 'syncing', in_flight_count = 1, sync_in_progress = 1");

    const restarted = new SqliteSyncAdapter({
      loadDatabase: async () => openNodeSqlDatabase(databasePath),
      remote: {
        mode: "remote-ready",
        async pushChanges() {
          return { acceptedOperationIds: [], rejected: [], remoteCursor: null };
        },
        async pullChanges() {
          return { changes: [], remoteCursor: null };
        }
      }
    });

    const recovery = await restarted.recoverInterruptedState();
    const queue = await restarted.listQueue();

    expect(recovery.recoveredCount).toBe(1);
    expect(queue[0]?.status).toBe("failed");
    expect(queue[0]?.lastError).toContain("interrupted");
  });
});

function createTempDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "drive-project-catalog-sync-"));
  tempDirectories.push(directory);
  return join(directory, "catalog.db");
}

function openNodeSqlDatabase(databasePath: string): SqlDatabase {
  const database = new DatabaseSync(databasePath);

  return {
    async execute(query: string, bindValues: unknown[] = []) {
      const result = database.prepare(query).run(...toSqlParameters(bindValues));
      return {
        rowsAffected: Number(result.changes ?? 0),
        lastInsertId:
          result.lastInsertRowid === undefined
            ? undefined
            : Number(result.lastInsertRowid)
      };
    },
    async select<T>(query: string, bindValues: unknown[] = []) {
      return database.prepare(query).all(...toSqlParameters(bindValues)) as T[];
    }
  };
}

function toSqlParameters(bindValues: unknown[]) {
  return bindValues as Parameters<ReturnType<DatabaseSync["prepare"]>["run"]>;
}
