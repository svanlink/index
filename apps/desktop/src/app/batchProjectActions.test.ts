import { describe, expect, it } from "vitest";
import { InMemoryLocalPersistence, InMemorySyncAdapter, LocalCatalogRepository, mockCatalogSnapshot } from "@drive-project-catalog/data";
import { assignProjectsToDrive, setProjectsCategory } from "./batchProjectActions";

describe("batchProjectActions", () => {
  it("compacts repeated project mutations for the same selected records", async () => {
    const repository = new LocalCatalogRepository(
      new InMemoryLocalPersistence(mockCatalogSnapshot),
      new InMemorySyncAdapter()
    );
    const projectIds = ["project-240401-apple-shoot", "project-240320-nike-ad"];

    await assignProjectsToDrive(repository, projectIds, "drive-c");
    await setProjectsCategory(repository, projectIds, "video");

    const queue = await repository.listPendingSyncOperations();

    expect(queue).toHaveLength(2);
    expect(new Set(queue.map((operation) => operation.recordId))).toEqual(new Set(projectIds));
  });
});
