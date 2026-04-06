import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { mockCatalogSnapshot } from "./mockData";
import { SqliteLocalPersistence, type SqlDatabase } from "./sqliteLocalPersistence";

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

const tempDirectories: string[] = [];

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("SqliteLocalPersistence", () => {
  it("persists catalog snapshots across adapter instances", async () => {
    const databasePath = createTempDatabasePath();
    const first = createPersistence(databasePath);

    const seed = await first.readSnapshot();
    seed.projects[0] = {
      ...seed.projects[0]!,
      correctedProject: "Persisted in SQLite"
    };
    await first.replaceSnapshot(seed);

    const second = createPersistence(databasePath);
    const persisted = await second.readSnapshot();

    expect(persisted.projects[0]?.correctedProject).toBe("Persisted in SQLite");
    expect(persisted.scanSessions.length).toBeGreaterThan(0);
  });

  it("imports legacy localStorage data into SQLite on first boot", async () => {
    const databasePath = createTempDatabasePath();
    const legacyStorage = new MemoryStorage();
    const legacySnapshot = structuredClone(mockCatalogSnapshot);
    legacySnapshot.drives[0] = {
      ...legacySnapshot.drives[0]!,
      displayName: "Migrated Drive"
    };
    legacyStorage.setItem(
      "catalog",
      JSON.stringify({
        version: 1,
        snapshot: legacySnapshot
      })
    );

    const persistence = createPersistence(databasePath, legacyStorage);
    const migrated = await persistence.readSnapshot();

    expect(migrated.drives.some((drive) => drive.displayName === "Migrated Drive")).toBe(true);
    expect(migrated.projects).toHaveLength(mockCatalogSnapshot.projects.length);
    expect(legacyStorage.getItem("catalog")).toBeNull();
  });

  it("supports granular SQLite upserts without replacing the full snapshot", async () => {
    const databasePath = createTempDatabasePath();
    const persistence = createPersistence(databasePath);
    const project = {
      ...(await persistence.getProjectById("project-240401-apple-shoot"))!,
      correctedClient: "Granular Apple"
    };
    const drive = {
      ...(await persistence.getDriveById("drive-c"))!,
      displayName: "Granular Freezer"
    };

    await persistence.upsertProject(project);
    await persistence.upsertDrive(drive);

    const reopened = createPersistence(databasePath);
    expect((await reopened.getProjectById(project.id))?.correctedClient).toBe("Granular Apple");
    expect((await reopened.getDriveById(drive.id))?.displayName).toBe("Granular Freezer");
  });
});

function createPersistence(databasePath: string, legacyStorage?: MemoryStorage) {
  return new SqliteLocalPersistence({
    loadDatabase: async () => openNodeSqlDatabase(databasePath),
    seed: mockCatalogSnapshot,
    legacyStorage,
    legacyStorageKey: legacyStorage ? "catalog" : undefined
  });
}

function createTempDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), "drive-project-catalog-sqlite-"));
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
