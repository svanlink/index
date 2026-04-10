import type { Drive } from "./drive";
import type { Project } from "./project";
import type { DriveCapacitySnapshot, ScanSummary } from "./scan";

export interface ProjectStatusState {
  isMissing: boolean;
  isDuplicate: boolean;
  isMovePending: boolean;
  isUnassigned: boolean;
  hasUnknownSizeImpact: boolean;
}

export function getDisplayDate(project: Project) {
  return project.correctedDate ?? project.parsedDate ?? null;
}

export function getDisplayClient(project: Project) {
  return project.correctedClient ?? project.parsedClient ?? project.folderName;
}

export function getDisplayProject(project: Project) {
  return project.correctedProject ?? project.parsedProject ?? project.folderName;
}

export function getParsedFolderName(project: Project) {
  if (project.parsedDate && project.parsedClient && project.parsedProject) {
    return `${project.parsedDate}_${project.parsedClient}_${project.parsedProject}`;
  }
  return project.folderName;
}

export function applyDerivedProjectStates(projects: Project[]): Project[] {
  const duplicateIds = getDuplicateProjectIds(projects);

  return projects.map((project): Project => ({
    ...project,
    duplicateStatus: duplicateIds.has(project.id) ? "duplicate" : "normal",
    isUnassigned: project.currentDriveId === null
  }));
}

export function getProjectStatusState(project: Project): ProjectStatusState {
  return {
    isMissing: project.missingStatus === "missing",
    isDuplicate: project.duplicateStatus === "duplicate",
    isMovePending: project.moveStatus === "pending",
    isUnassigned: project.isUnassigned || project.currentDriveId === null,
    hasUnknownSizeImpact: project.moveStatus === "pending" && project.sizeBytes === null
  };
}

export function getProjectStatusLabels(project: Project) {
  const state = getProjectStatusState(project);
  const labels: string[] = [];

  if (state.isUnassigned) {
    labels.push("Unassigned");
  }
  if (state.isMovePending) {
    labels.push("Move pending");
  }
  if (state.isMissing) {
    labels.push("Missing");
  }
  if (state.isDuplicate) {
    labels.push("Duplicate");
  }
  if (state.hasUnknownSizeImpact) {
    labels.push("Unknown size impact");
  }

  return labels.length > 0 ? labels : ["Normal"];
}

export function calculateReservedIncomingBytes(projects: Project[], driveId: string) {
  return projects.reduce((total, project) => {
    if (project.targetDriveId !== driveId || project.moveStatus !== "pending" || project.sizeBytes === null) {
      return total;
    }

    return total + project.sizeBytes;
  }, 0);
}

export function hasUnknownIncomingImpact(projects: Project[], driveId: string) {
  return projects.some(
    (project) => project.targetDriveId === driveId && project.moveStatus === "pending" && project.sizeBytes === null
  );
}

export function getDriveCapacitySnapshot(drive: Drive, projects: Project[]): DriveCapacitySnapshot {
  const reservedIncomingBytes = calculateReservedIncomingBytes(projects, drive.id);
  const hasUnknownIncoming = hasUnknownIncomingImpact(projects, drive.id);
  const remainingFreeBytes = drive.freeBytes === null ? null : Math.max(drive.freeBytes - reservedIncomingBytes, 0);

  return {
    reservedIncomingBytes,
    remainingFreeBytes,
    hasUnknownIncoming
  };
}

export function toScanSummary(drive: Drive, projects: Project[]): ScanSummary {
  const capacity = getDriveCapacitySnapshot(drive, projects);
  const projectCount = projects.filter((project) => project.currentDriveId === drive.id).length;

  return {
    id: `scan-summary-${drive.id}`,
    driveId: drive.id,
    driveName: drive.displayName,
    lastScannedAt: drive.lastScannedAt,
    projectCount,
    totalCapacityBytes: drive.totalCapacityBytes,
    freeBytes: drive.freeBytes,
    reservedIncomingBytes: capacity.reservedIncomingBytes
  };
}

function getDuplicateProjectIds(projects: Project[]) {
  const buckets = new Map<string, Project[]>();

  for (const project of projects) {
    // personal_folder records have no parsed identity — bucket by raw folder name,
    // unless the user has assigned corrected structured fields (upgrade scenario).
    const effectiveDate = project.correctedDate ?? project.parsedDate;
    const effectiveClient = project.correctedClient ?? project.parsedClient;
    const effectiveProject = project.correctedProject ?? project.parsedProject;
    const key =
      project.folderType === "personal_folder" && !effectiveDate
        ? `folder::${project.folderName}`
        : [effectiveDate, effectiveClient, effectiveProject].join("::");
    const bucket = buckets.get(key);

    if (bucket) {
      bucket.push(project);
      continue;
    }

    buckets.set(key, [project]);
  }

  const duplicateIds = new Set<string>();

  for (const bucket of buckets.values()) {
    const driveIds = new Set(bucket.map((project) => project.currentDriveId ?? "unassigned"));
    if (bucket.length > 1 && driveIds.size > 1) {
      bucket.forEach((project) => duplicateIds.add(project.id));
    }
  }

  return duplicateIds;
}
