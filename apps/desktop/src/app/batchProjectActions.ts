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

async function loadProjects(repository: CatalogRepository, projectIds: string[]) {
  const projects = await Promise.all(projectIds.map((projectId) => repository.getProjectById(projectId)));
  return projects.filter((project): project is NonNullable<typeof project> => project !== null);
}
