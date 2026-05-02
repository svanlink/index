import { getDisplayProject, type FolderType, type Project } from "@drive-project-catalog/domain";
import type { Drive } from "@drive-project-catalog/domain";

export function formatBytes(bytes: number | null | undefined, decimals = 1): string {
  if (bytes == null) return "—";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return date;
  }
}

export function formatParsedDate(parsedDate: string | null | undefined): string {
  if (!parsedDate || parsedDate.length < 6) return "—";
  const yy = parsedDate.slice(0, 2);
  const mm = parsedDate.slice(2, 4);
  const dd = parsedDate.slice(4, 6);
  const year = parseInt(yy, 10) > 50 ? `19${yy}` : `20${yy}`;
  const date = new Date(`${year}-${mm}-${dd}`);
  if (isNaN(date.getTime())) return parsedDate;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function getDriveName(drive: Drive | null | undefined): string {
  if (!drive) return "Unassigned";
  return drive.displayName || drive.volumeName || "Drive";
}

export function getFolderTypeLabel(type: FolderType | null | undefined): string {
  if (!type) return "—";
  const labels: Record<FolderType, string> = {
    client: "Client",
    personal_project: "Personal",
    personal_folder: "Folder"
  };
  return labels[type] ?? type;
}

export function getProjectName(project: Project): string {
  return getDisplayProject(project);
}

export function getProjectStatusBadges(project: Project): string[] {
  const badges: string[] = [];
  if (project.missingStatus === "missing") badges.push("Missing");
  if (project.duplicateStatus === "duplicate") badges.push("Duplicate");
  if (project.namingStatus === "invalid") badges.push("Bad name");
  if (project.namingStatus === "legacy") badges.push("Legacy name");
  if (project.moveStatus === "pending") badges.push("Move pending");
  return badges;
}
