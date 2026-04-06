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
});
