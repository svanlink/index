/**
 * @module scanSnapshotSchema
 *
 * Runtime validation for snapshots that cross the Rust ↔ TS IPC boundary.
 *
 * The Rust `scan_engine` serializes enum fields (status, folderType, sizeStatus)
 * as plain strings. Without a guard, a typo on the Rust side — or a stale
 * client talking to a newer engine, or a dev fixture with an unexpected value —
 * would flow through the TS layer uninspected and land in the catalog as
 * garbage that breaks `getProjectStatusState`, the scan-history UI, or the
 * terminal-status priority table.
 *
 * The parser here validates every snapshot once at the IPC boundary and
 * returns a strongly-typed `ScanSessionSnapshot`. On a violation it throws a
 * structured `ScanSnapshotValidationError` with a dotted path to the offending
 * field, the expected shape, and the actual value — suitable for both log
 * telemetry and user-facing error messages in `normalizeScanCommandError`.
 *
 * This is intentionally handwritten (no external validator dep) because the
 * surface area is small, static, and lives on a hot path that is invoked for
 * every scan poll cycle.
 */
import {
  folderTypeValues,
  scanStatusValues,
  sizeStatusValues,
  type FolderType,
  type ScanStatus,
  type ScanIngestionSummary,
  type ScanProjectRecord,
  type ScanSessionSnapshot,
  type SizeStatus
} from "@drive-project-catalog/domain";

export class ScanSnapshotValidationError extends Error {
  readonly path: string;
  readonly expected: string;
  readonly actual: unknown;

  constructor(path: string, expected: string, actual: unknown) {
    super(
      `Invalid scan snapshot at "${path}": expected ${expected}, got ${describeValue(actual)}`
    );
    this.name = "ScanSnapshotValidationError";
    this.path = path;
    this.expected = expected;
    this.actual = actual;
  }
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return `string ${JSON.stringify(value)}`;
  if (typeof value === "number") return `number ${value}`;
  if (typeof value === "boolean") return `boolean ${value}`;
  if (Array.isArray(value)) return `array (length ${value.length})`;
  return typeof value;
}

// ---------------------------------------------------------------------------
// Primitive field parsers
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new ScanSnapshotValidationError(path, "string", value);
  }
  return value;
}

function parseNullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new ScanSnapshotValidationError(path, "string | null", value);
  }
  return value;
}

function parseOptionalNullableString(
  value: unknown,
  path: string
): string | null | undefined {
  if (value === undefined) return undefined;
  return parseNullableString(value, path);
}

function parseNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ScanSnapshotValidationError(path, "finite number", value);
  }
  return value;
}

function parseNullableNumber(value: unknown, path: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ScanSnapshotValidationError(path, "finite number | null", value);
  }
  return value;
}

function parseEnum<T extends string>(
  value: unknown,
  path: string,
  allowed: readonly T[]
): T {
  if (typeof value !== "string") {
    throw new ScanSnapshotValidationError(
      path,
      `one of ${JSON.stringify(allowed)}`,
      value
    );
  }
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ScanSnapshotValidationError(
      path,
      `one of ${JSON.stringify(allowed)}`,
      value
    );
  }
  return value as T;
}

// ---------------------------------------------------------------------------
// Composite parsers
// ---------------------------------------------------------------------------

function parseScanIngestionSummary(
  value: unknown,
  path: string
): ScanIngestionSummary {
  if (!isObject(value)) {
    throw new ScanSnapshotValidationError(path, "object", value);
  }
  return {
    newProjectsCount: parseNumber(value.newProjectsCount, `${path}.newProjectsCount`),
    updatedProjectsCount: parseNumber(
      value.updatedProjectsCount,
      `${path}.updatedProjectsCount`
    ),
    missingProjectsCount: parseNumber(
      value.missingProjectsCount,
      `${path}.missingProjectsCount`
    ),
    duplicatesFlaggedCount: parseNumber(
      value.duplicatesFlaggedCount,
      `${path}.duplicatesFlaggedCount`
    ),
    durationMs: parseNullableNumber(value.durationMs, `${path}.durationMs`)
  };
}

function parseScanProjectRecord(value: unknown, path: string): ScanProjectRecord {
  if (!isObject(value)) {
    throw new ScanSnapshotValidationError(path, "object", value);
  }
  return {
    id: parseString(value.id, `${path}.id`),
    folderName: parseString(value.folderName, `${path}.folderName`),
    folderPath: parseString(value.folderPath, `${path}.folderPath`),
    relativePath: parseString(value.relativePath, `${path}.relativePath`),
    folderType: parseEnum<FolderType>(
      value.folderType,
      `${path}.folderType`,
      folderTypeValues
    ),
    parsedDate: parseNullableString(value.parsedDate, `${path}.parsedDate`),
    parsedClient: parseNullableString(value.parsedClient, `${path}.parsedClient`),
    parsedProject: parseNullableString(value.parsedProject, `${path}.parsedProject`),
    sourceDriveName: parseString(value.sourceDriveName, `${path}.sourceDriveName`),
    scanTimestamp: parseString(value.scanTimestamp, `${path}.scanTimestamp`),
    sizeStatus: parseEnum<SizeStatus>(
      value.sizeStatus,
      `${path}.sizeStatus`,
      sizeStatusValues
    ),
    sizeBytes: parseNullableNumber(value.sizeBytes, `${path}.sizeBytes`),
    sizeError: parseNullableString(value.sizeError, `${path}.sizeError`)
  };
}

/**
 * Validate an unknown value (typically the raw response from a Tauri
 * `invoke<ScanSessionSnapshot>(...)` call) and return a strongly-typed
 * snapshot, throwing `ScanSnapshotValidationError` on any shape or enum
 * violation.
 *
 * `projects` is validated field-by-field; a single bad record rejects the
 * whole snapshot (the caller cannot ingest a partial snapshot safely — the
 * summary counts would be wrong).
 */
export function parseScanSessionSnapshot(
  value: unknown,
  basePath: string = "snapshot"
): ScanSessionSnapshot {
  if (!isObject(value)) {
    throw new ScanSnapshotValidationError(basePath, "object", value);
  }

  if (!Array.isArray(value.projects)) {
    throw new ScanSnapshotValidationError(
      `${basePath}.projects`,
      "array",
      value.projects
    );
  }

  const projects = value.projects.map((project, index) =>
    parseScanProjectRecord(project, `${basePath}.projects[${index}]`)
  );

  const summary =
    value.summary === undefined || value.summary === null
      ? value.summary === undefined
        ? undefined
        : null
      : parseScanIngestionSummary(value.summary, `${basePath}.summary`);

  const startedAt = parseString(value.startedAt, `${basePath}.startedAt`);
  const finishedAt = parseNullableString(value.finishedAt, `${basePath}.finishedAt`);
  // Rust's `ScanSnapshot` does not carry explicit `created_at` / `updated_at`
  // fields. Derive them from the scan lifecycle timestamps at the IPC
  // boundary so the rest of the catalog layer can treat the snapshot like any
  // other timestamped record.
  const createdAt =
    typeof value.createdAt === "string" ? value.createdAt : startedAt;
  const updatedAt =
    typeof value.updatedAt === "string"
      ? value.updatedAt
      : finishedAt ?? startedAt;

  return {
    scanId: parseString(value.scanId, `${basePath}.scanId`),
    rootPath: parseString(value.rootPath, `${basePath}.rootPath`),
    driveName: parseString(value.driveName, `${basePath}.driveName`),
    status: parseEnum<ScanStatus>(
      value.status,
      `${basePath}.status`,
      scanStatusValues
    ),
    startedAt,
    finishedAt,
    foldersScanned: parseNumber(value.foldersScanned, `${basePath}.foldersScanned`),
    matchesFound: parseNumber(value.matchesFound, `${basePath}.matchesFound`),
    error: parseNullableString(value.error, `${basePath}.error`),
    sizeJobsPending: parseNumber(value.sizeJobsPending, `${basePath}.sizeJobsPending`),
    projects,
    requestedDriveId: parseOptionalNullableString(
      value.requestedDriveId,
      `${basePath}.requestedDriveId`
    ),
    requestedDriveName: parseOptionalNullableString(
      value.requestedDriveName,
      `${basePath}.requestedDriveName`
    ),
    summary,
    createdAt,
    updatedAt
  };
}

/**
 * Validate an array of snapshots (for the `list_scan_snapshots` IPC command).
 * Throws on the first invalid entry, with a path that identifies which index
 * failed so logs point at the specific snapshot.
 */
export function parseScanSessionSnapshotList(
  value: unknown,
  basePath: string = "snapshots"
): ScanSessionSnapshot[] {
  if (!Array.isArray(value)) {
    throw new ScanSnapshotValidationError(basePath, "array", value);
  }
  return value.map((entry, index) =>
    parseScanSessionSnapshot(entry, `${basePath}[${index}]`)
  );
}
