import { describe, expect, it } from "vitest";
import {
  cancelPendingSyncOperationsForRecord,
  compactSyncQueue,
  listDispatchableSyncOperations,
  markSyncOperationsInFlight,
  reconcileInFlightSyncOperations
} from "./syncQueue";
import type { SyncOperation } from "./sync";

describe("syncQueue", () => {
  it("compacts repeated upserts for the same entity and record", () => {
    const queue = compactSyncQueue(
      [
        createOperation({
          id: "op-1",
          recordUpdatedAt: "2026-04-06T12:00:00.000Z",
          payload: { value: "first" }
        })
      ],
      createOperation({
        id: "op-2",
        occurredAt: "2026-04-06T12:01:00.000Z",
        recordUpdatedAt: "2026-04-06T12:01:00.000Z",
        payload: { value: "second" }
      })
    );

    expect(queue).toHaveLength(1);
    expect(queue[0]?.id).toBe("op-1");
    expect(queue[0]?.payload).toEqual({ value: "second" });
  });

  it("does not compact on top of in-flight operations", () => {
    const inFlightQueue = markSyncOperationsInFlight([createOperation()], ["op-1"], "2026-04-06T12:02:00.000Z");
    const queue = compactSyncQueue(
      inFlightQueue,
      createOperation({
        id: "op-2",
        occurredAt: "2026-04-06T12:03:00.000Z",
        recordUpdatedAt: "2026-04-06T12:03:00.000Z"
      })
    );

    expect(queue).toHaveLength(2);
    expect(listDispatchableSyncOperations(queue).map((operation) => operation.id)).toEqual(["op-2"]);
  });

  // F2 — mergeSyncOperations must preserve the latest occurredAt. A stale
  // occurredAt would mis-sort this op in listDispatchableSyncOperations and
  // make a just-touched record look older than a quieter peer.
  it("preserves the latest occurredAt when compacting repeated upserts", () => {
    const queue = compactSyncQueue(
      [
        createOperation({
          id: "op-1",
          occurredAt: "2026-04-06T12:00:00.000Z",
          recordUpdatedAt: "2026-04-06T12:00:00.000Z"
        })
      ],
      createOperation({
        id: "op-2",
        occurredAt: "2026-04-06T12:05:00.000Z",
        recordUpdatedAt: "2026-04-06T12:05:00.000Z"
      })
    );

    expect(queue).toHaveLength(1);
    expect(queue[0]?.id).toBe("op-1");
    expect(queue[0]?.occurredAt).toBe("2026-04-06T12:05:00.000Z");
  });

  it("keeps the earlier occurredAt when the incoming op is older", () => {
    // Out-of-order enqueue (e.g. retry of a stale event): the merged op should
    // still reflect the most-recent activity, i.e. the existing `previous`.
    const queue = compactSyncQueue(
      [
        createOperation({
          id: "op-1",
          occurredAt: "2026-04-06T12:10:00.000Z",
          recordUpdatedAt: "2026-04-06T12:10:00.000Z"
        })
      ],
      createOperation({
        id: "op-2",
        occurredAt: "2026-04-06T12:05:00.000Z",
        recordUpdatedAt: "2026-04-06T12:05:00.000Z"
      })
    );

    expect(queue).toHaveLength(1);
    expect(queue[0]?.occurredAt).toBe("2026-04-06T12:10:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// S4/H4 — reconcileInFlightSyncOperations
// ---------------------------------------------------------------------------

describe("S4/H4 — reconcileInFlightSyncOperations", () => {
  it("flips in-flight operations to failed with the fallback error", () => {
    const queue = markSyncOperationsInFlight(
      [createOperation({ id: "op-1" })],
      ["op-1"],
      "2026-04-06T12:02:00.000Z"
    );

    const result = reconcileInFlightSyncOperations(queue, "stranded fallback");

    expect(result.recoveredCount).toBe(1);
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]!.status).toBe("failed");
    expect(result.queue[0]!.lastError).toBe("stranded fallback");
  });

  it("preserves existing lastError on the reconciled operation", () => {
    const baseQueue = markSyncOperationsInFlight(
      [createOperation({ id: "op-1" })],
      ["op-1"],
      "2026-04-06T12:02:00.000Z"
    );
    // Simulate an op that already carries a diagnostic from a prior rejection.
    const seededQueue = baseQueue.map((operation) =>
      operation.id === "op-1" ? { ...operation, lastError: "prior reason" } : operation
    );

    const result = reconcileInFlightSyncOperations(seededQueue, "stranded fallback");

    expect(result.recoveredCount).toBe(1);
    expect(result.queue[0]!.status).toBe("failed");
    expect(result.queue[0]!.lastError).toBe("prior reason");
  });

  it("leaves pending and failed operations untouched", () => {
    const queue: SyncOperation[] = [
      createOperation({ id: "op-1", status: "pending" }),
      { ...createOperation({ id: "op-2" }), status: "failed", lastError: "already failed" }
    ];

    const result = reconcileInFlightSyncOperations(queue, "stranded fallback");

    expect(result.recoveredCount).toBe(0);
    expect(result.queue[0]!.status).toBe("pending");
    expect(result.queue[1]!.status).toBe("failed");
    expect(result.queue[1]!.lastError).toBe("already failed");
  });

  it("reconciles a mixed queue and reports the exact recovered count", () => {
    const mixedQueue: SyncOperation[] = [
      createOperation({ id: "op-pending", status: "pending" }),
      ...markSyncOperationsInFlight(
        [createOperation({ id: "op-stranded-1" })],
        ["op-stranded-1"],
        "2026-04-06T12:02:00.000Z"
      ),
      ...markSyncOperationsInFlight(
        [createOperation({ id: "op-stranded-2" })],
        ["op-stranded-2"],
        "2026-04-06T12:02:30.000Z"
      )
    ];

    const result = reconcileInFlightSyncOperations(mixedQueue, "stranded fallback");

    expect(result.recoveredCount).toBe(2);
    // Reconciled ops should be reachable via listDispatchableSyncOperations
    // as `failed` (dispatchable) — the whole point of the fix.
    const dispatchable = listDispatchableSyncOperations(result.queue).map((operation) => operation.id);
    expect(dispatchable).toContain("op-pending");
    expect(dispatchable).toContain("op-stranded-1");
    expect(dispatchable).toContain("op-stranded-2");
  });

  it("returns zero recovered count when the queue is empty", () => {
    const result = reconcileInFlightSyncOperations([], "stranded fallback");
    expect(result.recoveredCount).toBe(0);
    expect(result.queue).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// F5 — cancelPendingSyncOperationsForRecord
//
// The primitive behind SyncAdapter.cancelPendingForRecord. Pure filter; must
// preserve in-flight entries (they're in transit and cannot be interrupted)
// and must never mutate input in place.
// ---------------------------------------------------------------------------

describe("F5 — cancelPendingSyncOperationsForRecord", () => {
  it("removes pending entries matching (entity, recordId) and returns the cancelled count", () => {
    const queue: SyncOperation[] = [
      createOperation({ id: "op-keep-other", recordId: "project-2" }),
      createOperation({ id: "op-cancel-1", recordId: "project-1" }),
      createOperation({ id: "op-cancel-2", recordId: "project-1", change: "delete" })
    ];

    const result = cancelPendingSyncOperationsForRecord(queue, "project", "project-1");

    expect(result.cancelledCount).toBe(2);
    expect(result.queue.map((op) => op.id)).toEqual(["op-keep-other"]);
  });

  it("leaves in-flight entries intact even when (entity, recordId) matches", () => {
    // H4 invariant — in-flight ops are already being pushed; cancelling one
    // would leave the push unresolved. The pending entry in the same batch
    // is still dropped.
    const inFlight = markSyncOperationsInFlight(
      [createOperation({ id: "op-in-flight" })],
      ["op-in-flight"],
      "2026-04-06T12:02:00.000Z"
    );
    const queue: SyncOperation[] = [
      ...inFlight,
      createOperation({ id: "op-pending", occurredAt: "2026-04-06T12:05:00.000Z" })
    ];

    const result = cancelPendingSyncOperationsForRecord(queue, "project", "project-1");

    expect(result.cancelledCount).toBe(1);
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0]!.id).toBe("op-in-flight");
    expect(result.queue[0]!.status).toBe("in-flight");
  });

  it("also cancels failed (dispatchable) entries — they would otherwise be retried", () => {
    // `failed` is a dispatchable status (see listDispatchableSyncOperations),
    // meaning the next flush would pick it up and push it. A failed upsert
    // for a record we just deleted must not be retried.
    const queue: SyncOperation[] = [
      { ...createOperation({ id: "op-failed" }), status: "failed", lastError: "prior rejection" }
    ];

    const result = cancelPendingSyncOperationsForRecord(queue, "project", "project-1");

    expect(result.cancelledCount).toBe(1);
    expect(result.queue).toEqual([]);
  });

  it("returns a zero count and the original queue when nothing matches", () => {
    const queue: SyncOperation[] = [
      createOperation({ id: "op-other-entity", entity: "drive", recordId: "project-1" }),
      createOperation({ id: "op-other-record", recordId: "project-2" })
    ];

    const result = cancelPendingSyncOperationsForRecord(queue, "project", "project-1");

    expect(result.cancelledCount).toBe(0);
    expect(result.queue.map((op) => op.id).sort()).toEqual(["op-other-entity", "op-other-record"]);
  });

  it("does not mutate the input queue", () => {
    const queue: SyncOperation[] = [createOperation({ id: "op-1", recordId: "project-1" })];
    const snapshot = queue.map((op) => op.id);

    cancelPendingSyncOperationsForRecord(queue, "project", "project-1");

    expect(queue.map((op) => op.id)).toEqual(snapshot);
  });

  it("handles an empty queue without throwing", () => {
    const result = cancelPendingSyncOperationsForRecord([], "project", "project-1");
    expect(result).toEqual({ queue: [], cancelledCount: 0 });
  });
});

function createOperation(overrides: Partial<SyncOperation> = {}): SyncOperation {
  return {
    id: "op-1",
    type: "project.upsert",
    entity: "project",
    recordId: "project-1",
    change: "upsert",
    occurredAt: "2026-04-06T12:00:00.000Z",
    recordUpdatedAt: "2026-04-06T12:00:00.000Z",
    payload: { id: "project-1" },
    source: "manual",
    status: "pending",
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    ...overrides
  };
}
