import { describe, expect, it } from "vitest";
import { InMemoryLocalPersistence, InMemorySyncAdapter, LocalCatalogRepository } from "@drive-project-catalog/data";
import { mockCatalogSnapshot } from "@drive-project-catalog/data/testing";
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

  it("clears stale missing state when projects are directly assigned to a drive", async () => {
    const repository = new LocalCatalogRepository(
      new InMemoryLocalPersistence(mockCatalogSnapshot),
      new InMemorySyncAdapter()
    );

    await assignProjectsToDrive(repository, ["project-240228-clientx-concept"], "drive-c");
    const project = await repository.getProjectById("project-240228-clientx-concept");

    expect(project?.currentDriveId).toBe("drive-c");
    expect(project?.moveStatus).toBe("none");
    expect(project?.missingStatus).toBe("normal");
  });
});
