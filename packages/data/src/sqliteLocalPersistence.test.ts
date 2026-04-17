import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { describeLocalPersistenceContract } from "./localPersistenceContract";
import { mockCatalogSnapshot } from "./testing/mockData";
import { SqliteLocalPersistence, type SqlDatabase } from "./sqliteLocalPersistence";

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

  it("persists a personal_folder scan session record with null parsed fields — Migration 5 constraint fix", async () => {
    // Regression test: Migration 1 declared parsed_date/client/project as NOT NULL.
    // personal_folder records have null for all three. Migration 5 makes them nullable.
    // This test fails if Migration 5 is absent or incorrect.
    const databasePath = createTempDatabasePath();
    const persistence = createPersistence(databasePath);

    const sessionWithPersonalFolders = {
      scanId: "scan-personal-folder-regression",
      rootPath: "/Volumes/TestDrive",
      driveName: "TestDrive",
      requestedDriveId: null,
      requestedDriveName: null,
      status: "completed" as const,
      startedAt: "2026-04-08T10:00:00.000Z",
      finishedAt: "2026-04-08T10:05:00.000Z",
      foldersScanned: 3,
      matchesFound: 3,
      error: null,
      sizeJobsPending: 0,
      createdAt: "2026-04-08T10:00:00.000Z",
      updatedAt: "2026-04-08T10:05:00.000Z",
      summary: null,
      projects: [
        {
          id: "scan-personal-folder-regression-project-1",
          folderType: "personal_folder" as const,
          folderName: "Tutorials",
          folderPath: "/Volumes/TestDrive/Tutorials",
          relativePath: "Tutorials",
          parsedDate: null,   // ← previously violated NOT NULL constraint
          parsedClient: null, // ← previously violated NOT NULL constraint
          parsedProject: null, // ← previously violated NOT NULL constraint
          sourceDriveName: "TestDrive",
          scanTimestamp: "2026-04-08T10:01:00.000Z",
          sizeStatus: "ready" as const,
          sizeBytes: 500_000,
          sizeError: null
        },
        {
          id: "scan-personal-folder-regression-project-2",
          folderType: "client" as const,
          folderName: "240401_Apple_ProductShoot",
          folderPath: "/Volumes/TestDrive/240401_Apple_ProductShoot",
          relativePath: "240401_Apple_ProductShoot",
          parsedDate: "240401",
          parsedClient: "Apple",
          parsedProject: "ProductShoot",
          sourceDriveName: "TestDrive",
          scanTimestamp: "2026-04-08T10:02:00.000Z",
          sizeStatus: "ready" as const,
          sizeBytes: 1_000_000,
          sizeError: null
        }
      ]
    };

    // Must not throw a SQLite constraint violation
    await expect(persistence.upsertScanSession(sessionWithPersonalFolders)).resolves.not.toThrow();

    // Verify the records are readable and nulls are preserved
    const sessions = await persistence.listScanSessions();
    const stored = sessions.find((s) => s.scanId === "scan-personal-folder-regression");
    expect(stored).toBeDefined();
    expect(stored!.projects).toHaveLength(2);

    const personal = stored!.projects.find((p) => p.folderName === "Tutorials");
    expect(personal?.folderType).toBe("personal_folder");
    expect(personal?.parsedDate).toBeNull();
    expect(personal?.parsedClient).toBeNull();
    expect(personal?.parsedProject).toBeNull();

    const structured = stored!.projects.find((p) => p.folderName === "240401_Apple_ProductShoot");
    expect(structured?.folderType).toBe("client");
    expect(structured?.parsedDate).toBe("240401");
  });
});

describe("Migration chain recovery (S1)", () => {
  // Fixture: simulates a "partial-v3" live DB — catalog_migrations row 3 is present but the
  // trailing `ALTER TABLE scan_session_projects ADD COLUMN folder_type` never executed
  // (e.g., migration 3 was manually marked applied during incident response). This is the
  // exact state that produced the 2026-04-10 production incident.
  //
  // Layout:
  //   - catalog_migrations: rows 1..4 applied
  //   - drives: 1 dummy row so #isEmpty returns false and seeding is skipped
  //   - scan_session_projects: shaped as migrations 1+2 left it (parsed_* NOT NULL, NO folder_type)
  //   - project_scan_events: minimal shell so migration 6 can ALTER it
  //
  // Only `listDrives()` is called post-boot so other (uncreated) tables don't matter.
  function seedPartialV3Fixture(databasePath: string) {
    const raw = new DatabaseSync(databasePath);
    try {
      raw.exec(`
        CREATE TABLE catalog_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
        INSERT INTO catalog_migrations (version, applied_at) VALUES
          (1, '2026-04-10T00:00:00.000Z'),
          (2, '2026-04-10T00:00:01.000Z'),
          (3, '2026-04-10T00:00:02.000Z'),
          (4, '2026-04-10T00:00:03.000Z');

        CREATE TABLE drives (
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
        );
        INSERT INTO drives (
          id, volume_name, display_name, total_capacity_bytes, used_bytes, free_bytes,
          reserved_incoming_bytes, last_scanned_at, created_manually, created_at, updated_at
        ) VALUES (
          'fixture-drive', 'FixtureVol', 'Fixture Drive', 1000000, 100000, 900000, 0, NULL, 0,
          '2026-04-10T00:00:00.000Z', '2026-04-10T00:00:00.000Z'
        );

        CREATE TABLE scan_session_projects (
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
        );

        CREATE TABLE project_scan_events (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          scan_id TEXT NOT NULL,
          observed_at TEXT NOT NULL
        );
      `);
    } finally {
      raw.close();
    }
  }

  it("migration 5 heals a partial-v3 DB whose legacy table is missing folder_type (C1 / H1 regression)", async () => {
    const databasePath = createTempDatabasePath();
    seedPartialV3Fixture(databasePath);

    const persistence = createPersistence(databasePath);
    // Triggers #ensureReady → #runMigrations. listDrives is the lightest read.
    await persistence.listDrives();

    const verify = new DatabaseSync(databasePath);
    try {
      const columns = verify
        .prepare("PRAGMA table_info(scan_session_projects)")
        .all() as Array<{ name: string; notnull: number }>;
      const columnNames = columns.map((column) => column.name);
      expect(columnNames).toContain("folder_type");
      expect(columns.find((column) => column.name === "parsed_date")?.notnull).toBe(0);
      expect(columns.find((column) => column.name === "parsed_client")?.notnull).toBe(0);
      expect(columns.find((column) => column.name === "parsed_project")?.notnull).toBe(0);

      const applied = verify
        .prepare("SELECT version FROM catalog_migrations ORDER BY version ASC")
        .all() as Array<{ version: number }>;
      expect(applied.map((row) => Number(row.version))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    } finally {
      verify.close();
    }
  });

  it("migration 5 heals the exact 2026-04-10 live-DB state (legacy missing folder_type AND v5 leftover present)", async () => {
    const databasePath = createTempDatabasePath();
    seedPartialV3Fixture(databasePath);

    // Attach the v5 leftover from a prior failed migration 5 attempt.
    const rawAdd = new DatabaseSync(databasePath);
    try {
      rawAdd.exec(`
        CREATE TABLE scan_session_projects_v5 (
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
        );
      `);
    } finally {
      rawAdd.close();
    }

    const persistence = createPersistence(databasePath);
    await persistence.listDrives();

    const verify = new DatabaseSync(databasePath);
    try {
      // v5 leftover must be gone — migration 5 drops it, recreates, copies, then renames.
      const leftover = verify
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scan_session_projects_v5'")
        .all();
      expect(leftover).toHaveLength(0);

      const columns = verify
        .prepare("PRAGMA table_info(scan_session_projects)")
        .all() as Array<{ name: string }>;
      expect(columns.map((column) => column.name)).toContain("folder_type");

      const applied = verify
        .prepare("SELECT version FROM catalog_migrations ORDER BY version ASC")
        .all() as Array<{ version: number }>;
      expect(applied.map((row) => Number(row.version))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    } finally {
      verify.close();
    }
  });

  it("migration 5 preserves row counts and defaults folder_type to 'client' when legacy column is absent", async () => {
    const databasePath = createTempDatabasePath();
    seedPartialV3Fixture(databasePath);

    const rawInsert = new DatabaseSync(databasePath);
    try {
      rawInsert.exec(`
        INSERT INTO scan_session_projects (
          id, scan_id, folder_name, folder_path, relative_path,
          parsed_date, parsed_client, parsed_project,
          source_drive_name, scan_timestamp, size_status, size_bytes, size_error
        ) VALUES
          ('row-1', 'scan-a', 'Folder A', '/a', 'Folder A', '240401', 'Apple', 'Shoot', 'Drive', '2026-04-10T00:00:00.000Z', 'ready', 1000, NULL),
          ('row-2', 'scan-a', 'Folder B', '/b', 'Folder B', '240402', 'Banana', 'Wrap', 'Drive', '2026-04-10T00:00:01.000Z', 'ready', 2000, NULL),
          ('row-3', 'scan-a', 'Folder C', '/c', 'Folder C', '240403', 'Cherry', 'Gala', 'Drive', '2026-04-10T00:00:02.000Z', 'pending', NULL, NULL);
      `);
    } finally {
      rawInsert.close();
    }

    const persistence = createPersistence(databasePath);
    await persistence.listDrives();

    const verify = new DatabaseSync(databasePath);
    try {
      const rows = verify
        .prepare("SELECT id, folder_type, parsed_date, parsed_client FROM scan_session_projects ORDER BY id ASC")
        .all() as Array<{
          id: string;
          folder_type: string;
          parsed_date: string;
          parsed_client: string;
        }>;
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.folder_type === "client")).toBe(true);
      expect(rows[0]?.parsed_date).toBe("240401");
      expect(rows[1]?.parsed_client).toBe("Banana");
      expect(rows[2]?.folder_type).toBe("client");
    } finally {
      verify.close();
    }
  });

  it("migration 7 is a no-op when scan_session_projects already has folder_type", async () => {
    // Clean-path test: existing boots (via createPersistence in earlier tests) should converge
    // on version 7 without double-adding the column.
    const databasePath = createTempDatabasePath();
    const persistence = createPersistence(databasePath);
    await persistence.readSnapshot();

    const verify = new DatabaseSync(databasePath);
    try {
      const columns = verify
        .prepare("PRAGMA table_info(scan_session_projects)")
        .all() as Array<{ name: string }>;
      const folderTypeCount = columns.filter((column) => column.name === "folder_type").length;
      expect(folderTypeCount).toBe(1);

      const applied = verify
        .prepare("SELECT version FROM catalog_migrations ORDER BY version ASC")
        .all() as Array<{ version: number }>;
      expect(applied.map((row) => Number(row.version))).toEqual([1, 2, 3, 4, 5, 6, 7]);
    } finally {
      verify.close();
    }
  });
});

describe("Sequential migration chain (M11)", () => {
  // M11 — Phase 1 audit finding: the existing migration tests cover partial-failure recovery
  // (seedPartialV3Fixture starts at catalog_migrations row 4), but no test seeds a pristine
  // v1-only DB and lets the adapter run 2→7 sequentially. This test fills that gap: it seeds
  // a DB that looks exactly like a freshly-completed migration 1 run (catalog_migrations row 1,
  // tables shaped as migration 1 left them, with real row content so migrations 3 and 5 have
  // something to copy), boots the adapter, and asserts the end-state is identical to a
  // fresh-DB boot.
  function seedCleanV1Fixture(databasePath: string) {
    const raw = new DatabaseSync(databasePath);
    try {
      // Exact DDL migration 1 runs (see sqliteLocalPersistence.ts migrations[0].statements).
      raw.exec(`
        CREATE TABLE catalog_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );
        INSERT INTO catalog_migrations (version, applied_at) VALUES
          (1, '2026-04-01T00:00:00.000Z');

        CREATE TABLE drives (
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
        );

        CREATE TABLE projects (
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
        );
        CREATE INDEX idx_projects_current_drive_id ON projects (current_drive_id);
        CREATE INDEX idx_projects_target_drive_id ON projects (target_drive_id);

        CREATE TABLE scans (
          id TEXT PRIMARY KEY,
          drive_id TEXT,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          status TEXT NOT NULL,
          folders_scanned INTEGER NOT NULL,
          matches_found INTEGER NOT NULL,
          notes TEXT
        );

        CREATE TABLE project_scan_events (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          scan_id TEXT NOT NULL,
          observed_folder_name TEXT NOT NULL,
          observed_drive_name TEXT NOT NULL,
          observed_at TEXT NOT NULL
        );
        CREATE INDEX idx_project_scan_events_project_id ON project_scan_events (project_id);
        CREATE INDEX idx_project_scan_events_scan_id ON project_scan_events (scan_id);

        CREATE TABLE scan_sessions (
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
        );

        CREATE TABLE scan_session_projects (
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
        );
        CREATE INDEX idx_scan_session_projects_scan_id ON scan_session_projects (scan_id);
      `);

      // Seed a couple of drives, projects, a scan, a project_scan_event, a scan_session, and
      // two scan_session_projects — enough to exercise migrations 3 and 5 (both recreate tables
      // and copy data across) with real content and to verify row counts survive.
      raw.exec(`
        INSERT INTO drives (
          id, volume_name, display_name, total_capacity_bytes, used_bytes, free_bytes,
          reserved_incoming_bytes, last_scanned_at, created_manually, created_at, updated_at
        ) VALUES
          ('drive-chain-a', 'ChainVolA', 'Chain Drive A', 2000000000, 1000000000, 1000000000, 0, NULL, 0, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
          ('drive-chain-b', 'ChainVolB', 'Chain Drive B', 3000000000, 1500000000, 1500000000, 0, NULL, 0, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');

        INSERT INTO projects (
          id, parsed_date, parsed_client, parsed_project, corrected_client, corrected_project,
          category, size_bytes, size_status, current_drive_id, target_drive_id,
          move_status, missing_status, duplicate_status, is_unassigned, is_manual,
          last_seen_at, last_scanned_at, created_at, updated_at
        ) VALUES
          ('project-chain-apple', '240401', 'Apple', 'Shoot', NULL, NULL, 'photo', 100000, 'ready', 'drive-chain-a', NULL, 'none', 'normal', 'normal', 0, 0, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
          ('project-chain-nike', '240320', 'Nike', 'Ad', NULL, NULL, 'video', 200000, 'ready', 'drive-chain-b', NULL, 'none', 'normal', 'normal', 0, 0, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z'),
          ('project-chain-adidas', '240215', 'Adidas', 'Social', NULL, NULL, 'design', NULL, 'unknown', NULL, 'drive-chain-b', 'pending', 'normal', 'normal', 1, 0, NULL, NULL, '2026-04-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z');

        INSERT INTO scans (
          id, drive_id, started_at, finished_at, status, folders_scanned, matches_found, notes
        ) VALUES
          ('scan-chain-1', 'drive-chain-a', '2026-04-01T10:00:00.000Z', '2026-04-01T10:05:00.000Z', 'completed', 10, 2, NULL);

        INSERT INTO project_scan_events (
          id, project_id, scan_id, observed_folder_name, observed_drive_name, observed_at
        ) VALUES
          ('event-chain-1', 'project-chain-apple', 'scan-chain-1', '240401_Apple_Shoot', 'Chain Drive A', '2026-04-01T10:02:00.000Z');

        INSERT INTO scan_sessions (
          scan_id, root_path, drive_name, status, started_at, finished_at,
          folders_scanned, matches_found, error, size_jobs_pending,
          requested_drive_id, requested_drive_name,
          summary_new_projects_count, summary_updated_projects_count,
          summary_missing_projects_count, summary_duplicates_flagged_count, summary_duration_ms
        ) VALUES
          ('scan-chain-1', '/Volumes/ChainVolA', 'Chain Drive A', 'completed', '2026-04-01T10:00:00.000Z', '2026-04-01T10:05:00.000Z', 10, 2, NULL, 0, 'drive-chain-a', 'Chain Drive A', NULL, NULL, NULL, NULL, NULL);

        INSERT INTO scan_session_projects (
          id, scan_id, folder_name, folder_path, relative_path,
          parsed_date, parsed_client, parsed_project,
          source_drive_name, scan_timestamp, size_status, size_bytes, size_error
        ) VALUES
          ('ssp-chain-1', 'scan-chain-1', '240401_Apple_Shoot', '/Volumes/ChainVolA/240401_Apple_Shoot', '240401_Apple_Shoot', '240401', 'Apple', 'Shoot', 'Chain Drive A', '2026-04-01T10:01:00.000Z', 'ready', 100000, NULL),
          ('ssp-chain-2', 'scan-chain-1', '240402_Banana_Wrap', '/Volumes/ChainVolA/240402_Banana_Wrap', '240402_Banana_Wrap', '240402', 'Banana', 'Wrap', 'Chain Drive A', '2026-04-01T10:02:00.000Z', 'ready', 50000, NULL);
      `);
    } finally {
      raw.close();
    }
  }

  it("boots a pristine v1 DB through migrations 2..7 sequentially and reaches the final schema", async () => {
    const databasePath = createTempDatabasePath();
    seedCleanV1Fixture(databasePath);

    // Boot the adapter — this triggers #ensureReady → #runMigrations and walks 2..7 in order.
    const persistence = createPersistence(databasePath);
    await persistence.listDrives();

    const verify = new DatabaseSync(databasePath);
    try {
      // 1. catalog_migrations ends with all versions applied exactly once.
      const applied = verify
        .prepare("SELECT version FROM catalog_migrations ORDER BY version ASC")
        .all() as Array<{ version: number }>;
      expect(applied.map((row) => Number(row.version))).toEqual([1, 2, 3, 4, 5, 6, 7]);

      // 2. Migration 2 — scans / project_scan_events / scan_sessions gained created_at+updated_at.
      const scansCols = verify.prepare("PRAGMA table_info(scans)").all() as Array<{ name: string }>;
      expect(scansCols.map((c) => c.name)).toEqual(expect.arrayContaining(["created_at", "updated_at"]));
      const eventsCols = verify.prepare("PRAGMA table_info(project_scan_events)").all() as Array<{ name: string }>;
      expect(eventsCols.map((c) => c.name)).toEqual(expect.arrayContaining(["created_at", "updated_at"]));
      const sessionsCols = verify.prepare("PRAGMA table_info(scan_sessions)").all() as Array<{ name: string }>;
      expect(sessionsCols.map((c) => c.name)).toEqual(expect.arrayContaining(["created_at", "updated_at"]));

      // 3. Migration 3 — projects table recreated with folder_type, is_standardized, folder_name,
      //    folder_path, nullable parsed_* columns; legacy data copied into the new shape.
      const projectsCols = verify
        .prepare("PRAGMA table_info(projects)")
        .all() as Array<{ name: string; notnull: number }>;
      const projectsColNames = projectsCols.map((c) => c.name);
      expect(projectsColNames).toEqual(
        expect.arrayContaining([
          "folder_type",
          "is_standardized",
          "folder_name",
          "folder_path",
          "parsed_date",
          "parsed_client",
          "parsed_project"
        ])
      );
      expect(projectsCols.find((c) => c.name === "parsed_date")?.notnull).toBe(0);
      expect(projectsCols.find((c) => c.name === "parsed_client")?.notnull).toBe(0);
      expect(projectsCols.find((c) => c.name === "parsed_project")?.notnull).toBe(0);

      const projectRows = verify
        .prepare(
          "SELECT id, folder_type, folder_name, parsed_date, parsed_client, parsed_project FROM projects ORDER BY id ASC"
        )
        .all() as Array<{
          id: string;
          folder_type: string;
          folder_name: string;
          parsed_date: string | null;
          parsed_client: string | null;
          parsed_project: string | null;
        }>;
      expect(projectRows).toHaveLength(3);
      // Migration 3 copies legacy rows with folder_type='client' and a reconstructed folder_name.
      expect(projectRows.every((row) => row.folder_type === "client")).toBe(true);
      const apple = projectRows.find((row) => row.id === "project-chain-apple");
      expect(apple?.folder_name).toBe("240401_Apple_Shoot");
      expect(apple?.parsed_client).toBe("Apple");

      // 4. Migration 4 — projects gained corrected_date (nullable).
      expect(projectsColNames).toContain("corrected_date");
      expect(projectsCols.find((c) => c.name === "corrected_date")?.notnull).toBe(0);

      // 5. Migration 5 — scan_session_projects recreated with nullable parsed_* and folder_type.
      const sspCols = verify
        .prepare("PRAGMA table_info(scan_session_projects)")
        .all() as Array<{ name: string; notnull: number }>;
      const sspColNames = sspCols.map((c) => c.name);
      expect(sspColNames).toContain("folder_type");
      expect(sspCols.find((c) => c.name === "parsed_date")?.notnull).toBe(0);
      expect(sspCols.find((c) => c.name === "parsed_client")?.notnull).toBe(0);
      expect(sspCols.find((c) => c.name === "parsed_project")?.notnull).toBe(0);

      // Row preservation across the migration-5 table recreation.
      const sspRows = verify
        .prepare(
          "SELECT id, folder_type, parsed_date, parsed_client FROM scan_session_projects ORDER BY id ASC"
        )
        .all() as Array<{
          id: string;
          folder_type: string;
          parsed_date: string | null;
          parsed_client: string | null;
        }>;
      expect(sspRows).toHaveLength(2);
      // Legacy rows had no folder_type column — migration 5 defaults them to 'client'.
      expect(sspRows.every((row) => row.folder_type === "client")).toBe(true);
      expect(sspRows.map((row) => row.id)).toEqual(["ssp-chain-1", "ssp-chain-2"]);
      expect(sspRows[0]?.parsed_client).toBe("Apple");

      // 6. Migration 6 — project_scan_events gained observed_folder_type (nullable).
      const eventsCols2 = verify
        .prepare("PRAGMA table_info(project_scan_events)")
        .all() as Array<{ name: string; notnull: number }>;
      expect(eventsCols2.map((c) => c.name)).toContain("observed_folder_type");
      expect(eventsCols2.find((c) => c.name === "observed_folder_type")?.notnull).toBe(0);

      // 7. Migration 7 — defensive repair on scan_session_projects.folder_type is idempotent.
      const folderTypeColumnCount = sspCols.filter((c) => c.name === "folder_type").length;
      expect(folderTypeColumnCount).toBe(1);

      // 8. Pre-existing, non-migrated rows survive end-to-end.
      const driveCount = verify.prepare("SELECT COUNT(*) as count FROM drives").get() as { count: number };
      expect(Number(driveCount.count)).toBe(2);
      const scanCount = verify.prepare("SELECT COUNT(*) as count FROM scans").get() as { count: number };
      expect(Number(scanCount.count)).toBe(1);
      const eventCount = verify
        .prepare("SELECT COUNT(*) as count FROM project_scan_events")
        .get() as { count: number };
      expect(Number(eventCount.count)).toBe(1);
      const sessionCount = verify.prepare("SELECT COUNT(*) as count FROM scan_sessions").get() as {
        count: number;
      };
      expect(Number(sessionCount.count)).toBe(1);
    } finally {
      verify.close();
    }
  });

  it("is idempotent — booting a second adapter against the same DB leaves the migration set unchanged", async () => {
    const databasePath = createTempDatabasePath();
    seedCleanV1Fixture(databasePath);

    const first = createPersistence(databasePath);
    await first.listDrives();

    const second = createPersistence(databasePath);
    await second.listDrives();

    const verify = new DatabaseSync(databasePath);
    try {
      const applied = verify
        .prepare("SELECT version FROM catalog_migrations ORDER BY version ASC")
        .all() as Array<{ version: number }>;
      expect(applied.map((row) => Number(row.version))).toEqual([1, 2, 3, 4, 5, 6, 7]);

      // Data the first boot migrated must still be present after the second boot's no-op pass.
      const projectCount = verify.prepare("SELECT COUNT(*) as count FROM projects").get() as {
        count: number;
      };
      expect(Number(projectCount.count)).toBe(3);
      const sspCount = verify
        .prepare("SELECT COUNT(*) as count FROM scan_session_projects")
        .get() as { count: number };
      expect(Number(sspCount.count)).toBe(2);
    } finally {
      verify.close();
    }
  });
});

function createPersistence(databasePath: string) {
  return new SqliteLocalPersistence({
    loadDatabase: async () => openNodeSqlDatabase(databasePath),
    seed: mockCatalogSnapshot
  });
}

describeLocalPersistenceContract("SqliteLocalPersistence", async (seed) => {
  const databasePath = createTempDatabasePath();
  return new SqliteLocalPersistence({
    loadDatabase: async () => openNodeSqlDatabase(databasePath),
    seed
  });
});

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
