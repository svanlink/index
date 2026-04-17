import { getDisplayDate } from "@drive-project-catalog/domain";
import { describe, expect, it } from "vitest";
import { MockCatalogRepository } from "./mockCatalogRepository";
import { mockProjects } from "./mockData";

describe("MockCatalogRepository", () => {
  it("returns stable dashboard data", async () => {
    const repository = new MockCatalogRepository();
    const snapshot = await repository.getDashboardSnapshot();

    expect(snapshot.recentScans).toHaveLength(2);
    expect(snapshot.moveReminders[0]?.projectName).toBe("240320_Nike_Ad");
    expect(snapshot.statusAlerts.some((alert) => alert.kind === "missing")).toBe(true);
    expect(snapshot.statusAlerts.some((alert) => alert.kind === "duplicate")).toBe(true);
    expect(snapshot.statusAlerts.some((alert) => alert.kind === "unassigned")).toBe(true);
  });

  it("returns projects and drives through the repository boundary", async () => {
    const repository = new MockCatalogRepository();
    const [projects, drives] = await Promise.all([repository.listProjects(), repository.listDrives()]);

    expect(projects.length).toBeGreaterThan(3);
    expect(drives.length).toBe(3);
    expect(projects.some((project) => project.isUnassigned)).toBe(true);
  });

  it("queues sync work when saving local changes", async () => {
    const repository = new MockCatalogRepository();
    const project = await repository.getProjectById("project-240401-apple-shoot");

    expect(project).not.toBeNull();

    await repository.saveProject({
      ...project!,
      correctedProject: "Apple Hero Shoot"
    });

    const pending = await repository.listPendingSyncOperations();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.type).toBe("project.upsert");
  });

  it("mock fixture exercises the correctedDate fallback branch (M3)", () => {
    // M3 invariant: at least one project in the mock snapshot must carry a
    // non-null correctedDate so mock-driven test runs exercise
    // getDisplayDate's `correctedDate ?? parsedDate` left branch. Without
    // this, the override semantics can regress silently in any test that
    // relies on mockCatalogSnapshot.
    const withCorrected = mockProjects.filter((project) => project.correctedDate !== null);
    expect(withCorrected.length).toBeGreaterThanOrEqual(1);

    const sample = withCorrected[0]!;
    expect(sample.parsedDate).not.toBeNull();
    expect(sample.correctedDate).not.toBe(sample.parsedDate);
    expect(getDisplayDate(sample)).toBe(sample.correctedDate);
  });

  it("supports metadata edits and search over drive/category fields", async () => {
    const repository = new MockCatalogRepository();
    await repository.updateProjectMetadata({
      projectId: "project-240401-apple-shoot",
      correctedDate: null,
      correctedClient: "Apple Studios",
      correctedProject: "Hero Shoot",
      category: "video",
      folderType: null
    });

    const [driveMatches, categoryMatches] = await Promise.all([
      repository.listProjects({ search: "drive a" }),
      repository.listProjects({ search: "video" })
    ]);

    expect(driveMatches.some((project) => project.id === "project-240401-apple-shoot")).toBe(true);
    expect(categoryMatches.some((project) => project.id === "project-240401-apple-shoot")).toBe(true);
  });
});
