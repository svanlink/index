import {
  getDisplayProject,
  getDriveCapacitySnapshot,
  getProjectStatusState,
  toScanSummary,
  type Drive,
  type Project
} from "@drive-project-catalog/domain";
import type { CatalogSnapshot } from "./localPersistence";
import type { DashboardSnapshot, MoveReminder, ProjectListFilters, StatusAlert } from "./repository";

export interface DriveDetailView {
  drive: Drive;
  projects: Project[];
  incomingProjects: Project[];
  missingProjects: Project[];
}

const clone = <T>(value: T): T => structuredClone(value);

export function sortProjects(projects: Project[]) {
  return clone(projects).sort((left, right) => {
    const leftKey = left.correctedDate ?? left.parsedDate ?? left.folderName;
    const rightKey = right.correctedDate ?? right.parsedDate ?? right.folderName;
    return rightKey.localeCompare(leftKey);
  });
}

export function decorateDrivesWithCapacity(drives: Drive[], projects: Project[]) {
  return drives.map((drive) => {
    const capacity = getDriveCapacitySnapshot(drive, projects);

    return {
      ...drive,
      reservedIncomingBytes: capacity.reservedIncomingBytes
    };
  });
}

/**
 * Resolve a driveId to a display name using an already-built lookup map.
 * Prefer this over `getDriveNameById` in hot paths (e.g. filter/search over
 * many projects) to avoid O(projects × drives) linear scans.
 */
export function getDriveNameFromMap(
  driveNameMap: ReadonlyMap<string, string>,
  driveId: string | null
): string {
  if (!driveId) {
    return "Unassigned";
  }
  return driveNameMap.get(driveId) ?? "Unknown drive";
}

/**
 * Build a driveId → displayName lookup for use with {@link getDriveNameFromMap}.
 * Callers that resolve more than one drive name from the same drives array
 * should build this once and reuse it.
 */
export function buildDriveNameMap(drives: Drive[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const drive of drives) {
    map.set(drive.id, drive.displayName);
  }
  return map;
}

export function getDriveNameById(drives: Drive[], driveId: string | null) {
  if (!driveId) {
    return "Unassigned";
  }

  return drives.find((drive) => drive.id === driveId)?.displayName ?? "Unknown drive";
}

export function filterProjects(projects: Project[], drives: Drive[], filters?: ProjectListFilters) {
  if (!filters) {
    return projects;
  }

  // Build drive-name map once so the search haystack is O(projects) rather
  // than O(projects × drives). Only needed when a search query is present.
  const driveNameMap = filters.search ? buildDriveNameMap(drives) : null;

  return projects.filter((project) => {
    const state = getProjectStatusState(project);

    if (filters.status === "unassigned" && !state.isUnassigned) {
      return false;
    }
    if (filters.status === "missing" && !state.isMissing) {
      return false;
    }
    if (filters.status === "duplicate" && !state.isDuplicate) {
      return false;
    }
    if (filters.currentDriveId && project.currentDriveId !== filters.currentDriveId) {
      return false;
    }
    if (filters.search && driveNameMap) {
      const query = filters.search.toLowerCase();
      const haystack = [
        project.folderName,
        project.parsedDate,
        project.parsedClient,
        project.parsedProject,
        project.correctedClient ?? "",
        project.correctedProject ?? "",
        project.category ?? "",
        getDriveNameFromMap(driveNameMap, project.currentDriveId),
        getDriveNameFromMap(driveNameMap, project.targetDriveId)
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(query)) {
        return false;
      }
    }

    return true;
  });
}

export function buildMoveReminders(projects: Project[], drives: Drive[]): MoveReminder[] {
  const driveNameMap = buildDriveNameMap(drives);
  return projects
    .filter((project) => project.moveStatus === "pending" && project.targetDriveId !== null)
    .map((project) => ({
      projectId: project.id,
      projectName: project.folderName,
      currentDriveName: getDriveNameFromMap(driveNameMap, project.currentDriveId),
      targetDriveName: getDriveNameFromMap(driveNameMap, project.targetDriveId),
      sizeBytes: project.sizeBytes
    }));
}

export function buildStatusAlerts(projects: Project[], drives: Drive[]): StatusAlert[] {
  const driveNameMap = buildDriveNameMap(drives);
  return projects.flatMap((project) => {
    const state = getProjectStatusState(project);
    const alerts: StatusAlert[] = [];

    if (state.isMissing) {
      alerts.push({
        kind: "missing",
        projectId: project.id,
        projectName: project.folderName,
        detail: `Last seen on ${getDriveNameFromMap(driveNameMap, project.currentDriveId)}`
      });
    }
    if (state.isDuplicate) {
      alerts.push({
        kind: "duplicate",
        projectId: project.id,
        projectName: project.folderName,
        detail: `${getDisplayProject(project)} requires review across drives`
      });
    }
    if (state.isUnassigned) {
      alerts.push({
        kind: "unassigned",
        projectId: project.id,
        projectName: project.folderName,
        detail: "Waiting for a current drive assignment"
      });
    }

    return alerts;
  });
}

export function buildDashboardSnapshot(snapshot: CatalogSnapshot): DashboardSnapshot {
  const drives = decorateDrivesWithCapacity(snapshot.drives, snapshot.projects);
  const projects = sortProjects(snapshot.projects);
  const recentScans = [...snapshot.scanSessions]
    .filter((session) => session.status !== "running")
    .sort((left, right) => (right.finishedAt ?? right.startedAt).localeCompare(left.finishedAt ?? left.startedAt))
    .slice(0, 2)
    .map((session) => {
      const drive =
        (session.requestedDriveId ? drives.find((entry) => entry.id === session.requestedDriveId) : null) ??
        drives.find((entry) => entry.volumeName === session.driveName || entry.displayName === session.driveName) ??
        null;

      return drive
        ? toScanSummary(drive, snapshot.projects)
        : {
            id: session.scanId,
            driveId: null,
            driveName: session.requestedDriveName ?? session.driveName,
            lastScannedAt: session.finishedAt ?? session.startedAt,
            projectCount: session.matchesFound,
            totalCapacityBytes: null,
            freeBytes: null,
            reservedIncomingBytes: 0
          };
    });

  return {
    recentScans,
    recentProjects: projects.slice(0, 5),
    moveReminders: buildMoveReminders(snapshot.projects, drives),
    statusAlerts: buildStatusAlerts(snapshot.projects, drives)
  };
}

export function buildDriveDetailView(snapshot: CatalogSnapshot, driveId: string): DriveDetailView | null {
  const drives = decorateDrivesWithCapacity(snapshot.drives, snapshot.projects);
  const drive = drives.find((entry) => entry.id === driveId);

  if (!drive) {
    return null;
  }

  return {
    drive,
    projects: snapshot.projects.filter(
      (project) => project.currentDriveId === driveId && project.missingStatus !== "missing"
    ),
    incomingProjects: snapshot.projects.filter(
      (project) => project.targetDriveId === driveId && project.moveStatus === "pending"
    ),
    missingProjects: snapshot.projects.filter(
      (project) => project.currentDriveId === driveId && project.missingStatus === "missing"
    )
  };
}
