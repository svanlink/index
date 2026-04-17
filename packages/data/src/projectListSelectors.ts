import { getDisplayClient, getDisplayProject, getProjectStatusState, type Category, type Drive, type FolderType, type Project } from "@drive-project-catalog/domain";
import { buildDriveNameMap, getDriveNameFromMap, sortProjects } from "./catalogSelectors";

/**
 * Sentinel value used in `ProjectCatalogFilters.currentDriveId` to represent
 * "projects with no current drive assignment". Exported so UI code can compare
 * against a single source of truth instead of rebuilding the magic string.
 */
export const UNASSIGNED_DRIVE_FILTER_VALUE = "__unassigned__" as const;

export interface ProjectCatalogFilters {
  search?: string;
  category?: Category | "";
  folderType?: FolderType | "";
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

  // Build drive-name map once so the search haystack is O(projects) rather
  // than O(projects × drives). Only needed when a search query is present.
  const driveNameMap = query ? buildDriveNameMap(drives) : undefined;

  return sortProjects(projects).filter((project) => {
    const status = getProjectStatusState(project);

    if (filters.category && project.category !== filters.category) {
      return false;
    }

    if (filters.folderType && project.folderType !== filters.folderType) {
      return false;
    }

    if (filters.currentDriveId) {
      if (filters.currentDriveId === UNASSIGNED_DRIVE_FILTER_VALUE) {
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

    if (!query || !driveNameMap) {
      // When there's no search query we don't need the drive map and the
      // project passes (all non-search filters already matched above).
      return true;
    }

    const haystack = [
      project.folderName,
      project.parsedDate,
      project.parsedClient,
      project.parsedProject,
      getDisplayClient(project),
      getDisplayProject(project),
      project.category ?? "",
      getDriveNameFromMap(driveNameMap, project.currentDriveId),
      getDriveNameFromMap(driveNameMap, project.targetDriveId)
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}
