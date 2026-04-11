import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SqliteSyncAdapter } from "./sqliteSyncAdapter";
import type { SqlDatabase } from "./sqliteLocalPersistence";
import { SupabaseSyncAdapter } from "./supabaseSyncAdapter";

describe("SupabaseSyncAdapter — cursor pagination ordering (M2)", () => {
  // M2 — the cursor filter assumes the server returns rows ordered by
  // (updated_at ASC, primaryKey ASC). If the SELECT does not explicitly
  // request both columns in that order, rows with duplicate `updated_at`
  // could be skipped. These tests pin the contract on the URL the adapter
  // emits, for both the `id`-keyed entities and the `scan_id`-keyed
  // `scan_sessions` entity.

  it("requests rows ordered by (updated_at asc, id asc) for id-keyed entities", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } })
      );

    const adapter = new SupabaseSyncAdapter({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
      fetch: fetchMock
    });

    await adapter.pullChanges({ sinceCursor: null });

    const drivesCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/drives"));
    expect(drivesCall, "expected a fetch to /drives").toBeDefined();
    const drivesUrl = new URL(String(drivesCall![0]));
    const drivesOrders = drivesUrl.searchParams.getAll("order");
    expect(drivesOrders).toEqual(["updated_at.asc", "id.asc"]);

    const projectsCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/projects"));
    expect(projectsCall).toBeDefined();
    const projectsOrders = new URL(String(projectsCall![0])).searchParams.getAll("order");
    expect(projectsOrders).toEqual(["updated_at.asc", "id.asc"]);
  });

  it("requests rows ordered by (updated_at asc, scan_id asc) for the scan_sessions entity", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } })
      );

    const adapter = new SupabaseSyncAdapter({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
      fetch: fetchMock
    });

    await adapter.pullChanges({ sinceCursor: null });

    const sessionsCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/scan_sessions"));
    expect(sessionsCall, "expected a fetch to /scan_sessions").toBeDefined();
    const sessionsUrl = new URL(String(sessionsCall![0]));
    const sessionsOrders = sessionsUrl.searchParams.getAll("order");
    expect(sessionsOrders).toEqual(["updated_at.asc", "scan_id.asc"]);
  });

  it("uses an (updated_at, id) tie-break filter that matches the order-by", async () => {
    // Seed a per-entity cursor so the second pull uses the cursor branch.
    const cursor = JSON.stringify({
      version: 1,
      entities: {
        drive: { updatedAt: "2026-04-08T22:00:00.000Z", recordId: "drive-archive-01" }
      }
    });

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } })
      );

    const adapter = new SupabaseSyncAdapter({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
      fetch: fetchMock
    });

    await adapter.pullChanges({ sinceCursor: cursor });

    const drivesCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/drives"));
    expect(drivesCall).toBeDefined();
    const drivesUrl = new URL(String(drivesCall![0]));

    // Order MUST match the cursor's tie-break key, otherwise pagination skips rows.
    expect(drivesUrl.searchParams.getAll("order")).toEqual(["updated_at.asc", "id.asc"]);

    const filter = drivesUrl.searchParams.get("or");
    expect(filter).not.toBeNull();
    // The filter is a strict-greater on updated_at, OR equal-on-updated_at AND
    // strict-greater on the primary key. Both halves must reference the same
    // primary-key column the order-by uses.
    expect(filter).toContain("updated_at.gt.");
    expect(filter).toContain("updated_at.eq.");
    expect(filter).toContain("id.gt.");
    expect(filter).toContain("\"2026-04-08T22:00:00.000Z\"");
    expect(filter).toContain("\"drive-archive-01\"");
  });

  it("uses a scan_id-based tie-break filter for the scan_sessions entity", async () => {
    const cursor = JSON.stringify({
      version: 1,
      entities: {
        scanSession: { updatedAt: "2026-04-08T22:00:00.000Z", recordId: "scan-archive-001" }
      }
    });

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } })
      );

    const adapter = new SupabaseSyncAdapter({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
      fetch: fetchMock
    });

    await adapter.pullChanges({ sinceCursor: cursor });

    const sessionsCall = fetchMock.mock.calls.find(([input]) => String(input).includes("/scan_sessions"));
    expect(sessionsCall).toBeDefined();
    const sessionsUrl = new URL(String(sessionsCall![0]));

    expect(sessionsUrl.searchParams.getAll("order")).toEqual(["updated_at.asc", "scan_id.asc"]);

    const filter = sessionsUrl.searchParams.get("or");
    expect(filter).not.toBeNull();
    expect(filter).toContain("scan_id.gt.");
    expect(filter).toContain("\"scan-archive-001\"");
    // Critically, scan_sessions must NOT use a bare `id.gt.` — that column
    // doesn't exist on the row. Word-boundary regex avoids matching the
    // legitimate `scan_id.gt.` substring.
    expect(filter).not.toMatch(/\bid\.gt\./);
  });
});

describe("SupabaseSyncAdapter", () => {
  it("pushes queued changes in batches and reports rejected chunks", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "duplicate key value violates unique constraint" }), {
          status: 409,
          headers: { "Content-Type": "application/json" }
        })
      );

    const adapter = new SupabaseSyncAdapter({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
      fetch: fetchMock
    });

    const result = await adapter.pushChanges({
      conflictPolicy: "updated-at-last-write-wins-local-tie-break",
      operations: [
        buildOperation("drive", "drive.upsert", "drive-a"),
        buildOperation("project", "project.upsert", "project-a")
      ]
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.acceptedOperationIds).toEqual(["op-drive-a"]);
    expect(result.rejected).toEqual([
      {
        operationId: "op-project-a",
        reason: expect.stringContaining("duplicate key value violates unique constraint")
      }
    ]);
  });

  it("paginates pull results and emits a robust per-entity cursor", async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = new URL(String(input));

      if (url.pathname.endsWith("/projects")) {
        const filter = url.searchParams.get("or");
        if (!filter) {
          return Promise.resolve(
            jsonResponse([
              {
                id: "project-1",
                parsed_date: "240401",
                parsed_client: "Apple",
                parsed_project: "Shoot",
                corrected_client: null,
                corrected_project: null,
                category: "photo",
                size_bytes: 120,
                size_status: "ready",
                current_drive_id: "drive-a",
                target_drive_id: null,
                move_status: "none",
                missing_status: "normal",
                duplicate_status: "normal",
                is_unassigned: false,
                is_manual: false,
                last_seen_at: null,
                last_scanned_at: null,
                created_at: "2026-04-06T10:00:00.000Z",
                updated_at: "2026-04-06T10:00:00.000Z"
              },
              {
                id: "project-2",
                parsed_date: "240402",
                parsed_client: "Nike",
                parsed_project: "Spot",
                corrected_client: null,
                corrected_project: null,
                category: "video",
                size_bytes: 85,
                size_status: "ready",
                current_drive_id: "drive-b",
                target_drive_id: null,
                move_status: "none",
                missing_status: "normal",
                duplicate_status: "normal",
                is_unassigned: false,
                is_manual: false,
                last_seen_at: null,
                last_scanned_at: null,
                created_at: "2026-04-06T10:01:00.000Z",
                updated_at: "2026-04-06T10:01:00.000Z"
              }
            ])
          );
        }

        return Promise.resolve(
          jsonResponse([
            {
              id: "project-3",
              parsed_date: "240403",
              parsed_client: "Canon",
              parsed_project: "Launch",
              corrected_client: null,
              corrected_project: null,
              category: "design",
              size_bytes: 64,
              size_status: "ready",
              current_drive_id: "drive-c",
              target_drive_id: null,
              move_status: "none",
              missing_status: "normal",
              duplicate_status: "normal",
              is_unassigned: false,
              is_manual: false,
              last_seen_at: null,
              last_scanned_at: null,
              created_at: "2026-04-06T10:02:00.000Z",
              updated_at: "2026-04-06T10:02:00.000Z"
            }
          ])
        );
      }

      return Promise.resolve(jsonResponse([]));
    });

    const adapter = new SupabaseSyncAdapter({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
      fetch: fetchMock,
      pageSize: 2
    });

    const result = await adapter.pullChanges({
      sinceCursor: null
    });

    expect(result.changes).toHaveLength(3);
    expect(result.remoteCursor).toBeTruthy();

    const parsedCursor = JSON.parse(result.remoteCursor ?? "{}") as {
      entities?: Record<string, { updatedAt: string; recordId: string }>;
    };
    expect(parsedCursor.entities?.project).toEqual({
      updatedAt: "2026-04-06T10:02:00.000Z",
      recordId: "project-3"
    });
  });
});

function buildOperation(entity: "drive" | "project", type: "drive.upsert" | "project.upsert", recordId: string) {
  const baseTime = "2026-04-06T10:00:00.000Z";
  return {
    id: `op-${recordId}`,
    type,
    entity,
    recordId,
    change: "upsert" as const,
    occurredAt: baseTime,
    recordUpdatedAt: baseTime,
    payload:
      entity === "drive"
        ? {
            id: recordId,
            volumeName: "Drive A",
            displayName: "Drive A",
            totalCapacityBytes: 1000,
            usedBytes: 300,
            freeBytes: 700,
            reservedIncomingBytes: 0,
            lastScannedAt: null,
            createdManually: true,
            createdAt: baseTime,
            updatedAt: baseTime
          }
        : {
            id: recordId,
            parsedDate: "240401",
            parsedClient: "Apple",
            parsedProject: "Shoot",
            correctedClient: null,
            correctedProject: null,
            category: "photo",
            sizeBytes: 120,
            sizeStatus: "ready",
            currentDriveId: "drive-a",
            targetDriveId: null,
            moveStatus: "none",
            missingStatus: "normal",
            duplicateStatus: "normal",
            isUnassigned: false,
            isManual: false,
            lastSeenAt: null,
            lastScannedAt: null,
            createdAt: baseTime,
            updatedAt: baseTime
          },
    source: "manual" as const,
    status: "pending" as const,
    attempts: 0,
    lastAttemptAt: null,
    lastError: null
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

describe("Supabase push lifecycle — enqueue → flush → push → ack → drop (M12)", () => {
  // M12 — Phase 1 audit finding: existing tests cover the pieces in isolation
  // (SupabaseSyncAdapter.pushChanges with mocked fetch; SqliteSyncAdapter.flush with
  // an inline mock RemoteSyncAdapter) but nothing wires the REAL SupabaseSyncAdapter
  // into a SqliteSyncAdapter-backed queue and exercises enqueue → flush → HTTP push →
  // settle → drop end-to-end. This is the integration path that matters in production:
  // a bug in either the push serialization OR the settle-and-drop bookkeeping would be
  // invisible to the unit-level tests but would silently duplicate or strand work here.
  //
  // Each test builds a fresh SQLite-backed queue and a SupabaseSyncAdapter whose fetch
  // is swapped for a recording mock, then asserts on:
  //   - exactly which table URLs were POSTed and with what row payloads
  //   - the sync_queue contents after flush (drained on success, failed on 5xx, never
  //     left in-flight)
  //   - the sync_state row (pendingCount, lastPushAt, lastError) reflects reality

  const tempDirectories: string[] = [];

  afterEach(() => {
    while (tempDirectories.length > 0) {
      const directory = tempDirectories.pop();
      if (directory) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  function createLifecycleTempDatabasePath() {
    const directory = mkdtempSync(join(tmpdir(), "drive-project-catalog-m12-"));
    tempDirectories.push(directory);
    return join(directory, "catalog.db");
  }

  function openLifecycleDatabase(databasePath: string): SqlDatabase {
    const database = new DatabaseSync(databasePath);
    return {
      async execute(query: string, bindValues: unknown[] = []) {
        const result = database.prepare(query).run(
          ...(bindValues as Parameters<ReturnType<DatabaseSync["prepare"]>["run"]>)
        );
        return {
          rowsAffected: Number(result.changes ?? 0),
          lastInsertId:
            result.lastInsertRowid === undefined ? undefined : Number(result.lastInsertRowid)
        };
      },
      async select<T>(query: string, bindValues: unknown[] = []) {
        return database
          .prepare(query)
          .all(
            ...(bindValues as Parameters<ReturnType<DatabaseSync["prepare"]>["run"]>)
          ) as T[];
      }
    };
  }

  function buildDrivePayload(id: string, baseTime = "2026-04-06T10:00:00.000Z") {
    return {
      id,
      volumeName: id,
      displayName: id,
      totalCapacityBytes: 1_000_000,
      usedBytes: 400_000,
      freeBytes: 600_000,
      reservedIncomingBytes: 0,
      lastScannedAt: null,
      createdManually: true,
      createdAt: baseTime,
      updatedAt: baseTime
    };
  }

  function buildProjectPayload(id: string, baseTime = "2026-04-06T10:00:00.000Z") {
    return {
      id,
      folderType: "client" as const,
      isStandardized: true,
      folderName: "240401_Apple_Shoot",
      folderPath: null,
      parsedDate: "240401",
      parsedClient: "Apple",
      parsedProject: "Shoot",
      correctedDate: null,
      correctedClient: null,
      correctedProject: null,
      category: "photo",
      sizeBytes: 120,
      sizeStatus: "ready" as const,
      currentDriveId: "drive-m12-a",
      targetDriveId: null,
      moveStatus: "none" as const,
      missingStatus: "normal" as const,
      duplicateStatus: "normal" as const,
      isUnassigned: false,
      isManual: false,
      lastSeenAt: null,
      lastScannedAt: null,
      createdAt: baseTime,
      updatedAt: baseTime
    };
  }

  function buildSyncOperation(
    id: string,
    entity: "drive" | "project",
    type: "drive.upsert" | "project.upsert",
    recordId: string,
    payload: object,
    baseTime = "2026-04-06T10:00:00.000Z"
  ) {
    return {
      id,
      type,
      entity,
      recordId,
      change: "upsert" as const,
      occurredAt: baseTime,
      recordUpdatedAt: baseTime,
      payload,
      source: "manual" as const,
      status: "pending" as const,
      attempts: 0,
      lastAttemptAt: null,
      lastError: null
    };
  }

  it("drops successfully acknowledged operations from the queue and advances sync_state", async () => {
    const databasePath = createLifecycleTempDatabasePath();

    // Mock Supabase HTTP surface: accept every POST to /rest/v1/<table>.
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      return new Response(null, { status: 201 });
    });

    const remote = new SupabaseSyncAdapter({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
      fetch: fetchMock
    });

    const queue = new SqliteSyncAdapter({
      loadDatabase: async () => openLifecycleDatabase(databasePath),
      remote
    });

    // Enqueue one drive and one project upsert — the Supabase adapter groups by
    // entity so we get one POST per table.
    await queue.enqueue(
      buildSyncOperation("op-drive-1", "drive", "drive.upsert", "drive-m12-a", buildDrivePayload("drive-m12-a"))
    );
    await queue.enqueue(
      buildSyncOperation(
        "op-project-1",
        "project",
        "project.upsert",
        "project-m12-a",
        buildProjectPayload("project-m12-a")
      )
    );

    expect(await queue.listPending()).toHaveLength(2);

    const flushResult = await queue.flush();

    // 1. Both operations were pushed and dropped.
    expect(flushResult).toEqual({ pushed: 2, pending: 0 });

    // 2. HTTP push hit exactly the drives and projects tables.
    const urls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(urls).toHaveLength(2);
    const drivesCall = urls.find((url) => url.includes("/drives"));
    const projectsCall = urls.find((url) => url.includes("/projects"));
    expect(drivesCall).toBeDefined();
    expect(projectsCall).toBeDefined();

    // 3. Each push was a POST with the upsert merge-duplicates Prefer header and
    //    a JSON body containing the snake_case row.
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit).method).toBe("POST");
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers?.Prefer).toContain("merge-duplicates");
      expect(headers?.["Content-Type"]).toBe("application/json");
      const body = JSON.parse(String((init as RequestInit).body));
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(typeof body[0].id).toBe("string");
    }

    // 4. Queue is fully drained — no lingering in-flight or failed rows.
    const finalQueue = await queue.listQueue();
    expect(finalQueue).toHaveLength(0);

    // 5. sync_state reflects the happy path.
    const state = await queue.getState();
    expect(state.pendingCount).toBe(0);
    expect(state.inFlightCount).toBe(0);
    expect(state.failedCount).toBe(0);
    expect(state.queuedCount).toBe(0);
    expect(state.syncInProgress).toBe(false);
    expect(state.lastPushAt).not.toBeNull();
    expect(state.lastError).toBeNull();
    expect(state.lastSyncError).toBeNull();
  });

  it("moves rejected operations to 'failed' without dropping them on a 409 conflict", async () => {
    const databasePath = createLifecycleTempDatabasePath();

    // Accept drives POST, reject projects POST with a 409 conflict.
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/drives")) {
        return new Response(null, { status: 201 });
      }
      return new Response(
        JSON.stringify({ message: "duplicate key value violates unique constraint" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    });

    const remote = new SupabaseSyncAdapter({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
      fetch: fetchMock
    });

    const queue = new SqliteSyncAdapter({
      loadDatabase: async () => openLifecycleDatabase(databasePath),
      remote
    });

    await queue.enqueue(
      buildSyncOperation("op-drive-ok", "drive", "drive.upsert", "drive-m12-b", buildDrivePayload("drive-m12-b"))
    );
    await queue.enqueue(
      buildSyncOperation(
        "op-project-conflict",
        "project",
        "project.upsert",
        "project-m12-b",
        buildProjectPayload("project-m12-b")
      )
    );

    const flushResult = await queue.flush();

    // Only the drive was pushed; the project remains dispatchable.
    expect(flushResult.pushed).toBe(1);
    expect(flushResult.pending).toBe(1);

    const finalQueue = await queue.listQueue();
    // The accepted drive op is dropped; the rejected project op remains as 'failed'
    // with retry metadata so the next flush can retry.
    expect(finalQueue).toHaveLength(1);
    const remaining = finalQueue[0]!;
    expect(remaining.id).toBe("op-project-conflict");
    expect(remaining.status).toBe("failed");
    expect(remaining.attempts).toBe(1);
    expect(remaining.lastError).toContain("duplicate key");
    expect(remaining.lastAttemptAt).not.toBeNull();

    // The in-flight status is never left behind.
    expect(finalQueue.some((operation) => operation.status === "in-flight")).toBe(false);

    const state = await queue.getState();
    expect(state.failedCount).toBe(1);
    expect(state.inFlightCount).toBe(0);
    expect(state.pendingCount).toBe(0);
    expect(state.lastError).toContain("duplicate key");
  });

  it("retries previously-failed operations on the next flush and drains them on 2xx", async () => {
    const databasePath = createLifecycleTempDatabasePath();

    let attempt = 0;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      attempt += 1;
      if (attempt === 1) {
        // First attempt: server is unavailable.
        return new Response(JSON.stringify({ message: "bad gateway" }), {
          status: 502,
          headers: { "Content-Type": "application/json" }
        });
      }
      // Second attempt (retry): server accepts.
      return new Response(null, { status: 201 });
    });

    const remote = new SupabaseSyncAdapter({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
      fetch: fetchMock
    });

    const queue = new SqliteSyncAdapter({
      loadDatabase: async () => openLifecycleDatabase(databasePath),
      remote
    });

    await queue.enqueue(
      buildSyncOperation("op-drive-retry", "drive", "drive.upsert", "drive-m12-c", buildDrivePayload("drive-m12-c"))
    );

    // First flush — remote 502s, op should end up in 'failed'.
    const firstResult = await queue.flush();
    expect(firstResult.pushed).toBe(0);
    expect(firstResult.pending).toBe(1);

    const afterFirst = await queue.listQueue();
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]?.status).toBe("failed");
    expect(afterFirst[0]?.attempts).toBe(1);
    expect(afterFirst[0]?.lastError).toContain("bad gateway");

    // 'failed' is still dispatchable — a second flush must retry it without any
    // explicit re-enqueue.
    expect(await queue.listPending()).toHaveLength(1);

    // Second flush — remote accepts, op should be dropped.
    const secondResult = await queue.flush();
    expect(secondResult.pushed).toBe(1);
    expect(secondResult.pending).toBe(0);

    const afterSecond = await queue.listQueue();
    expect(afterSecond).toHaveLength(0);

    const state = await queue.getState();
    expect(state.pendingCount).toBe(0);
    expect(state.failedCount).toBe(0);
    expect(state.inFlightCount).toBe(0);
    expect(state.lastError).toBeNull();

    // The retry went through exactly once more and the attempts counter on the
    // accepted op was incremented (as seen in afterFirst.attempts === 1 before
    // the retry; fetch was called twice total).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
