import type { SqlDatabase, SqlQueryResult } from "@drive-project-catalog/data";

const databasePath = "sqlite:drive-project-catalog.db";

interface TauriSqlDatabaseHandle {
  execute(query: string, bindValues?: unknown[]): Promise<SqlQueryResult>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T[]>;
}

export function createTauriSqliteDatabaseLoader() {
  let databasePromise: Promise<TauriSqlDatabaseHandle> | null = null;

  return async function loadDatabase(): Promise<SqlDatabase> {
    if (!databasePromise) {
      databasePromise = loadTauriDatabase();
    }

    const database = await databasePromise;
    return {
      execute(query, bindValues) {
        return database.execute(query, bindValues);
      },
      select(query, bindValues) {
        return database.select(query, bindValues);
      }
    };
  };
}

async function loadTauriDatabase() {
  const module = await import("@tauri-apps/plugin-sql");
  const Database = module.default;
  return Database.load(databasePath);
}

export { databasePath as desktopCatalogDatabasePath };
