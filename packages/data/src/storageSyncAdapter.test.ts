import { describe, expect, it } from "vitest";
import { StorageSyncAdapter } from "./storageSyncAdapter";

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
      attempts: 0,
      lastError: null
    });

    const second = new StorageSyncAdapter({
      storage,
      storageKey: "sync"
    });

    expect(await second.listPending()).toHaveLength(1);
    expect((await second.getState()).pendingCount).toBe(1);
  });
});
