import { describe, expect, it, vi } from "vitest";
import { SupabaseSyncAdapter } from "./supabaseSyncAdapter";

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
