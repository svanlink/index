import { describe, expect, it } from "vitest";
import { mockCatalogSnapshot } from "./mockData";
import { StorageLocalPersistence } from "./storageLocalPersistence";

class MemoryStorage {
  private readonly store = new Map<string, string>();

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }
}

describe("StorageLocalPersistence", () => {
  it("persists catalog snapshots across adapter instances", async () => {
    const storage = new MemoryStorage();
    const first = new StorageLocalPersistence({
      storage,
      storageKey: "catalog",
      seed: mockCatalogSnapshot
    });

    const seed = await first.readSnapshot();
    seed.projects[0] = {
      ...seed.projects[0]!,
      correctedProject: "Persisted Title"
    };
    await first.replaceSnapshot(seed);

    const second = new StorageLocalPersistence({
      storage,
      storageKey: "catalog",
      seed: mockCatalogSnapshot
    });
    const persisted = await second.readSnapshot();

    expect(persisted.projects[0]?.correctedProject).toBe("Persisted Title");
    expect(persisted.scanSessions.length).toBeGreaterThan(0);
  });

  it("supports granular project and session writes", async () => {
    const storage = new MemoryStorage();
    const persistence = new StorageLocalPersistence({
      storage,
      storageKey: "catalog",
      seed: mockCatalogSnapshot
    });

    const project = {
      ...(await persistence.getProjectById("project-240401-apple-shoot"))!,
      correctedProject: "Granular Project Title"
    };
    const session = {
      ...(await persistence.getScanSession("scan-drive-a-20260405"))!,
      status: "interrupted" as const,
      error: "Recovered after restart"
    };

    await persistence.upsertProject(project);
    await persistence.upsertScanSession(session);

    const persisted = new StorageLocalPersistence({
      storage,
      storageKey: "catalog",
      seed: mockCatalogSnapshot
    });

    expect((await persisted.getProjectById(project.id))?.correctedProject).toBe("Granular Project Title");
    expect((await persisted.getScanSession(session.scanId))?.status).toBe("interrupted");
  });
});
