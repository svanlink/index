import type { Drive, Project, ProjectScanEvent, ScanRecord, ScanSessionSnapshot } from "@drive-project-catalog/domain";
import {
  fromSupabaseDriveRow,
  fromSupabaseProjectRow,
  fromSupabaseProjectScanEventRow,
  fromSupabaseScanRow,
  fromSupabaseScanSessionRow,
  supabaseSyncTables,
  toSupabaseDriveRow,
  toSupabaseProjectRow,
  toSupabaseProjectScanEventRow,
  toSupabaseScanRow,
  toSupabaseScanSessionRow,
  type SupabaseDriveRow,
  type SupabaseProjectRow,
  type SupabaseProjectScanEventRow,
  type SupabaseScanRow,
  type SupabaseScanSessionRow
} from "./supabaseSyncMapping";
import type {
  RemoteSyncAdapter,
  RemoteSyncChange,
  SyncOperation,
  SyncPullRequest,
  SyncPullResult,
  SyncPushRequest,
  SyncPushResult,
  SyncableCatalogEntity
} from "./sync";

export interface SupabaseSyncConfig {
  url: string;
  anonKey: string;
  schema?: string;
  pageSize?: number;
  fetch?: typeof fetch;
}

interface CursorPosition {
  updatedAt: string;
  recordId: string;
}

interface CursorState {
  version: 1;
  entities: Partial<Record<SyncableCatalogEntity, CursorPosition>>;
}

const DEFAULT_PAGE_SIZE = 200;
const PUSH_BATCH_SIZE = 100;
const orderedEntities: SyncableCatalogEntity[] = ["drive", "project", "scan", "scanSession", "projectScanEvent"];

export class SupabaseSyncAdapter implements RemoteSyncAdapter {
  readonly mode = "remote-ready" as const;
  readonly #config: SupabaseSyncConfig;
  readonly #fetch: typeof fetch;

  constructor(config: SupabaseSyncConfig) {
    this.#config = config;
    this.#fetch = config.fetch ?? fetch;
  }

  async pushChanges(request: SyncPushRequest): Promise<SyncPushResult> {
    const acceptedOperationIds: string[] = [];
    const rejected: Array<{ operationId: string; reason: string }> = [];

    for (const entity of orderedEntities) {
      const operations = request.operations.filter((operation) => operation.entity === entity);
      if (operations.length === 0) {
        continue;
      }

      // F1 — route operations by change kind. Upserts go out first (they
      // create the rows a later delete might otherwise race), deletes last.
      // In practice the repository's `deleteDrive` / `deleteProject` call
      // `SyncAdapter.cancelPendingForRecord` to drop prior upserts for a
      // record before enqueueing a delete, so a single delete arriving
      // alone is the common case; the explicit ordering here is defensive
      // for future callers that enqueue mixed pairs directly.
      const upserts = operations.filter((operation) => operation.change === "upsert");
      const deletes = operations.filter((operation) => operation.change === "delete");

      await this.#pushUpsertBatches(entity, upserts, acceptedOperationIds, rejected);
      await this.#pushDeleteBatches(entity, deletes, acceptedOperationIds, rejected);
    }

    return {
      acceptedOperationIds,
      rejected,
      remoteCursor: null
    };
  }

  async #pushUpsertBatches(
    entity: SyncableCatalogEntity,
    upserts: SyncOperation[],
    acceptedOperationIds: string[],
    rejected: Array<{ operationId: string; reason: string }>
  ) {
    for (const chunk of chunkArray(upserts, PUSH_BATCH_SIZE)) {
      const rows = chunk.map((operation) => mapOperationPayloadToRow(entity, operation.payload));
      const response = await this.#fetch(this.#buildTableUrl(resolveTableName(entity), buildUpsertQuery(entity)), {
        method: "POST",
        headers: this.#headers({
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        }),
        body: JSON.stringify(rows)
      });

      if (response.ok) {
        acceptedOperationIds.push(...chunk.map((operation) => operation.id));
        continue;
      }

      const reason = await this.#readErrorMessage(response, `Supabase push failed for ${entity}.`);
      rejected.push(...chunk.map((operation) => ({ operationId: operation.id, reason })));
    }
  }

  async #pushDeleteBatches(
    entity: SyncableCatalogEntity,
    deletes: SyncOperation[],
    acceptedOperationIds: string[],
    rejected: Array<{ operationId: string; reason: string }>
  ) {
    if (deletes.length === 0) {
      return;
    }
    const primaryKey = resolvePrimaryKey(entity);
    for (const chunk of chunkArray(deletes, PUSH_BATCH_SIZE)) {
      const query = new URLSearchParams();
      // PostgREST `in.(…)` accepts quoted comma-separated values; the quote
      // helper handles embedded double-quotes (see `buildPullQuery`).
      const encodedIds = chunk.map((operation) => quoteFilterValue(operation.recordId)).join(",");
      query.set(primaryKey, `in.(${encodedIds})`);

      const response = await this.#fetch(this.#buildTableUrl(resolveTableName(entity), query), {
        method: "DELETE",
        headers: this.#headers({
          Prefer: "return=minimal"
        })
      });

      if (response.ok) {
        acceptedOperationIds.push(...chunk.map((operation) => operation.id));
        continue;
      }

      const reason = await this.#readErrorMessage(response, `Supabase delete failed for ${entity}.`);
      rejected.push(...chunk.map((operation) => ({ operationId: operation.id, reason })));
    }
  }

  async pullChanges(request: SyncPullRequest): Promise<SyncPullResult> {
    const cursor = parseCursorState(request.sinceCursor);
    const nextCursor: CursorState = {
      version: 1,
      entities: { ...cursor.entities }
    };
    const changes: RemoteSyncChange[] = [];

    for (const entity of orderedEntities) {
      let entityCursor = nextCursor.entities[entity] ?? null;

      while (true) {
        const response = await this.#fetch(
          this.#buildTableUrl(
            resolveTableName(entity),
            buildPullQuery({
              entity,
              cursor: entityCursor,
              limit: this.#config.pageSize ?? DEFAULT_PAGE_SIZE
            })
          ),
          {
            method: "GET",
            headers: this.#headers()
          }
        );

        if (!response.ok) {
          throw new Error(await this.#readErrorMessage(response, `Supabase pull failed for ${entity}.`));
        }

        const rows = (await response.json()) as unknown[];
        if (rows.length === 0) {
          break;
        }

        const remoteChanges = mapRowsToRemoteChanges(entity, rows);
        changes.push(...remoteChanges);

        const lastChange = remoteChanges.at(-1);
        if (!lastChange) {
          break;
        }

        const lastRecordId = getChangeRecordId(entity, lastChange.payload);
        entityCursor = {
          updatedAt: lastChange.remoteUpdatedAt,
          recordId: lastRecordId
        };
        nextCursor.entities[entity] = entityCursor;

        if (rows.length < (this.#config.pageSize ?? DEFAULT_PAGE_SIZE)) {
          break;
        }
      }
    }

    return {
      changes,
      remoteCursor: serializeCursorState(nextCursor)
    };
  }

  #buildTableUrl(table: string, query: URLSearchParams) {
    const baseUrl = this.#config.url.replace(/\/+$/, "");
    return `${baseUrl}/rest/v1/${table}?${query.toString()}`;
  }

  #headers(extraHeaders?: Record<string, string>) {
    return {
      apikey: this.#config.anonKey,
      Authorization: `Bearer ${this.#config.anonKey}`,
      ...(this.#config.schema ? { "Accept-Profile": this.#config.schema, "Content-Profile": this.#config.schema } : {}),
      ...extraHeaders
    };
  }

  async #readErrorMessage(response: Response, fallback: string) {
    try {
      const body = (await response.json()) as { message?: string; error_description?: string; hint?: string; details?: string };
      return [body.message, body.error_description, body.hint, body.details, `${fallback} (${response.status})`]
        .filter(Boolean)
        .join(" — ");
    } catch {
      return `${fallback} (${response.status} ${response.statusText})`;
    }
  }
}

export function createRemoteSyncAdapter(config?: SupabaseSyncConfig | null): RemoteSyncAdapter | null {
  if (!config?.url || !config.anonKey) {
    return null;
  }

  return new SupabaseSyncAdapter(config);
}

function resolveTableName(entity: SyncableCatalogEntity) {
  switch (entity) {
    case "drive":
      return supabaseSyncTables.drives;
    case "project":
      return supabaseSyncTables.projects;
    case "scan":
      return supabaseSyncTables.scans;
    case "scanSession":
      return supabaseSyncTables.scanSessions;
    case "projectScanEvent":
      return supabaseSyncTables.projectScanEvents;
  }
}

function buildUpsertQuery(entity: SyncableCatalogEntity) {
  const query = new URLSearchParams();
  query.set("on_conflict", resolvePrimaryKey(entity));
  return query;
}

function buildPullQuery(params: {
  entity: SyncableCatalogEntity;
  cursor: CursorPosition | null;
  limit: number;
}) {
  const query = new URLSearchParams();
  query.set("select", "*");
  query.set("limit", String(params.limit));
  query.append("order", "updated_at.asc");
  query.append("order", `${resolvePrimaryKey(params.entity)}.asc`);

  if (params.cursor) {
    query.set(
      "or",
      `(updated_at.gt.${quoteFilterValue(params.cursor.updatedAt)},and(updated_at.eq.${quoteFilterValue(params.cursor.updatedAt)},${resolvePrimaryKey(params.entity)}.gt.${quoteFilterValue(params.cursor.recordId)}))`
    );
  }

  return query;
}

function quoteFilterValue(value: string) {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function resolvePrimaryKey(entity: SyncableCatalogEntity) {
  return entity === "scanSession" ? "scan_id" : "id";
}

function mapOperationPayloadToRow(entity: SyncableCatalogEntity, payload: unknown) {
  switch (entity) {
    case "drive":
      return toSupabaseDriveRow(payload as Drive);
    case "project":
      return toSupabaseProjectRow(payload as Project);
    case "scan":
      return toSupabaseScanRow(payload as ScanRecord);
    case "scanSession":
      return toSupabaseScanSessionRow(payload as ScanSessionSnapshot);
    case "projectScanEvent":
      return toSupabaseProjectScanEventRow(payload as ProjectScanEvent);
  }
}

function mapRowsToRemoteChanges(entity: SyncableCatalogEntity, rows: unknown[]): RemoteSyncChange[] {
  switch (entity) {
    case "drive":
      return (rows as SupabaseDriveRow[]).map((row) => ({
        entity,
        change: "upsert",
        payload: fromSupabaseDriveRow(row),
        remoteUpdatedAt: row.updated_at
      }));
    case "project":
      return (rows as SupabaseProjectRow[]).map((row) => ({
        entity,
        change: "upsert",
        payload: fromSupabaseProjectRow(row),
        remoteUpdatedAt: row.updated_at
      }));
    case "scan":
      return (rows as SupabaseScanRow[]).map((row) => ({
        entity,
        change: "upsert",
        payload: fromSupabaseScanRow(row),
        remoteUpdatedAt: row.updated_at
      }));
    case "scanSession":
      return (rows as SupabaseScanSessionRow[]).map((row) => ({
        entity,
        change: "upsert",
        payload: fromSupabaseScanSessionRow(row),
        remoteUpdatedAt: row.updated_at
      }));
    case "projectScanEvent":
      return (rows as SupabaseProjectScanEventRow[]).map((row) => ({
        entity,
        change: "upsert",
        payload: fromSupabaseProjectScanEventRow(row),
        remoteUpdatedAt: row.updated_at
      }));
  }
}

function getChangeRecordId(entity: SyncableCatalogEntity, payload: unknown) {
  if (entity === "scanSession") {
    return (payload as ScanSessionSnapshot).scanId;
  }

  return (payload as { id: string }).id;
}

function parseCursorState(cursor: string | null | undefined): CursorState {
  if (!cursor) {
    return { version: 1, entities: {} };
  }

  try {
    const parsed = JSON.parse(cursor) as Partial<CursorState>;
    if (parsed.version === 1 && parsed.entities) {
      return {
        version: 1,
        entities: parsed.entities
      };
    }
  } catch {
    return {
      version: 1,
      entities: Object.fromEntries(
        orderedEntities.map((entity) => [entity, { updatedAt: cursor, recordId: "" }])
      )
    };
  }

  return { version: 1, entities: {} };
}

function serializeCursorState(cursor: CursorState) {
  return JSON.stringify(cursor);
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
