import { getDisplayClient, getDisplayProject, getProjectStatusState, type Category, type Drive, type Project } from "@drive-project-catalog/domain";
import { getDriveNameById, sortProjects } from "./catalogSelectors";

export interface ProjectCatalogFilters {
  search?: string;
  category?: Category | "";
  currentDriveId?: string;
  targetDriveId?: string;
  showUnassigned?: boolean;
  showMissing?: boolean;
  showDuplicate?: boolean;
  showMovePending?: boolean;
}

export function filterProjectCatalog(projects: Project[], drives: Drive[], filters: ProjectCatalogFilters) {
  const query = filters.search?.trim().toLowerCase() ?? "";
  const hasStatusFilters =
    Boolean(filters.showUnassigned) ||
    Boolean(filters.showMissing) ||
    Boolean(filters.showDuplicate) ||
    Boolean(filters.showMovePending);

  return sortProjects(projects).filter((project) => {
    const status = getProjectStatusState(project);

    if (filters.category && project.category !== filters.category) {
      return false;
    }

    if (filters.currentDriveId) {
      if (filters.currentDriveId === "__unassigned__") {
        if (project.currentDriveId !== null) {
          return false;
        }
      } else if (project.currentDriveId !== filters.currentDriveId) {
        return false;
      }
    }

    if (filters.targetDriveId && project.targetDriveId !== filters.targetDriveId) {
      return false;
    }

    if (hasStatusFilters) {
      const matchesStatus =
        (filters.showUnassigned && status.isUnassigned) ||
        (filters.showMissing && status.isMissing) ||
        (filters.showDuplicate && status.isDuplicate) ||
        (filters.showMovePending && status.isMovePending);

      if (!matchesStatus) {
        return false;
      }
    }

    if (!query) {
      return true;
    }

    const haystack = [
      project.parsedDate,
      project.parsedClient,
      project.parsedProject,
      getDisplayClient(project),
      getDisplayProject(project),
      project.category ?? "",
      getDriveNameById(drives, project.currentDriveId),
      getDriveNameById(drives, project.targetDriveId)
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}
