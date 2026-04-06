import { describe, expect, it } from "vitest";
import { MockCatalogRepository } from "./mockCatalogRepository";

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

  it("supports metadata edits and search over drive/category fields", async () => {
    const repository = new MockCatalogRepository();
    await repository.updateProjectMetadata({
      projectId: "project-240401-apple-shoot",
      correctedClient: "Apple Studios",
      correctedProject: "Hero Shoot",
      category: "video"
    });

    const [driveMatches, categoryMatches] = await Promise.all([
      repository.listProjects({ search: "drive a" }),
      repository.listProjects({ search: "video" })
    ]);

    expect(driveMatches.some((project) => project.id === "project-240401-apple-shoot")).toBe(true);
    expect(categoryMatches.some((project) => project.id === "project-240401-apple-shoot")).toBe(true);
  });
});
