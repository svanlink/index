import { describe, expect, it } from "vitest";
import { StorageSyncAdapter } from "./storageSyncAdapter";
import type { RemoteSyncAdapter } from "./sync";

class MemoryStorage {
  private readonly store = new Map<string, string>();

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

describe("StorageSyncAdapter", () => {
  it("persists queued mutations across adapter instances", async () => {
    const storage = new MemoryStorage();
    const first = new StorageSyncAdapter({
      storage,
      storageKey: "sync"
    });

    await first.enqueue({
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

    const second = new StorageSyncAdapter({
      storage,
      storageKey: "sync"
    });

    expect(await second.listPending()).toHaveLength(1);
    expect((await second.getState()).pendingCount).toBe(1);
  });

  it("compacts repeated upserts for the same record", async () => {
    const storage = new MemoryStorage();
    const adapter = new StorageSyncAdapter({
      storage,
      storageKey: "sync"
    });

    await adapter.enqueue({
      id: "op-1",
      type: "project.upsert",
      entity: "project",
      recordId: "project-1",
      change: "upsert",
      occurredAt: "2026-04-06T12:00:00.000Z",
      recordUpdatedAt: "2026-04-06T12:00:00.000Z",
      payload: { id: "project-1", correctedClient: "Old" },
      source: "manual",
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      lastError: null
    });
    await adapter.enqueue({
      id: "op-2",
      type: "project.upsert",
      entity: "project",
      recordId: "project-1",
      change: "upsert",
      occurredAt: "2026-04-06T12:01:00.000Z",
      recordUpdatedAt: "2026-04-06T12:01:00.000Z",
      payload: { id: "project-1", correctedClient: "New" },
      source: "manual",
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      lastError: null
    });

    const queue = await adapter.listQueue();

    expect(queue).toHaveLength(1);
    expect(queue[0]?.id).toBe("op-1");
    expect(queue[0]?.payload).toEqual({ id: "project-1", correctedClient: "New" });
  });

  it("marks failed pushes with retry metadata", async () => {
    const storage = new MemoryStorage();
    const remote: RemoteSyncAdapter = {
      mode: "remote-ready",
      async pushChanges() {
        throw new Error("Network unavailable");
      },
      async pullChanges() {
        return { changes: [], remoteCursor: null };
      }
    };
    const adapter = new StorageSyncAdapter({
      storage,
      storageKey: "sync",
      remote
    });

    await adapter.enqueue({
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

    await expect(adapter.flush()).resolves.toEqual({ pushed: 0, pending: 1 });

    const queue = await adapter.listQueue();
    const state = await adapter.getState();

    expect(queue[0]?.status).toBe("failed");
    expect(queue[0]?.attempts).toBe(1);
    expect(queue[0]?.lastAttemptAt).not.toBeNull();
    expect(queue[0]?.lastError).toBe("Network unavailable");
    expect(state.failedCount).toBe(1);
    expect(state.inFlightCount).toBe(0);
  });

  it("S4/H4 — reconciles stranded in-flight items at flush entry and retries them in the same cycle", async () => {
    const storage = new MemoryStorage();
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
    const adapter = new StorageSyncAdapter({
      storage,
      storageKey: "sync",
      remote
    });

    // Seed an envelope with a stranded in-flight op but with state showing
    // remote-ready + sync_in_progress=false. This is the scenario the boot-time
    // `recoverInterruptedState` guard would miss — it requires mid-run recovery.
    storage.setItem(
      "sync",
      JSON.stringify({
        version: 1,
        queue: [
          {
            id: "op-stranded",
            type: "project.upsert",
            entity: "project",
            recordId: "project-stranded",
            change: "upsert",
            occurredAt: "2026-04-06T12:00:00.000Z",
            recordUpdatedAt: "2026-04-06T12:00:00.000Z",
            payload: { id: "project-stranded" },
            source: "manual",
            status: "in-flight",
            attempts: 1,
            lastAttemptAt: "2026-04-06T12:05:00.000Z",
            lastError: null
          }
        ],
        state: {
          mode: "remote-ready",
          pendingCount: 0,
          queuedCount: 1,
          failedCount: 0,
          inFlightCount: 1,
          syncInProgress: false,
          lastPushAt: null,
          lastPullAt: null,
          lastError: null,
          lastSyncError: null,
          remoteCursor: null,
          conflictPolicy: "updated-at-last-write-wins-local-tie-break"
        }
      })
    );

    // flush() on the existing adapter instance (no restart) must reconcile and retry.
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

  it("F5 — cancelPendingForRecord removes matching pending entries without pushing to remote", async () => {
    // Load-bearing invariant: this primitive is the only queue-cancellation
    // path the repository uses for delete propagation (both inbound-delete
    // coordination in F5 and outbound delete in F8, once Pass 5 retired the
    // flush-based helper). A push here would resurrect the record on the
    // remote that we are simultaneously trying to delete — the exact echo
    // loop F5/F8 exist to prevent.
    const storage = new MemoryStorage();
    const pushes: string[][] = [];
    const remote: RemoteSyncAdapter = {
      mode: "remote-ready",
      async pushChanges(request) {
        pushes.push(request.operations.map((op) => op.id));
        return {
          acceptedOperationIds: request.operations.map((op) => op.id),
          rejected: [],
          remoteCursor: "cursor-after-push"
        };
      },
      async pullChanges() {
        return { changes: [], remoteCursor: null };
      }
    };
    const adapter = new StorageSyncAdapter({
      storage,
      storageKey: "sync",
      remote
    });

    await adapter.enqueue({
      id: "op-target",
      type: "project.upsert",
      entity: "project",
      recordId: "project-target",
      change: "upsert",
      occurredAt: "2026-04-06T12:00:00.000Z",
      recordUpdatedAt: "2026-04-06T12:00:00.000Z",
      payload: { id: "project-target" },
      source: "manual",
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      lastError: null
    });
    await adapter.enqueue({
      id: "op-keep",
      type: "project.upsert",
      entity: "project",
      recordId: "project-other",
      change: "upsert",
      occurredAt: "2026-04-06T12:00:05.000Z",
      recordUpdatedAt: "2026-04-06T12:00:05.000Z",
      payload: { id: "project-other" },
      source: "manual",
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      lastError: null
    });

    const cancelled = await adapter.cancelPendingForRecord("project", "project-target");

    expect(cancelled).toBe(1);
    expect(pushes).toHaveLength(0);
    const queue = await adapter.listQueue();
    expect(queue.map((op) => op.id)).toEqual(["op-keep"]);
    expect((await adapter.getState()).queuedCount).toBe(1);
  });

  it("F5 — cancelPendingForRecord preserves in-flight entries even when (entity, recordId) matches", async () => {
    // H4 parity — in-flight ops are already being pushed to the remote;
    // pulling them out here would leave the push unresolved. The subsequent
    // inbound-delete scenario handles in-flight as an acknowledged brief-
    // reanimation case, not a correctness violation.
    const storage = new MemoryStorage();
    // Seed the envelope directly with a stranded in-flight op alongside a pending one.
    storage.setItem(
      "sync",
      JSON.stringify({
        version: 1,
        queue: [
          {
            id: "op-in-flight",
            type: "project.upsert",
            entity: "project",
            recordId: "project-target",
            change: "upsert",
            occurredAt: "2026-04-06T12:00:00.000Z",
            recordUpdatedAt: "2026-04-06T12:00:00.000Z",
            payload: { id: "project-target" },
            source: "manual",
            status: "in-flight",
            attempts: 1,
            lastAttemptAt: "2026-04-06T12:01:00.000Z",
            lastError: null
          },
          {
            id: "op-pending",
            type: "project.upsert",
            entity: "project",
            recordId: "project-target",
            change: "upsert",
            occurredAt: "2026-04-06T12:02:00.000Z",
            recordUpdatedAt: "2026-04-06T12:02:00.000Z",
            payload: { id: "project-target" },
            source: "manual",
            status: "pending",
            attempts: 0,
            lastAttemptAt: null,
            lastError: null
          }
        ],
        state: {
          mode: "remote-ready",
          pendingCount: 1,
          queuedCount: 2,
          failedCount: 0,
          inFlightCount: 1,
          syncInProgress: false,
          lastPushAt: null,
          lastPullAt: null,
          lastError: null,
          lastSyncError: null,
          remoteCursor: null,
          conflictPolicy: "updated-at-last-write-wins-local-tie-break"
        }
      })
    );
    const adapter = new StorageSyncAdapter({
      storage,
      storageKey: "sync"
    });

    const cancelled = await adapter.cancelPendingForRecord("project", "project-target");

    expect(cancelled).toBe(1);
    const queue = await adapter.listQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.id).toBe("op-in-flight");
    expect(queue[0]?.status).toBe("in-flight");
  });

  it("recovers stale in-flight items after restart", async () => {
    const storage = new MemoryStorage();
    const first = new StorageSyncAdapter({
      storage,
      storageKey: "sync",
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

    await first.enqueue({
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

    storage.setItem(
      "sync",
      JSON.stringify({
        version: 1,
        queue: [
          {
            id: "op-1",
            type: "project.upsert",
            entity: "project",
            recordId: "project-1",
            change: "upsert",
            occurredAt: "2026-04-06T12:00:00.000Z",
            recordUpdatedAt: "2026-04-06T12:00:00.000Z",
            payload: { id: "project-1" },
            source: "manual",
            status: "in-flight",
            attempts: 1,
            lastAttemptAt: "2026-04-06T12:01:00.000Z",
            lastError: null
          }
        ],
        state: {
          mode: "syncing",
          pendingCount: 0,
          queuedCount: 1,
          failedCount: 0,
          inFlightCount: 1,
          syncInProgress: true,
          lastPushAt: null,
          lastPullAt: null,
          lastError: null,
          lastSyncError: null,
          remoteCursor: null,
          conflictPolicy: "updated-at-last-write-wins-local-tie-break"
        }
      })
    );

    const second = new StorageSyncAdapter({
      storage,
      storageKey: "sync",
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

    const recovery = await second.recoverInterruptedState();
    const queue = await second.listQueue();

    expect(recovery.recoveredCount).toBe(1);
    expect(queue[0]?.status).toBe("failed");
    expect(queue[0]?.lastError).toContain("interrupted");
  });
});
