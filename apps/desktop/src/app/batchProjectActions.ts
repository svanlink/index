import type { Category } from "@drive-project-catalog/domain";
import type { CatalogRepository } from "@drive-project-catalog/data";

export async function assignProjectsToDrive(
  repository: CatalogRepository,
  projectIds: string[],
  driveId: string | null
) {
  const projects = await loadProjects(repository, projectIds);
  const now = new Date().toISOString();

  await Promise.all(
    projects.map((project) =>
      repository.saveProject({
        ...project,
        currentDriveId: driveId,
        targetDriveId: null,
        moveStatus: "none",
        missingStatus: "normal",
        updatedAt: now
      })
    )
  );
}

export async function setProjectsCategory(
  repository: CatalogRepository,
  projectIds: string[],
  category: Category | null
) {
  const projects = await loadProjects(repository, projectIds);
  const now = new Date().toISOString();

  await Promise.all(
    projects.map((project) =>
      repository.saveProject({
        ...project,
        category,
        updatedAt: now
      })
    )
  );
}

export async function planProjectsMove(
  repository: CatalogRepository,
  projectIds: string[],
  targetDriveId: string
) {
  await Promise.all(projectIds.map((projectId) => repository.planProjectMove(projectId, targetDriveId)));
}

export async function deleteProjects(
  repository: CatalogRepository,
  projectIds: string[]
) {
  // Sequential rather than Promise.all: deleteProject touches joined tables
  // (scans, events, linking metadata), and the SQLite connection is a single
  // writer with a busy-timeout. Parallel deletes just queue up inside the DB
  // and risk tripping the busy handler on large selections.
  for (const projectId of projectIds) {
    await repository.deleteProject(projectId);
  }
}

async function loadProjects(repository: CatalogRepository, projectIds: string[]) {
  const projects = await Promise.all(projectIds.map((projectId) => repository.getProjectById(projectId)));
  const found = projects.filter((project): project is NonNullable<typeof project> => project !== null);
  if (found.length < projectIds.length) {
    console.warn(
      `[batchProjectActions] loadProjects: ${projectIds.length - found.length} of ${projectIds.length} requested project(s) were not found and will be skipped.`
    );
  }
  return found;
}
