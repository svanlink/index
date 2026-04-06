import type {
  Category,
  Drive,
  Project,
  ProjectScanEvent,
  ScanProjectRecord,
  ScanRecord,
  ScanSessionSnapshot
} from "@drive-project-catalog/domain";
import type { CatalogSnapshot, LocalPersistenceAdapter } from "./localPersistence";
import type { StorageLike } from "./storageLocalPersistence";
import { normalizeCatalogSnapshot, parseStoredCatalogSnapshot } from "./storageLocalPersistence";

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
  legacyStorage?: StorageLike;
  legacyStorageKey?: string;
}

interface Migration {
  version: number;
  statements: string[];
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
    statements: [
      `ALTER TABLE scans ADD COLUMN created_at TEXT`,
      `ALTER TABLE scans ADD COLUMN updated_at TEXT`,
      `UPDATE scans SET created_at = COALESCE(created_at, started_at), updated_at = COALESCE(updated_at, finished_at, started_at)`,
      `ALTER TABLE project_scan_events ADD COLUMN created_at TEXT`,
      `ALTER TABLE project_scan_events ADD COLUMN updated_at TEXT`,
      `UPDATE project_scan_events SET created_at = COALESCE(created_at, observed_at), updated_at = COALESCE(updated_at, observed_at)`,
      `ALTER TABLE scan_sessions ADD COLUMN created_at TEXT`,
      `ALTER TABLE scan_sessions ADD COLUMN updated_at TEXT`,
      `UPDATE scan_sessions SET created_at = COALESCE(created_at, started_at), updated_at = COALESCE(updated_at, finished_at, started_at)`
    ]
  }
];

export class SqliteLocalPersistence implements LocalPersistenceAdapter {
  readonly #loadDatabase: SqliteLocalPersistenceOptions["loadDatabase"];
  readonly #seed: CatalogSnapshot;
  readonly #legacyStorage?: StorageLike;
  readonly #legacyStorageKey?: string;
  #databasePromise: Promise<SqlDatabase> | null = null;
  #readyPromise: Promise<SqlDatabase> | null = null;

  constructor(options: SqliteLocalPersistenceOptions) {
    this.#loadDatabase = options.loadDatabase;
    this.#seed = normalizeCatalogSnapshot(options.seed);
    this.#legacyStorage = options.legacyStorage;
    this.#legacyStorageKey = options.legacyStorageKey;
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

  async #ensureReady() {
    if (!this.#readyPromise) {
      this.#readyPromise = (async () => {
        const database = await this.#getDatabase();
        await database.execute("PRAGMA foreign_keys = ON");
        await this.#runMigrations(database);

        if (await this.#isEmpty(database)) {
          const legacySnapshot = this.#readLegacySnapshot();
          const initialSnapshot = legacySnapshot ?? this.#seed;
          await this.#replaceSnapshotInDatabase(database, initialSnapshot);
          if (legacySnapshot) {
            this.#legacyStorage?.removeItem?.(this.#legacyStorageKey!);
          }
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

  #readLegacySnapshot() {
    if (!this.#legacyStorage || !this.#legacyStorageKey) {
      return null;
    }

    return parseStoredCatalogSnapshot(this.#legacyStorage.getItem(this.#legacyStorageKey));
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

      await withTransaction(database, async () => {
        for (const statement of migration.statements) {
          await database.execute(statement);
        }

        await database.execute(
          "INSERT INTO catalog_migrations (version, applied_at) VALUES (?, ?)",
          [migration.version, new Date().toISOString()]
        );
      });
    }
  }

  async #isEmpty(database: SqlDatabase) {
    const tables = [
      "drives",
      "projects",
      "scans",
      "project_scan_events",
      "scan_sessions",
      "scan_session_projects"
    ];

    for (const table of tables) {
      const rows = await database.select<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${table}`
      );
      if (Number(rows[0]?.count ?? 0) > 0) {
        return false;
      }
    }

    return true;
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
};

type ProjectRow = {
  id: string;
  parsed_date: string;
  parsed_client: string;
  parsed_project: string;
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
};

type ScanSessionProjectRow = {
  id: string;
  scan_id: string;
  folder_name: string;
  folder_path: string;
  relative_path: string;
  parsed_date: string;
  parsed_client: string;
  parsed_project: string;
  source_drive_name: string;
  scan_timestamp: string;
  size_status: "unknown" | "pending" | "ready" | "failed";
  size_bytes: number | null;
  size_error: string | null;
};

function mapDriveRow(row: DriveRow) {
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
    updatedAt: row.updated_at
  };
}

function mapProjectRow(row: ProjectRow) {
  return {
    id: row.id,
    parsedDate: row.parsed_date,
    parsedClient: row.parsed_client,
    parsedProject: row.parsed_project,
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
    updatedAt: row.updated_at
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
    notes: row.notes
    ,
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
    observedAt: row.observed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapScanSessionRow(row: ScanSessionRow, projects: ScanProjectRecord[]) {
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
      reserved_incoming_bytes, last_scanned_at, created_manually, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      updated_at = excluded.updated_at`,
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
      drive.updatedAt
    ]
  );
}

async function upsertProjectRow(database: SqlDatabase, project: Project) {
  await database.execute(
    `INSERT INTO projects (
      id, parsed_date, parsed_client, parsed_project, corrected_client, corrected_project,
      category, size_bytes, size_status, current_drive_id, target_drive_id, move_status,
      missing_status, duplicate_status, is_unassigned, is_manual, last_seen_at, last_scanned_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      parsed_date = excluded.parsed_date,
      parsed_client = excluded.parsed_client,
      parsed_project = excluded.parsed_project,
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
      updated_at = excluded.updated_at`,
    [
      project.id,
      project.parsedDate,
      project.parsedClient,
      project.parsedProject,
      project.correctedClient,
      project.correctedProject,
      project.category,
      project.sizeBytes,
      project.sizeStatus,
      project.currentDriveId,
      project.targetDriveId,
      project.moveStatus,
      project.missingStatus,
      project.duplicateStatus,
      toSqlBoolean(project.isUnassigned),
      toSqlBoolean(project.isManual),
      project.lastSeenAt,
      project.lastScannedAt,
      project.createdAt,
      project.updatedAt
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
      id, project_id, scan_id, observed_folder_name, observed_drive_name, observed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      scan_id = excluded.scan_id,
      observed_folder_name = excluded.observed_folder_name,
      observed_drive_name = excluded.observed_drive_name,
      observed_at = excluded.observed_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at`,
    [
      event.id,
      event.projectId,
      event.scanId,
      event.observedFolderName,
      event.observedDriveName,
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
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        updated_at = excluded.updated_at`,
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
        session.updatedAt
      ]
    );

  await database.execute("DELETE FROM scan_session_projects WHERE scan_id = ?", [session.scanId]);

  for (const project of session.projects) {
    await database.execute(
      `INSERT INTO scan_session_projects (
        id, scan_id, folder_name, folder_path, relative_path, parsed_date,
        parsed_client, parsed_project, source_drive_name, scan_timestamp,
        size_status, size_bytes, size_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project.id,
        session.scanId,
        project.folderName,
        project.folderPath,
        project.relativePath,
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
