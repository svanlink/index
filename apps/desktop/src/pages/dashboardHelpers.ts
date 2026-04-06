import { getDisplayClient, getDisplayProject, getProjectStatusLabels, type Drive, type Project } from "@drive-project-catalog/domain";

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

export function getProjectClient(project: Project) {
  return getDisplayClient(project);
}

export function getDriveName(drives: Drive[], driveId: string | null) {
  if (!driveId) {
    return "Unassigned";
  }

  return drives.find((drive) => drive.id === driveId)?.displayName ?? "Unknown drive";
}

export function formatDate(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleDateString();
}

export function formatParsedDate(value: string) {
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
