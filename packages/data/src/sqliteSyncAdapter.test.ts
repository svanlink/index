import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteSyncAdapter } from "./sqliteSyncAdapter";
import type { SqlDatabase } from "./sqliteLocalPersistence";

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
      attempts: 0,
      lastError: null
    });

    const second = new SqliteSyncAdapter({
      loadDatabase: async () => openNodeSqlDatabase(databasePath)
    });

    expect(await second.listPending()).toHaveLength(1);
    expect((await second.getState()).pendingCount).toBe(1);
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
