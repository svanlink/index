import type {
  Category,
  Drive,
  FolderType,
  Project,
  ProjectScanEvent,
  RenameSuggestion,
  RenameSuggestionStatus,
  ScanProjectRecord,
  ScanRecord,
  ScanSessionSnapshot
} from "@drive-project-catalog/domain";
import type {
  CatalogSnapshot,
  LocalPersistenceAdapter,
  RenameUndoEntry
} from "./localPersistence";

export interface SqlQueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export interface SqlDatabase {
  select<T>(query: string, bindValues?: unknown[]): Promise<T[]>;
  execute(query: string, bindValues?: unknown[]): Promise<SqlQueryResult>;
}

export interface SqliteLocalPersistenceOptions {
  loadDatabase(): Promise<SqlDatabase>;
  seed: CatalogSnapshot;
}

const cloneSnapshotValue = <T>(value: T): T => structuredClone(value);

/**
 * Normalizes a catalog snapshot by deep-cloning each collection and
 * back-filling createdAt/updatedAt timestamps on scans, project scan events,
 * and scan sessions from their legacy fields. The SQLite persistence layer
 * routes every inbound snapshot (seeds and `replaceSnapshot` input) through
 * this helper so the downstream write path sees a canonical shape.
 */
function normalizeCatalogSnapshot(snapshot: CatalogSnapshot): CatalogSnapshot {
  return {
    drives: cloneSnapshotValue(snapshot.drives ?? []),
    projects: cloneSnapshotValue(snapshot.projects ?? []),
    scans: cloneSnapshotValue(snapshot.scans ?? []).map((scan) => ({
      ...scan,
      createdAt: scan.createdAt ?? scan.startedAt,
      updatedAt: scan.updatedAt ?? scan.finishedAt ?? scan.startedAt
    })),
    projectScanEvents: cloneSnapshotValue(snapshot.projectScanEvents ?? []).map((event) => ({
      ...event,
      createdAt: event.createdAt ?? event.observedAt,
      updatedAt: event.updatedAt ?? event.observedAt
    })),
    scanSessions: cloneSnapshotValue(snapshot.scanSessions ?? []).map((session) => ({
      ...session,
      createdAt: session.createdAt ?? session.startedAt,
      updatedAt: session.updatedAt ?? session.finishedAt ?? session.startedAt
    }))
  };
}

interface Migration {
  version: number;
  statements?: string[];
  run?: (database: SqlDatabase) => Promise<void>;
}

async function tableExists(database: SqlDatabase, tableName: string): Promise<boolean> {
  const rows = await database.select<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );
  return rows.length > 0;
}

const migrations: Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS drives (
        id TEXT PRIMARY KEY,
        volume_name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        total_capacity_bytes INTEGER,
        used_bytes INTEGER,
        free_bytes INTEGER,
        reserved_incoming_bytes INTEGER NOT NULL,
        last_scanned_at TEXT,
        created_manually INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        parsed_date TEXT NOT NULL,
        parsed_client TEXT NOT NULL,
        parsed_project TEXT NOT NULL,
        corrected_client TEXT,
        corrected_project TEXT,
        category TEXT,
        size_bytes INTEGER,
        size_status TEXT NOT NULL,
        current_drive_id TEXT,
        target_drive_id TEXT,
        move_status TEXT NOT NULL,
        missing_status TEXT NOT NULL,
        duplicate_status TEXT NOT NULL,
        is_unassigned INTEGER NOT NULL,
        is_manual INTEGER NOT NULL,
        last_seen_at TEXT,
        last_scanned_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_projects_current_drive_id ON projects (current_drive_id)`,
      `CREATE INDEX IF NOT EXISTS idx_projects_target_drive_id ON projects (target_drive_id)`,
      `CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        drive_id TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        folders_scanned INTEGER NOT NULL,
        matches_found INTEGER NOT NULL,
        notes TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS project_scan_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        scan_id TEXT NOT NULL,
        observed_folder_name TEXT NOT NULL,
        observed_drive_name TEXT NOT NULL,
        observed_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_project_scan_events_project_id ON project_scan_events (project_id)`,
      `CREATE INDEX IF NOT EXISTS idx_project_scan_events_scan_id ON project_scan_events (scan_id)`,
      `CREATE TABLE IF NOT EXISTS scan_sessions (
        scan_id TEXT PRIMARY KEY,
        root_path TEXT NOT NULL,
        drive_name TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        folders_scanned INTEGER NOT NULL,
        matches_found INTEGER NOT NULL,
        error TEXT,
        size_jobs_pending INTEGER NOT NULL,
        requested_drive_id TEXT,
        requested_drive_name TEXT,
        summary_new_projects_count INTEGER,
        summary_updated_projects_count INTEGER,
        summary_missing_projects_count INTEGER,
        summary_duplicates_flagged_count INTEGER,
        summary_duration_ms INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS scan_session_projects (
        id TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL,
        folder_name TEXT NOT NULL,
        folder_path TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        parsed_date TEXT NOT NULL,
        parsed_client TEXT NOT NULL,
        parsed_project TEXT NOT NULL,
        source_drive_name TEXT NOT NULL,
        scan_timestamp TEXT NOT NULL,
        size_status TEXT NOT NULL,
        size_bytes INTEGER,
        size_error TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_scan_session_projects_scan_id ON scan_session_projects (scan_id)`
    ]
  },
  {
    version: 2,
    // Add created_at / updated_at timestamps to scan-related tables.
    // ALTER TABLE ADD COLUMN is not idempotent in SQLite — guard each add via pragma.
    run: async (database: SqlDatabase) => {
      const addColumnIfMissing = async (
        tableName: string,
        columnName: string,
        definition: string
      ) => {
        const columns = await database.select<{ name: string }>(
          `PRAGMA table_info(${tableName})`
        );
        if (!columns.some((column) => column.name === columnName)) {
          await database.execute(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
        }
      };

      await addColumnIfMissing("scans", "created_at", "created_at TEXT");
      await addColumnIfMissing("scans", "updated_at", "updated_at TEXT");
      await database.execute(
        "UPDATE scans SET created_at = COALESCE(created_at, started_at), updated_at = COALESCE(updated_at, finished_at, started_at)"
      );

      await addColumnIfMissing("project_scan_events", "created_at", "created_at TEXT");
      await addColumnIfMissing("project_scan_events", "updated_at", "updated_at TEXT");
      await database.execute(
        "UPDATE project_scan_events SET created_at = COALESCE(created_at, observed_at), updated_at = COALESCE(updated_at, observed_at)"
      );

      await addColumnIfMissing("scan_sessions", "created_at", "created_at TEXT");
      await addColumnIfMissing("scan_sessions", "updated_at", "updated_at TEXT");
      await database.execute(
        "UPDATE scan_sessions SET created_at = COALESCE(created_at, started_at), updated_at = COALESCE(updated_at, finished_at, started_at)"
      );
    }
  },
  {
    version: 3,
    // Recreate projects table to make parsed fields nullable and add new columns.
    // SQLite does not support ALTER COLUMN, so a table recreation is required.
    // Uses imperative `run` so the migration is recoverable from partial failures:
    // if a previous run crashed after dropping `projects` but before renaming
    // `projects_v3`, this re-run detects the state and continues from there
    // instead of crashing on `INSERT ... FROM projects` when the legacy table
    // no longer exists.
    run: async (database: SqlDatabase) => {
      const hasProjects = await tableExists(database, "projects");
      const hasProjectsV3 = await tableExists(database, "projects_v3");

      if (hasProjects && !hasProjectsV3) {
        // Fresh run: create v3, copy from legacy, drop legacy, rename.
        await database.execute(`CREATE TABLE projects_v3 (
          id TEXT PRIMARY KEY,
          folder_type TEXT NOT NULL DEFAULT 'client',
          is_standardized INTEGER NOT NULL DEFAULT 1,
          folder_name TEXT NOT NULL DEFAULT '',
          folder_path TEXT,
          parsed_date TEXT,
          parsed_client TEXT,
          parsed_project TEXT,
          corrected_client TEXT,
          corrected_project TEXT,
          category TEXT,
          size_bytes INTEGER,
          size_status TEXT NOT NULL,
          current_drive_id TEXT,
          target_drive_id TEXT,
          move_status TEXT NOT NULL,
          missing_status TEXT NOT NULL,
          duplicate_status TEXT NOT NULL,
          is_unassigned INTEGER NOT NULL,
          is_manual INTEGER NOT NULL,
          last_seen_at TEXT,
          last_scanned_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`);
        // Migrate existing records — treat all as 'client' type since they matched the
        // convention at scan time. Reconstruct folder_name from parsed fields.
        await database.execute(`INSERT INTO projects_v3
          SELECT
            id,
            'client' AS folder_type,
            1 AS is_standardized,
            COALESCE(parsed_date || '_' || parsed_client || '_' || parsed_project, id) AS folder_name,
            NULL AS folder_path,
            parsed_date,
            parsed_client,
            parsed_project,
            corrected_client,
            corrected_project,
            category,
            size_bytes,
            size_status,
            current_drive_id,
            target_drive_id,
            move_status,
            missing_status,
            duplicate_status,
            is_unassigned,
            is_manual,
            last_seen_at,
            last_scanned_at,
            created_at,
            updated_at
          FROM projects`);
        await database.execute("DROP TABLE projects");
        await database.execute("ALTER TABLE projects_v3 RENAME TO projects");
      } else if (!hasProjects && hasProjectsV3) {
        // Partial failure recovery: legacy projects was already dropped,
        // rename projects_v3 to complete the migration.
        await database.execute("ALTER TABLE projects_v3 RENAME TO projects");
      } else if (hasProjects && hasProjectsV3) {
        // Unusual partial failure: both tables exist. Drop the new one and
        // restart the full migration path on the next boot by leaving projects
        // alone — but since we're already running, just redo it cleanly.
        await database.execute("DROP TABLE projects_v3");
        await database.execute(`CREATE TABLE projects_v3 (
          id TEXT PRIMARY KEY,
          folder_type TEXT NOT NULL DEFAULT 'client',
          is_standardized INTEGER NOT NULL DEFAULT 1,
          folder_name TEXT NOT NULL DEFAULT '',
          folder_path TEXT,
          parsed_date TEXT,
          parsed_client TEXT,
          parsed_project TEXT,
          corrected_client TEXT,
          corrected_project TEXT,
          category TEXT,
          size_bytes INTEGER,
          size_status TEXT NOT NULL,
          current_drive_id TEXT,
          target_drive_id TEXT,
          move_status TEXT NOT NULL,
          missing_status TEXT NOT NULL,
          duplicate_status TEXT NOT NULL,
          is_unassigned INTEGER NOT NULL,
          is_manual INTEGER NOT NULL,
          last_seen_at TEXT,
          last_scanned_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`);
        await database.execute(`INSERT INTO projects_v3
          SELECT
            id,
            'client' AS folder_type,
            1 AS is_standardized,
            COALESCE(parsed_date || '_' || parsed_client || '_' || parsed_project, id) AS folder_name,
            NULL AS folder_path,
            parsed_date,
            parsed_client,
            parsed_project,
            corrected_client,
            corrected_project,
            category,
            size_bytes,
            size_status,
            current_drive_id,
            target_drive_id,
            move_status,
            missing_status,
            duplicate_status,
            is_unassigned,
            is_manual,
            last_seen_at,
            last_scanned_at,
            created_at,
            updated_at
          FROM projects`);
        await database.execute("DROP TABLE projects");
        await database.execute("ALTER TABLE projects_v3 RENAME TO projects");
      }
      // If neither table exists we're on a completely fresh DB where migration 1
      // hasn't created `projects` yet — this should never happen since migration 1
      // runs first, but noop-ing here is safer than crashing.

      await database.execute(
        "CREATE INDEX IF NOT EXISTS idx_projects_current_drive_id ON projects (current_drive_id)"
      );
      await database.execute(
        "CREATE INDEX IF NOT EXISTS idx_projects_target_drive_id ON projects (target_drive_id)"
      );

      // Add folder_type to scan session projects so scan records carry the classification too.
      // ALTER TABLE ADD COLUMN is not idempotent in SQLite, so guard via pragma.
      const columns = await database.select<{ name: string }>(
        "PRAGMA table_info(scan_session_projects)"
      );
      if (!columns.some((column) => column.name === "folder_type")) {
        await database.execute(
          "ALTER TABLE scan_session_projects ADD COLUMN folder_type TEXT NOT NULL DEFAULT 'client'"
        );
      }
    }
  },
  {
    version: 4,
    // Add corrected_date column — allows users to assign/override a date for any project type.
    // Nullable; null means the parsed date (or folder name for personal_folder) is used.
    // ALTER TABLE ADD COLUMN is not idempotent in SQLite — guard via pragma check.
    run: async (database: SqlDatabase) => {
      const columns = await database.select<{ name: string }>(
        "PRAGMA table_info(projects)"
      );
      if (!columns.some((column) => column.name === "corrected_date")) {
        await database.execute("ALTER TABLE projects ADD COLUMN corrected_date TEXT");
      }
    }
  },
  {
    version: 5,
    // Recreate scan_session_projects to make parsed_date, parsed_client, parsed_project nullable.
    // Migration 1 declared them NOT NULL, but personal_folder scan records correctly produce null
    // for all three fields. Inserting null into a NOT NULL column throws a SQLite constraint
    // violation, breaking scan ingestion for any drive that contains non-standard folders.
    // SQLite does not support ALTER COLUMN, so a table recreation is required.
    // Uses `run` for partial-failure recovery (see migration 3 for rationale).
    //
    // Self-healing against partial-failure states from earlier migrations:
    //   1. Probes the legacy table schema before referencing `folder_type`. Migration 3 owned the
    //      ALTER TABLE ADD COLUMN folder_type, and historical DB states exist where migration 3
    //      was marked applied without its trailing ALTER having executed (e.g., manual repairs).
    //      Hard-coding `COALESCE(folder_type, 'client')` in the SELECT causes prepare-time
    //      failures on those DBs. We build the SELECT dynamically with a literal 'client'
    //      fallback when the legacy column is missing.
    //   2. Verifies legacy vs v5 row counts after copy, BEFORE the destructive DROP TABLE
    //      scan_session_projects. Guards against silent data loss on mid-copy constraint
    //      violations or driver-level truncation.
    run: async (database: SqlDatabase) => {
      const createV5 = `CREATE TABLE scan_session_projects_v5 (
        id TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL,
        folder_name TEXT NOT NULL,
        folder_path TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        folder_type TEXT NOT NULL DEFAULT 'client',
        parsed_date TEXT,
        parsed_client TEXT,
        parsed_project TEXT,
        source_drive_name TEXT NOT NULL,
        scan_timestamp TEXT NOT NULL,
        size_status TEXT NOT NULL,
        size_bytes INTEGER,
        size_error TEXT
      )`;

      const legacyHasColumn = async (columnName: string): Promise<boolean> => {
        const columns = await database.select<{ name: string }>(
          "PRAGMA table_info(scan_session_projects)"
        );
        return columns.some((column) => column.name === columnName);
      };

      const buildCopySql = (legacyHasFolderType: boolean): string => {
        const folderTypeExpr = legacyHasFolderType
          ? "COALESCE(folder_type, 'client')"
          : "'client'";
        return `INSERT INTO scan_session_projects_v5
          SELECT
            id,
            scan_id,
            folder_name,
            folder_path,
            relative_path,
            ${folderTypeExpr} AS folder_type,
            NULLIF(parsed_date, '') AS parsed_date,
            NULLIF(parsed_client, '') AS parsed_client,
            NULLIF(parsed_project, '') AS parsed_project,
            source_drive_name,
            scan_timestamp,
            size_status,
            size_bytes,
            size_error
          FROM scan_session_projects`;
      };

      const countRows = async (tableName: string): Promise<number> => {
        const rows = await database.select<{ count: number }>(
          `SELECT COUNT(*) as count FROM ${tableName}`
        );
        return Number(rows[0]?.count ?? 0);
      };

      const copyLegacyIntoV5 = async (): Promise<void> => {
        const hasFolderType = await legacyHasColumn("folder_type");
        await database.execute(buildCopySql(hasFolderType));
      };

      const verifyCopyOrThrow = async (): Promise<void> => {
        const legacyCount = await countRows("scan_session_projects");
        const v5Count = await countRows("scan_session_projects_v5");
        if (legacyCount !== v5Count) {
          throw new Error(
            `Migration 5 copy verification failed: legacy=${legacyCount} rows, v5=${v5Count} rows. ` +
              `Aborting before DROP TABLE scan_session_projects to preserve legacy data.`
          );
        }
      };

      const hasLegacy = await tableExists(database, "scan_session_projects");
      const hasV5 = await tableExists(database, "scan_session_projects_v5");

      if (hasLegacy && !hasV5) {
        await database.execute(createV5);
        await copyLegacyIntoV5();
        await verifyCopyOrThrow();
        await database.execute("DROP TABLE scan_session_projects");
        await database.execute("ALTER TABLE scan_session_projects_v5 RENAME TO scan_session_projects");
      } else if (!hasLegacy && hasV5) {
        // Partial failure recovery: legacy was dropped, rename v5 to complete.
        await database.execute("ALTER TABLE scan_session_projects_v5 RENAME TO scan_session_projects");
      } else if (hasLegacy && hasV5) {
        // Both exist: drop v5 and redo cleanly.
        await database.execute("DROP TABLE scan_session_projects_v5");
        await database.execute(createV5);
        await copyLegacyIntoV5();
        await verifyCopyOrThrow();
        await database.execute("DROP TABLE scan_session_projects");
        await database.execute("ALTER TABLE scan_session_projects_v5 RENAME TO scan_session_projects");
      }

      await database.execute(
        "CREATE INDEX IF NOT EXISTS idx_scan_session_projects_scan_id ON scan_session_projects (scan_id)"
      );
    }
  },
  {
    version: 6,
    // Add observed_folder_type to project_scan_events so classification drift is detectable.
    // NULL means the event predates this migration (no drift information available).
    // ALTER TABLE ADD COLUMN is not idempotent in SQLite — guard via pragma check.
    run: async (database: SqlDatabase) => {
      const columns = await database.select<{ name: string }>(
        "PRAGMA table_info(project_scan_events)"
      );
      if (!columns.some((column) => column.name === "observed_folder_type")) {
        await database.execute(
          "ALTER TABLE project_scan_events ADD COLUMN observed_folder_type TEXT"
        );
      }
    }
  },
  {
    version: 7,
    // Defensive invariant: `scan_session_projects` MUST have `folder_type`.
    // Migration 3 originally added this column via a trailing ALTER TABLE, but historical DB
    // states exist where migration 3 was marked applied without that ALTER having executed
    // (e.g., manual DB repair during incident response). When that happens, migration 5's
    // table recreation also fails because its INSERT ... SELECT references folder_type.
    //
    // This migration repairs those DBs: it probes the column via PRAGMA table_info and adds
    // it with the safe default when missing. On healthy DBs this is a no-op. It is idempotent
    // and safe to run against any state migration 5 may have left behind.
    run: async (database: SqlDatabase) => {
      // If the table is missing entirely, earlier migrations failed catastrophically and we
      // have nothing safe to repair here — let the downstream scan-ingestion code surface it.
      if (!(await tableExists(database, "scan_session_projects"))) {
        return;
      }
      const columns = await database.select<{ name: string }>(
        "PRAGMA table_info(scan_session_projects)"
      );
      if (!columns.some((column) => column.name === "folder_type")) {
        await database.execute(
          "ALTER TABLE scan_session_projects ADD COLUMN folder_type TEXT NOT NULL DEFAULT 'client'"
        );
      }
    }
  },
  {
    version: 8,
    // Add volume identity columns to drives: stable UUID, last observed mount path, filesystem type.
    // All nullable with no DEFAULT so existing rows stay valid (SQLite fills them with NULL).
    // ALTER TABLE ADD COLUMN is not idempotent in SQLite — guard each add via pragma.
    run: async (database: SqlDatabase) => {
      const addColumnIfMissing = async (tableName: string, columnName: string, definition: string) => {
        const columns = await database.select<{ name: string }>(`PRAGMA table_info(${tableName})`);
        if (!columns.some((col) => col.name === columnName)) {
          await database.execute(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
        }
      };
      await addColumnIfMissing("drives", "volume_uuid", "volume_uuid TEXT");
      await addColumnIfMissing("drives", "mount_path", "mount_path TEXT");
      await addColumnIfMissing("drives", "filesystem", "filesystem TEXT");
    }
  },
  {
    version: 9,
    // Add classifier-output columns to projects, scan_mode to scan_sessions, and create
    // four new tables for the rename, duplicate, metadata, and reporting pipelines.
    // ALTER TABLE ADD COLUMN guards are used throughout (not idempotent in SQLite).
    run: async (database: SqlDatabase) => {
      const addColumnIfMissing = async (tableName: string, columnName: string, definition: string) => {
        const columns = await database.select<{ name: string }>(`PRAGMA table_info(${tableName})`);
        if (!columns.some((col) => col.name === columnName)) {
          await database.execute(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
        }
      };

      // projects — classifier output fields (guard: table may not exist in partial-migration DBs)
      if (await tableExists(database, "projects")) {
        await addColumnIfMissing("projects", "normalized_name", "normalized_name TEXT");
        await addColumnIfMissing("projects", "naming_confidence", "naming_confidence TEXT");
        await addColumnIfMissing("projects", "metadata_status", "metadata_status TEXT");
        await addColumnIfMissing("projects", "partial_hash", "partial_hash TEXT");
      }

      // scan_sessions — scan depth mode (guard: table may not exist in partial-migration DBs)
      if (await tableExists(database, "scan_sessions")) {
        await addColumnIfMissing("scan_sessions", "scan_mode", "scan_mode TEXT");
      }

      // rename_suggestions — proposed canonical renames for legacy/non-standard folders
      await database.execute(`CREATE TABLE IF NOT EXISTS rename_suggestions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        current_name TEXT NOT NULL,
        suggested_name TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
      await database.execute(
        "CREATE INDEX IF NOT EXISTS idx_rename_suggestions_project_id ON rename_suggestions (project_id)"
      );

      // duplicate_candidates — pairs of projects flagged as potential duplicates
      await database.execute(`CREATE TABLE IF NOT EXISTS duplicate_candidates (
        id TEXT PRIMARY KEY,
        project_id_a TEXT NOT NULL,
        project_id_b TEXT NOT NULL,
        match_basis TEXT NOT NULL,
        confidence TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
      await database.execute(
        "CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_project_id_a ON duplicate_candidates (project_id_a)"
      );
      await database.execute(
        "CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_project_id_b ON duplicate_candidates (project_id_b)"
      );

      // metadata_records — sidecar metadata (EXIF, XMP, etc.) extracted per project
      await database.execute(`CREATE TABLE IF NOT EXISTS metadata_records (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        source TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`);
      await database.execute(
        "CREATE INDEX IF NOT EXISTS idx_metadata_records_project_id ON metadata_records (project_id)"
      );

      // csv_reports — generated export reports
      await database.execute(`CREATE TABLE IF NOT EXISTS csv_reports (
        id TEXT PRIMARY KEY,
        report_type TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        row_count INTEGER NOT NULL,
        file_path TEXT,
        created_at TEXT NOT NULL
      )`);
    }
  },
  {
    version: 10,
    // Add naming_status to projects: "valid" | "legacy" | "invalid".
    // Existing rows get NULL (read back as "unknown" by mapProjectRow) until
    // a reclassify pass is run. ALTER TABLE ADD COLUMN is not idempotent in
    // SQLite — guard via tableExists + pragma check.
    run: async (database: SqlDatabase) => {
      if (!(await tableExists(database, "projects"))) return;
      const columns = await database.select<{ name: string }>("PRAGMA table_info(projects)");
      if (!columns.some((col) => col.name === "naming_status")) {
        await database.execute("ALTER TABLE projects ADD COLUMN naming_status TEXT");
      }
    }
  },
  {
    version: 11,
    // Add confidence column to rename_suggestions (Phase 3).
    // The table was created in migration 9 without this column. All existing
    // rows (none in practice — the write service is new in Phase 3) default
    // to "medium". ALTER TABLE ADD COLUMN is not idempotent in SQLite —
    // guard via tableExists + pragma check.
    run: async (database: SqlDatabase) => {
      if (!(await tableExists(database, "rename_suggestions"))) return;
      const columns = await database.select<{ name: string }>("PRAGMA table_info(rename_suggestions)");
      if (!columns.some((col) => col.name === "confidence")) {
        await database.execute(
          "ALTER TABLE rename_suggestions ADD COLUMN confidence TEXT NOT NULL DEFAULT 'medium'"
        );
      }
    }
  },
  {
    version: 12,
    // Time-travel undo for rename suggestions. Captures the previous status
    // each time a suggestion is approved or dismissed so the user can revert
    // a single mistake without regenerating the suggestion. The rename engine
    // never touches the disk, so undo is purely metadata — no filesystem
    // state needs to be restored.
    statements: [
      `CREATE TABLE IF NOT EXISTS rename_undo_history (
        id TEXT PRIMARY KEY,
        suggestion_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        previous_status TEXT NOT NULL,
        applied_status TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_rename_undo_history_applied_at ON rename_undo_history (applied_at DESC)`
    ]
  },
  {
    version: 13,
    // Tracks when the user last visited a project's detail page.
    // Used to populate the "Recent" section in the ⌘K command palette.
    // Append-only — existing rows get NULL and never appear in the recent list.
    // Double-guard: first check the table exists (partial-fixture DBs may have migrations 1-4
    // applied but no projects table), then check the column is not already present.
    run: async (database: SqlDatabase) => {
      const tables = await database.select<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
      );
      if (tables.length === 0) return; // projects table absent in this DB state — skip
      const columns = await database.select<{ name: string }>(
        "PRAGMA table_info(projects)"
      );
      if (!columns.some((c) => c.name === "opened_at")) {
        await database.execute("ALTER TABLE projects ADD COLUMN opened_at TEXT");
      }
    }
  }
];

export class SqliteLocalPersistence implements LocalPersistenceAdapter {
  readonly #loadDatabase: SqliteLocalPersistenceOptions["loadDatabase"];
  readonly #seed: CatalogSnapshot;
  #databasePromise: Promise<SqlDatabase> | null = null;
  #readyPromise: Promise<SqlDatabase> | null = null;

  constructor(options: SqliteLocalPersistenceOptions) {
    this.#loadDatabase = options.loadDatabase;
    this.#seed = normalizeCatalogSnapshot(options.seed);
  }

  async readSnapshot(): Promise<CatalogSnapshot> {
    const database = await this.#ensureReady();
    return this.#readSnapshotFromDatabase(database);
  }

  async replaceSnapshot(snapshot: CatalogSnapshot): Promise<void> {
    const database = await this.#ensureReady();
    await this.#replaceSnapshotInDatabase(database, normalizeCatalogSnapshot(snapshot));
  }

  async listDrives(): Promise<Drive[]> {
    const database = await this.#ensureReady();
    const rows = await database.select<DriveRow>("SELECT * FROM drives ORDER BY display_name ASC");
    return rows.map(mapDriveRow);
  }

  async listProjects(): Promise<Project[]> {
    const database = await this.#ensureReady();
    const rows = await database.select<ProjectRow>(
      "SELECT * FROM projects ORDER BY parsed_date DESC, parsed_client ASC, parsed_project ASC"
    );
    return rows.map(mapProjectRow);
  }

  async listScans(): Promise<ScanRecord[]> {
    const database = await this.#ensureReady();
    const rows = await database.select<ScanRow>("SELECT * FROM scans ORDER BY started_at DESC");
    return rows.map(mapScanRow);
  }

  async listProjectScanEvents(projectId?: string): Promise<ProjectScanEvent[]> {
    const database = await this.#ensureReady();
    const rows = projectId
      ? await database.select<ProjectScanEventRow>(
          "SELECT * FROM project_scan_events WHERE project_id = ? ORDER BY observed_at DESC",
          [projectId]
        )
      : await database.select<ProjectScanEventRow>("SELECT * FROM project_scan_events ORDER BY observed_at DESC");
    return rows.map(mapProjectScanEventRow);
  }

  async listScanSessions(): Promise<ScanSessionSnapshot[]> {
    const database = await this.#ensureReady();
    const [sessions, sessionProjects] = await Promise.all([
      database.select<ScanSessionRow>("SELECT * FROM scan_sessions ORDER BY started_at DESC"),
      database.select<ScanSessionProjectRow>("SELECT * FROM scan_session_projects ORDER BY scan_id ASC, scan_timestamp ASC")
    ]);
    const sessionProjectsByScanId = groupSessionProjects(sessionProjects);
    return sessions.map((row) => mapScanSessionRow(row, sessionProjectsByScanId.get(row.scan_id) ?? []));
  }

  async getDriveById(driveId: string): Promise<Drive | null> {
    const database = await this.#ensureReady();
    const rows = await database.select<DriveRow>("SELECT * FROM drives WHERE id = ? LIMIT 1", [driveId]);
    const drive = rows[0];
    return drive ? mapDriveRow(drive) : null;
  }

  async getProjectById(projectId: string): Promise<Project | null> {
    const database = await this.#ensureReady();
    const rows = await database.select<ProjectRow>("SELECT * FROM projects WHERE id = ? LIMIT 1", [projectId]);
    const project = rows[0];
    return project ? mapProjectRow(project) : null;
  }

  async getScanSession(scanId: string): Promise<ScanSessionSnapshot | null> {
    const database = await this.#ensureReady();
    const [sessions, projects] = await Promise.all([
      database.select<ScanSessionRow>("SELECT * FROM scan_sessions WHERE scan_id = ? LIMIT 1", [scanId]),
      database.select<ScanSessionProjectRow>(
        "SELECT * FROM scan_session_projects WHERE scan_id = ? ORDER BY scan_timestamp ASC",
        [scanId]
      )
    ]);
    const session = sessions[0];
    return session ? mapScanSessionRow(session, groupSessionProjects(projects).get(scanId) ?? []) : null;
  }

  async upsertDrive(drive: Drive): Promise<void> {
    const database = await this.#ensureReady();
    await upsertDriveRow(database, drive);
  }

  async upsertDrives(drives: Drive[]): Promise<void> {
    const database = await this.#ensureReady();
    await withTransaction(database, async () => {
      for (const drive of drives) {
        await upsertDriveRow(database, drive);
      }
    });
  }

  async upsertProject(project: Project): Promise<void> {
    const database = await this.#ensureReady();
    await upsertProjectRow(database, project);
  }

  async upsertProjects(projects: Project[]): Promise<void> {
    const database = await this.#ensureReady();
    await withTransaction(database, async () => {
      for (const project of projects) {
        await upsertProjectRow(database, project);
      }
    });
  }

  async upsertScan(scan: ScanRecord): Promise<void> {
    const database = await this.#ensureReady();
    await upsertScanRow(database, scan);
  }

  async upsertProjectScanEvent(event: ProjectScanEvent): Promise<void> {
    const database = await this.#ensureReady();
    await upsertProjectScanEventRow(database, event);
  }

  async upsertProjectScanEvents(events: ProjectScanEvent[]): Promise<void> {
    const database = await this.#ensureReady();
    await withTransaction(database, async () => {
      for (const event of events) {
        await upsertProjectScanEventRow(database, event);
      }
    });
  }

  async upsertScanSession(session: ScanSessionSnapshot): Promise<void> {
    const database = await this.#ensureReady();
    await withTransaction(database, async () => {
      await writeScanSessionRecord(database, session);
    });
  }

  /**
   * Cascade spec: see `cascadeDelete.ts#applyProjectDeleteToSnapshot`.
   *
   * The SQL below is a SQLite-efficient translation of that pure helper:
   * row-level DELETE statements keyed on `project_id` avoid loading the
   * snapshot into process memory on the hot path. Both paths are locked
   * to identical observable behavior by the shared contract test in
   * `localPersistenceContract.ts` (Pass 7); any divergence between this
   * adapter and the pure helper surfaces as a cross-adapter parity
   * failure there.
   */
  async deleteProject(projectId: string): Promise<void> {
    const database = await this.#ensureReady();
    await withTransaction(database, async () => {
      await database.execute("DELETE FROM project_scan_events WHERE project_id = ?", [projectId]);
      await database.execute("DELETE FROM projects WHERE id = ?", [projectId]);
    });
  }

  async markProjectOpened(projectId: string, openedAt: string): Promise<void> {
    const database = await this.#ensureReady();
    await database.execute(
      "UPDATE projects SET opened_at = ? WHERE id = ?",
      [openedAt, projectId]
    );
  }

  /**
   * Cascade spec: see `cascadeDelete.ts#applyDriveDeleteToSnapshot`.
   *
   * The ordered SQL below is a SQLite-efficient translation of that pure
   * helper. Subquery joins on `scans.drive_id` and
   * `scan_sessions.requested_drive_id` let SQLite cascade without
   * materializing child-id lists in the host process — important because
   * a drive with many scans can produce id lists that exceed SQLite's
   * default 999-parameter limit for `IN (?, ?, …)` bindings.
   *
   * Both paths are locked to identical observable behavior by the shared
   * contract test in `localPersistenceContract.ts` (Pass 7). The H3
   * cascade regression block there exercises this SQL against the same
   * fixture as the InMemory and Storage adapters' delegating
   * implementations.
   *
   * Ordering matters:
   *   1. Nullify `projects.current_drive_id` / `projects.target_drive_id`
   *      — projects survive drive deletion.
   *   2. Delete `project_scan_events` via the scan-level join, THEN the
   *      `scans` rows themselves (child before parent, since no FK
   *      constraint is declared — see Pass 6 audit).
   *   3. Delete `scan_session_projects` via the session-level join, THEN
   *      the `scan_sessions` rows themselves. Sessions with
   *      `requested_drive_id IS NULL` are preserved by the WHERE clause.
   *   4. Finally, the drive row.
   */
  async deleteDrive(driveId: string): Promise<void> {
    const database = await this.#ensureReady();
    await withTransaction(database, async () => {
      // 1. Nullify drive references on projects (projects survive drive deletion).
      await database.execute("UPDATE projects SET current_drive_id = NULL WHERE current_drive_id = ?", [driveId]);
      await database.execute("UPDATE projects SET target_drive_id = NULL WHERE target_drive_id = ?", [driveId]);

      // 2. Cascade scans: delete project_scan_events linked to scans for this drive, then the scans.
      await database.execute(
        "DELETE FROM project_scan_events WHERE scan_id IN (SELECT id FROM scans WHERE drive_id = ?)",
        [driveId]
      );
      await database.execute("DELETE FROM scans WHERE drive_id = ?", [driveId]);

      // 3. Cascade scan_sessions: delete child scan_session_projects first (no FK constraint,
      //    so ordering is up to us), then the parent scan_sessions rows. Ties via
      //    scan_sessions.requested_drive_id — the drive the user targeted when initiating the
      //    scan. Sessions with requested_drive_id = NULL are preserved.
      //
      //    H3 fix: the prior implementation left orphaned scan_session_projects and
      //    scan_sessions rows after drive deletion, diverging from the in-memory/storage
      //    adapter behaviour (which drops the whole ScanSessionSnapshot including its
      //    embedded `projects` array).
      await database.execute(
        "DELETE FROM scan_session_projects WHERE scan_id IN (SELECT scan_id FROM scan_sessions WHERE requested_drive_id = ?)",
        [driveId]
      );
      await database.execute("DELETE FROM scan_sessions WHERE requested_drive_id = ?", [driveId]);

      // 4. Finally, delete the drive row.
      await database.execute("DELETE FROM drives WHERE id = ?", [driveId]);
    });
  }

  async deleteScanSession(scanId: string): Promise<void> {
    const database = await this.#ensureReady();
    await withTransaction(database, async () => {
      // Child rows first — no FK constraint, ordering is up to us.
      await database.execute("DELETE FROM scan_session_projects WHERE scan_id = ?", [scanId]);
      await database.execute("DELETE FROM scan_sessions WHERE scan_id = ?", [scanId]);
    });
  }

  async listRenameSuggestions(): Promise<RenameSuggestion[]> {
    const database = await this.#ensureReady();
    const rows = await database.select<RenameSuggestionRow>(
      "SELECT id, project_id, current_name, suggested_name, reason, confidence, status, created_at, updated_at FROM rename_suggestions ORDER BY created_at DESC"
    );
    return rows.map(mapRenameSuggestionRow);
  }

  async upsertRenameSuggestion(suggestion: RenameSuggestion): Promise<void> {
    const database = await this.#ensureReady();
    await database.execute(
      `INSERT INTO rename_suggestions (id, project_id, current_name, suggested_name, reason, confidence, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         current_name  = excluded.current_name,
         suggested_name = excluded.suggested_name,
         reason        = excluded.reason,
         confidence    = excluded.confidence,
         status        = excluded.status,
         updated_at    = excluded.updated_at`,
      [
        suggestion.id,
        suggestion.projectId,
        suggestion.currentName,
        suggestion.suggestedName,
        suggestion.reason,
        suggestion.confidence,
        suggestion.status,
        suggestion.createdAt,
        suggestion.updatedAt
      ]
    );
  }

  async updateRenameSuggestionStatus(
    id: string,
    status: RenameSuggestionStatus,
    updatedAt: string
  ): Promise<void> {
    const database = await this.#ensureReady();
    await database.execute(
      "UPDATE rename_suggestions SET status = ?, updated_at = ? WHERE id = ?",
      [status, updatedAt, id]
    );
  }

  async recordRenameUndoEntry(entry: RenameUndoEntry): Promise<void> {
    const database = await this.#ensureReady();
    await database.execute(
      `INSERT INTO rename_undo_history
         (id, suggestion_id, project_id, previous_status, applied_status, applied_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         previous_status = excluded.previous_status,
         applied_status  = excluded.applied_status,
         applied_at      = excluded.applied_at`,
      [
        entry.id,
        entry.suggestionId,
        entry.projectId,
        entry.previousStatus,
        entry.appliedStatus,
        entry.appliedAt
      ]
    );
  }

  async getLatestRenameUndoEntry(): Promise<RenameUndoEntry | null> {
    const database = await this.#ensureReady();
    const rows = await database.select<{
      id: string;
      suggestion_id: string;
      project_id: string;
      previous_status: string;
      applied_status: string;
      applied_at: string;
    }>(
      "SELECT id, suggestion_id, project_id, previous_status, applied_status, applied_at FROM rename_undo_history ORDER BY applied_at DESC LIMIT 1"
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      suggestionId: row.suggestion_id,
      projectId: row.project_id,
      previousStatus: row.previous_status as RenameSuggestionStatus,
      appliedStatus: row.applied_status as RenameSuggestionStatus,
      appliedAt: row.applied_at
    };
  }

  async deleteRenameUndoEntry(id: string): Promise<void> {
    const database = await this.#ensureReady();
    await database.execute("DELETE FROM rename_undo_history WHERE id = ?", [id]);
  }

  async #ensureReady() {
    if (!this.#readyPromise) {
      this.#readyPromise = (async () => {
        const database = await this.#getDatabase();
        // Pass 6 / Pass 8 note: this pragma is currently a NO-OP.
        //
        // SQLite's `foreign_keys` pragma only takes effect for constraints
        // declared with `REFERENCES ... ON DELETE ...` in a CREATE TABLE
        // statement. Our schema (see `migrations` above) declares no FK
        // constraints on any table, so turning the pragma on has no
        // behavioural consequence today.
        //
        // It is kept deliberately so that if a future migration adds
        // `REFERENCES` clauses, the enforcement switch is already in the
        // right position at connection open and we do not have to audit
        // whether every code path re-enables it on reconnect.
        //
        // The live cascade contract is instead enforced in two layers:
        //   1. `cascadeDelete.ts` — pure snapshot transforms that are the
        //      single authoritative specification for `deleteDrive` /
        //      `deleteProject` across the two adapters (Pass 7).
        //   2. `localPersistenceContract.ts` — shared cross-adapter test
        //      suite that runs the same delete-cascade fixture against
        //      InMemory and SQLite, so any drift between the pure helper
        //      and this file's SQL translation surfaces immediately.
        //
        // The remote tier (Supabase / Postgres) DOES enforce FKs; the
        // rejection path is exercised in `supabaseSyncAdapter.test.ts`.
        // Any local orphan introduced by a future regression would
        // surface there as a push-time error rather than silently
        // corrupting the remote.
        await database.execute("PRAGMA foreign_keys = ON");
        await this.#runMigrations(database);

        if (await this.#isEmpty(database)) {
          await this.#replaceSnapshotInDatabase(database, this.#seed);
        }

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

  async #runMigrations(database: SqlDatabase) {
    await database.execute(
      "CREATE TABLE IF NOT EXISTS catalog_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)"
    );

    const appliedRows = await database.select<{ version: number }>(
      "SELECT version FROM catalog_migrations ORDER BY version ASC"
    );
    const appliedVersions = new Set(appliedRows.map((row) => Number(row.version)));

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        continue;
      }

      // Run each statement individually. DDL statements in SQLite are auto-committed
      // by the tauri-plugin-sql layer even inside an explicit BEGIN/COMMIT, so we
      // execute them one-by-one and only mark the migration as applied after all
      // statements succeed. Migrations must be idempotent against partial failures:
      // plain `statements` should use CREATE TABLE IF NOT EXISTS / DROP TABLE IF EXISTS
      // guards; complex table-recreation migrations should use `run` with explicit
      // state checks via `tableExists`.
      if (migration.statements) {
        for (const statement of migration.statements) {
          await database.execute(statement);
        }
      }

      if (migration.run) {
        await migration.run(database);
      }

      await database.execute(
        "INSERT OR IGNORE INTO catalog_migrations (version, applied_at) VALUES (?, ?)",
        [migration.version, new Date().toISOString()]
      );
    }
  }

  async #isEmpty(database: SqlDatabase) {
    const rows = await database.select<{ count: number }>(
      "SELECT COUNT(*) as count FROM drives"
    );
    return Number(rows[0]?.count ?? 0) === 0;
  }

  async #readSnapshotFromDatabase(database: SqlDatabase): Promise<CatalogSnapshot> {
    const [drives, projects, scans, projectScanEvents, scanSessions, scanSessionProjects] = await Promise.all([
      database.select<DriveRow>("SELECT * FROM drives ORDER BY display_name ASC"),
      database.select<ProjectRow>("SELECT * FROM projects ORDER BY parsed_date DESC, parsed_client ASC, parsed_project ASC"),
      database.select<ScanRow>("SELECT * FROM scans ORDER BY started_at DESC"),
      database.select<ProjectScanEventRow>("SELECT * FROM project_scan_events ORDER BY observed_at DESC"),
      database.select<ScanSessionRow>("SELECT * FROM scan_sessions ORDER BY started_at DESC"),
      database.select<ScanSessionProjectRow>("SELECT * FROM scan_session_projects ORDER BY scan_id ASC, scan_timestamp ASC")
    ]);

    const sessionProjectsByScanId = groupSessionProjects(scanSessionProjects);

    return normalizeCatalogSnapshot({
      drives: drives.map(mapDriveRow),
      projects: projects.map(mapProjectRow),
      scans: scans.map(mapScanRow),
      projectScanEvents: projectScanEvents.map(mapProjectScanEventRow),
      scanSessions: scanSessions.map((row) => mapScanSessionRow(row, sessionProjectsByScanId.get(row.scan_id) ?? []))
    });
  }

  async #replaceSnapshotInDatabase(database: SqlDatabase, snapshot: CatalogSnapshot) {
    await withTransaction(database, async () => {
      await database.execute("DELETE FROM scan_session_projects");
      await database.execute("DELETE FROM scan_sessions");
      await database.execute("DELETE FROM project_scan_events");
      await database.execute("DELETE FROM scans");
      await database.execute("DELETE FROM projects");
      await database.execute("DELETE FROM drives");

      for (const drive of snapshot.drives) {
        await upsertDriveRow(database, drive);
      }

      for (const project of snapshot.projects) {
        await upsertProjectRow(database, project);
      }

      for (const scan of snapshot.scans) {
        await upsertScanRow(database, scan);
      }

      for (const event of snapshot.projectScanEvents) {
        await upsertProjectScanEventRow(database, event);
      }

      for (const session of snapshot.scanSessions) {
        await writeScanSessionRecord(database, session);
      }
    });
  }
}

type DriveRow = {
  id: string;
  volume_name: string;
  display_name: string;
  total_capacity_bytes: number | null;
  used_bytes: number | null;
  free_bytes: number | null;
  reserved_incoming_bytes: number;
  last_scanned_at: string | null;
  created_manually: number;
  created_at: string;
  updated_at: string;
  // Migration 8 columns — NULL on rows that predate the migration
  volume_uuid: string | null;
  mount_path: string | null;
  filesystem: string | null;
};

type ProjectRow = {
  id: string;
  folder_type: string;
  is_standardized: number;
  folder_name: string;
  folder_path: string | null;
  parsed_date: string | null;
  parsed_client: string | null;
  parsed_project: string | null;
  corrected_date: string | null;
  corrected_client: string | null;
  corrected_project: string | null;
  category: string | null;
  size_bytes: number | null;
  size_status: "unknown" | "pending" | "ready" | "failed";
  current_drive_id: string | null;
  target_drive_id: string | null;
  move_status: "none" | "pending";
  missing_status: "normal" | "missing";
  duplicate_status: "normal" | "duplicate";
  is_unassigned: number;
  is_manual: number;
  last_seen_at: string | null;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
  // Migration 9 columns — NULL on rows that predate the migration
  normalized_name: string | null;
  naming_confidence: string | null;
  metadata_status: string | null;
  partial_hash: string | null;
  // Migration 10 columns — NULL on rows that predate the migration
  naming_status: string | null;
  // Migration 13 columns — NULL on rows that predate the migration or were never visited
  opened_at: string | null;
};

type RenameSuggestionRow = {
  id: string;
  project_id: string;
  current_name: string;
  suggested_name: string;
  reason: string;
  // Migration 11 column — DEFAULT 'medium' on rows that predate the column
  confidence: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type ScanRow = {
  id: string;
  drive_id: string | null;
  started_at: string;
  finished_at: string | null;
  status: "running" | "completed" | "cancelled" | "failed" | "interrupted";
  folders_scanned: number;
  matches_found: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectScanEventRow = {
  id: string;
  project_id: string;
  scan_id: string;
  observed_folder_name: string;
  observed_drive_name: string;
  observed_folder_type: string | null;
  observed_at: string;
  created_at: string;
  updated_at: string;
};

type ScanSessionRow = {
  scan_id: string;
  root_path: string;
  drive_name: string;
  status: "running" | "completed" | "cancelled" | "failed" | "interrupted";
  started_at: string;
  finished_at: string | null;
  folders_scanned: number;
  matches_found: number;
  error: string | null;
  size_jobs_pending: number;
  requested_drive_id: string | null;
  requested_drive_name: string | null;
  summary_new_projects_count: number | null;
  summary_updated_projects_count: number | null;
  summary_missing_projects_count: number | null;
  summary_duplicates_flagged_count: number | null;
  summary_duration_ms: number | null;
  created_at: string;
  updated_at: string;
  // Migration 9 column — NULL on rows that predate the migration
  scan_mode: string | null;
};

type ScanSessionProjectRow = {
  id: string;
  scan_id: string;
  folder_name: string;
  folder_path: string;
  relative_path: string;
  folder_type: string;
  parsed_date: string | null;
  parsed_client: string | null;
  parsed_project: string | null;
  source_drive_name: string;
  scan_timestamp: string;
  size_status: "unknown" | "pending" | "ready" | "failed";
  size_bytes: number | null;
  size_error: string | null;
};

function mapDriveRow(row: DriveRow): Drive {
  return {
    id: row.id,
    volumeName: row.volume_name,
    displayName: row.display_name,
    totalCapacityBytes: row.total_capacity_bytes,
    usedBytes: row.used_bytes,
    freeBytes: row.free_bytes,
    reservedIncomingBytes: row.reserved_incoming_bytes,
    lastScannedAt: row.last_scanned_at,
    createdManually: fromSqlBoolean(row.created_manually),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    volumeUuid: row.volume_uuid ?? null,
    mountPath: row.mount_path ?? null,
    filesystem: row.filesystem ?? null
  };
}

function mapProjectRow(row: ProjectRow): Project {
  return {
    id: row.id,
    folderType: row.folder_type as FolderType,
    isStandardized: fromSqlBoolean(row.is_standardized),
    folderName: row.folder_name,
    folderPath: row.folder_path,
    parsedDate: row.parsed_date,
    parsedClient: row.parsed_client,
    parsedProject: row.parsed_project,
    correctedDate: row.corrected_date,
    correctedClient: row.corrected_client,
    correctedProject: row.corrected_project,
    category: row.category as Category | null,
    sizeBytes: row.size_bytes,
    sizeStatus: row.size_status,
    currentDriveId: row.current_drive_id,
    targetDriveId: row.target_drive_id,
    moveStatus: row.move_status,
    missingStatus: row.missing_status,
    duplicateStatus: row.duplicate_status,
    isUnassigned: fromSqlBoolean(row.is_unassigned),
    isManual: fromSqlBoolean(row.is_manual),
    lastSeenAt: row.last_seen_at,
    lastScannedAt: row.last_scanned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    normalizedName: row.normalized_name ?? null,
    namingConfidence: (row.naming_confidence ?? null) as "high" | "medium" | "low" | null,
    metadataStatus: (row.metadata_status ?? null) as "pending" | "complete" | "error" | null,
    partialHash: row.partial_hash ?? null,
    namingStatus: row.naming_status === null || row.naming_status === undefined
      ? "unknown"
      : (row.naming_status as "valid" | "legacy" | "invalid" | "unknown"),
    openedAt: row.opened_at ?? null
  };
}

function mapScanRow(row: ScanRow) {
  return {
    id: row.id,
    driveId: row.drive_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    foldersScanned: row.folders_scanned,
    matchesFound: row.matches_found,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapProjectScanEventRow(row: ProjectScanEventRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    scanId: row.scan_id,
    observedFolderName: row.observed_folder_name,
    observedDriveName: row.observed_drive_name,
    observedFolderType: (row.observed_folder_type as FolderType | null) ?? null,
    observedAt: row.observed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRenameSuggestionRow(row: RenameSuggestionRow): RenameSuggestion {
  return {
    id: row.id,
    projectId: row.project_id,
    currentName: row.current_name,
    suggestedName: row.suggested_name,
    reason: row.reason,
    confidence: (row.confidence ?? "medium") as RenameSuggestion["confidence"],
    status: row.status as RenameSuggestion["status"],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapScanSessionRow(row: ScanSessionRow, projects: ScanProjectRecord[]): ScanSessionSnapshot {
  return {
    scanId: row.scan_id,
    rootPath: row.root_path,
    driveName: row.drive_name,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    foldersScanned: row.folders_scanned,
    matchesFound: row.matches_found,
    error: row.error,
    sizeJobsPending: row.size_jobs_pending,
    projects,
    requestedDriveId: row.requested_drive_id,
    requestedDriveName: row.requested_drive_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scanMode: (row.scan_mode ?? undefined) as ScanSessionSnapshot["scanMode"],
    summary: row.summary_new_projects_count === null
      ? null
      : {
          newProjectsCount: row.summary_new_projects_count,
          updatedProjectsCount: row.summary_updated_projects_count ?? 0,
          missingProjectsCount: row.summary_missing_projects_count ?? 0,
          duplicatesFlaggedCount: row.summary_duplicates_flagged_count ?? 0,
          durationMs: row.summary_duration_ms
        }
  };
}

function groupSessionProjects(rows: ScanSessionProjectRow[]) {
  const grouped = new Map<string, ScanProjectRecord[]>();

  for (const row of rows) {
    const projects = grouped.get(row.scan_id) ?? [];
    projects.push({
      id: row.id,
      folderName: row.folder_name,
      folderPath: row.folder_path,
      relativePath: row.relative_path,
      folderType: row.folder_type as FolderType,
      parsedDate: row.parsed_date,
      parsedClient: row.parsed_client,
      parsedProject: row.parsed_project,
      sourceDriveName: row.source_drive_name,
      scanTimestamp: row.scan_timestamp,
      sizeStatus: row.size_status,
      sizeBytes: row.size_bytes,
      sizeError: row.size_error
    });
    grouped.set(row.scan_id, projects);
  }

  return grouped;
}

function toSqlBoolean(value: boolean) {
  return value ? 1 : 0;
}

function fromSqlBoolean(value: number) {
  return value === 1;
}

async function upsertDriveRow(database: SqlDatabase, drive: Drive) {
  await database.execute(
    `INSERT INTO drives (
      id, volume_name, display_name, total_capacity_bytes, used_bytes, free_bytes,
      reserved_incoming_bytes, last_scanned_at, created_manually, created_at, updated_at,
      volume_uuid, mount_path, filesystem
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      volume_name = excluded.volume_name,
      display_name = excluded.display_name,
      total_capacity_bytes = excluded.total_capacity_bytes,
      used_bytes = excluded.used_bytes,
      free_bytes = excluded.free_bytes,
      reserved_incoming_bytes = excluded.reserved_incoming_bytes,
      last_scanned_at = excluded.last_scanned_at,
      created_manually = excluded.created_manually,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      volume_uuid = excluded.volume_uuid,
      mount_path = excluded.mount_path,
      filesystem = excluded.filesystem`,
    [
      drive.id,
      drive.volumeName,
      drive.displayName,
      drive.totalCapacityBytes,
      drive.usedBytes,
      drive.freeBytes,
      drive.reservedIncomingBytes,
      drive.lastScannedAt,
      toSqlBoolean(drive.createdManually),
      drive.createdAt,
      drive.updatedAt,
      drive.volumeUuid ?? null,
      drive.mountPath ?? null,
      drive.filesystem ?? null
    ]
  );
}

async function upsertProjectRow(database: SqlDatabase, project: Project) {
  // Defensive defaults for every NOT NULL column. SQLite's column-level DEFAULT
  // is ignored when NULL is bound explicitly, so we have to materialise these
  // values here or the INSERT fails with (code: 1299) NOT NULL constraint.
  const nowIso = new Date().toISOString();
  const createdAt = project.createdAt ?? nowIso;
  const updatedAt = project.updatedAt ?? nowIso;
  await database.execute(
    `INSERT INTO projects (
      id, folder_type, is_standardized, folder_name, folder_path,
      parsed_date, parsed_client, parsed_project, corrected_date, corrected_client, corrected_project,
      category, size_bytes, size_status, current_drive_id, target_drive_id, move_status,
      missing_status, duplicate_status, is_unassigned, is_manual, last_seen_at, last_scanned_at,
      created_at, updated_at,
      normalized_name, naming_confidence, metadata_status, partial_hash, naming_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      folder_type = excluded.folder_type,
      is_standardized = excluded.is_standardized,
      folder_name = excluded.folder_name,
      folder_path = excluded.folder_path,
      parsed_date = excluded.parsed_date,
      parsed_client = excluded.parsed_client,
      parsed_project = excluded.parsed_project,
      corrected_date = excluded.corrected_date,
      corrected_client = excluded.corrected_client,
      corrected_project = excluded.corrected_project,
      category = excluded.category,
      size_bytes = excluded.size_bytes,
      size_status = excluded.size_status,
      current_drive_id = excluded.current_drive_id,
      target_drive_id = excluded.target_drive_id,
      move_status = excluded.move_status,
      missing_status = excluded.missing_status,
      duplicate_status = excluded.duplicate_status,
      is_unassigned = excluded.is_unassigned,
      is_manual = excluded.is_manual,
      last_seen_at = excluded.last_seen_at,
      last_scanned_at = excluded.last_scanned_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      normalized_name = excluded.normalized_name,
      naming_confidence = excluded.naming_confidence,
      metadata_status = excluded.metadata_status,
      partial_hash = excluded.partial_hash,
      naming_status = excluded.naming_status
      -- opened_at intentionally excluded: written only by markProjectOpened`,
    [
      project.id,
      project.folderType ?? 'client',
      toSqlBoolean(project.isStandardized ?? true),
      project.folderName ?? '',
      project.folderPath,
      project.parsedDate,
      project.parsedClient,
      project.parsedProject,
      project.correctedDate,
      project.correctedClient,
      project.correctedProject,
      project.category,
      project.sizeBytes,
      project.sizeStatus ?? 'pending',
      project.currentDriveId,
      project.targetDriveId,
      project.moveStatus ?? 'none',
      project.missingStatus ?? 'normal',
      project.duplicateStatus ?? 'normal',
      toSqlBoolean(project.isUnassigned ?? false),
      toSqlBoolean(project.isManual ?? false),
      project.lastSeenAt,
      project.lastScannedAt,
      createdAt,
      updatedAt,
      project.normalizedName ?? null,
      project.namingConfidence ?? null,
      project.metadataStatus ?? null,
      project.partialHash ?? null,
      project.namingStatus === "unknown" ? null : (project.namingStatus ?? null)
    ]
  );
}

async function upsertScanRow(database: SqlDatabase, scan: ScanRecord) {
  await database.execute(
    `INSERT INTO scans (
      id, drive_id, started_at, finished_at, status, folders_scanned, matches_found, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      drive_id = excluded.drive_id,
      started_at = excluded.started_at,
      finished_at = excluded.finished_at,
      status = excluded.status,
      folders_scanned = excluded.folders_scanned,
      matches_found = excluded.matches_found,
      notes = excluded.notes,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at`,
    [
      scan.id,
      scan.driveId,
      scan.startedAt,
      scan.finishedAt,
      scan.status,
      scan.foldersScanned,
      scan.matchesFound,
      scan.notes,
      scan.createdAt,
      scan.updatedAt
    ]
  );
}

async function upsertProjectScanEventRow(database: SqlDatabase, event: ProjectScanEvent) {
  await database.execute(
    `INSERT INTO project_scan_events (
      id, project_id, scan_id, observed_folder_name, observed_drive_name, observed_folder_type, observed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      scan_id = excluded.scan_id,
      observed_folder_name = excluded.observed_folder_name,
      observed_drive_name = excluded.observed_drive_name,
      observed_folder_type = excluded.observed_folder_type,
      observed_at = excluded.observed_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at`,
    [
      event.id,
      event.projectId,
      event.scanId,
      event.observedFolderName,
      event.observedDriveName,
      event.observedFolderType,
      event.observedAt,
      event.createdAt,
      event.updatedAt
    ]
  );
}

async function writeScanSessionRecord(database: SqlDatabase, session: ScanSessionSnapshot) {
  await database.execute(
      `INSERT INTO scan_sessions (
        scan_id, root_path, drive_name, status, started_at, finished_at,
        folders_scanned, matches_found, error, size_jobs_pending,
        requested_drive_id, requested_drive_name,
        summary_new_projects_count, summary_updated_projects_count,
        summary_missing_projects_count, summary_duplicates_flagged_count, summary_duration_ms,
        created_at, updated_at, scan_mode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(scan_id) DO UPDATE SET
        root_path = excluded.root_path,
        drive_name = excluded.drive_name,
        status = excluded.status,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        folders_scanned = excluded.folders_scanned,
        matches_found = excluded.matches_found,
        error = excluded.error,
        size_jobs_pending = excluded.size_jobs_pending,
        requested_drive_id = excluded.requested_drive_id,
        requested_drive_name = excluded.requested_drive_name,
        summary_new_projects_count = excluded.summary_new_projects_count,
        summary_updated_projects_count = excluded.summary_updated_projects_count,
        summary_missing_projects_count = excluded.summary_missing_projects_count,
        summary_duplicates_flagged_count = excluded.summary_duplicates_flagged_count,
        summary_duration_ms = excluded.summary_duration_ms,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        scan_mode = excluded.scan_mode`,
      [
        session.scanId,
        session.rootPath,
        session.driveName,
        session.status,
        session.startedAt,
        session.finishedAt,
        session.foldersScanned,
        session.matchesFound,
        session.error,
        session.sizeJobsPending,
        session.requestedDriveId ?? null,
        session.requestedDriveName ?? null,
        session.summary?.newProjectsCount ?? null,
        session.summary?.updatedProjectsCount ?? null,
        session.summary?.missingProjectsCount ?? null,
        session.summary?.duplicatesFlaggedCount ?? null,
        session.summary?.durationMs ?? null,
        session.createdAt,
        session.updatedAt,
        session.scanMode ?? null
      ]
    );

  await database.execute("DELETE FROM scan_session_projects WHERE scan_id = ?", [session.scanId]);

  for (const project of session.projects) {
    await database.execute(
      `INSERT INTO scan_session_projects (
        id, scan_id, folder_name, folder_path, relative_path, folder_type, parsed_date,
        parsed_client, parsed_project, source_drive_name, scan_timestamp,
        size_status, size_bytes, size_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project.id,
        session.scanId,
        project.folderName,
        project.folderPath,
        project.relativePath,
        project.folderType,
        project.parsedDate,
        project.parsedClient,
        project.parsedProject,
        project.sourceDriveName,
        project.scanTimestamp,
        project.sizeStatus,
        project.sizeBytes,
        project.sizeError
      ]
    );
  }
}

/**
 * Wraps a sequence of DML statements (INSERT / UPDATE / DELETE) in a single transaction.
 *
 * **DDL WARNING**: This helper does NOT protect DDL statements (CREATE / ALTER / DROP / RENAME).
 * The `tauri-plugin-sql` layer — and SQLite itself in certain pragma combinations — auto-commits
 * DDL mid-transaction, which means a ROLLBACK will NOT revert schema changes executed inside
 * the operation callback. If you need atomic schema changes, you must model recovery explicitly
 * (see migrations 3 and 5 for the canonical pattern: guarded `tableExists` / `PRAGMA table_info`
 * checks plus post-copy row-count verification before any destructive step).
 *
 * Use this helper only for DML batches — granular upserts, cascading deletes, scan session
 * rewrites. Do not place migration logic or any DDL inside the operation.
 */
async function withTransaction(database: SqlDatabase, operation: () => Promise<void>) {
  await database.execute("BEGIN IMMEDIATE TRANSACTION");

  try {
    await operation();
    await database.execute("COMMIT");
  } catch (error) {
    await database.execute("ROLLBACK");
    throw error;
  }
}
