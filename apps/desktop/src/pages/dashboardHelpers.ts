import { getDisplayProject, getProjectStatusLabels, type Drive, type FolderType, type Project } from "@drive-project-catalog/domain";
import { getDriveNameById } from "@drive-project-catalog/data";

const FOLDER_TYPE_LABELS: Record<FolderType, string> = {
  client: "Client",
  personal_project: "Personal project",
  personal_folder: "Personal folder"
};

export function getFolderTypeLabel(folderType: FolderType): string {
  return FOLDER_TYPE_LABELS[folderType];
}

export function formatBytes(value: number | null) {
  if (value === null) {
    return "Unknown";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

export function getProjectName(project: Project) {
  return getDisplayProject(project);
}


export function getDriveName(drives: Drive[], driveId: string | null) {
  return getDriveNameById(drives, driveId);
}

export function formatDate(value: string | null) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatParsedDate(value: string | null) {
  if (!value) return "—";
  if (value.length !== 6) {
    return value;
  }

  const year = `20${value.slice(0, 2)}`;
  const month = value.slice(2, 4);
  const day = value.slice(4, 6);
  return `${year}-${month}-${day}`;
}

export function getProjectStatusBadges(project: Project) {
  return getProjectStatusLabels(project);
}
