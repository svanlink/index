import { describe, expect, it } from "vitest";
import { compactSyncQueue, listDispatchableSyncOperations, markSyncOperationsInFlight } from "./syncQueue";
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
