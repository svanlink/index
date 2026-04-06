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
  return clone(projects).sort((left, right) => right.parsedDate.localeCompare(left.parsedDate));
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
    if (filters.search) {
      const query = filters.search.toLowerCase();
      const haystack = [
        project.parsedDate,
        project.parsedClient,
        project.parsedProject,
        project.correctedClient ?? "",
        project.correctedProject ?? "",
        project.category ?? "",
        getDriveNameById(drives, project.currentDriveId),
        getDriveNameById(drives, project.targetDriveId)
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
  return projects
    .filter((project) => project.moveStatus === "pending" && project.targetDriveId !== null)
    .map((project) => ({
      projectId: project.id,
      projectName: `${project.parsedDate}_${project.parsedClient}_${getDisplayProject(project)}`,
      currentDriveName: getDriveNameById(drives, project.currentDriveId),
      targetDriveName: getDriveNameById(drives, project.targetDriveId),
      sizeBytes: project.sizeBytes
    }));
}

export function buildStatusAlerts(projects: Project[], drives: Drive[]): StatusAlert[] {
  return projects.flatMap((project) => {
    const state = getProjectStatusState(project);
    const alerts: StatusAlert[] = [];

    if (state.isMissing) {
      alerts.push({
        kind: "missing",
        projectId: project.id,
        projectName: `${project.parsedDate}_${project.parsedClient}_${project.parsedProject}`,
        detail: `Last seen on ${getDriveNameById(drives, project.currentDriveId)}`
      });
    }
    if (state.isDuplicate) {
      alerts.push({
        kind: "duplicate",
        projectId: project.id,
        projectName: `${project.parsedDate}_${project.parsedClient}_${project.parsedProject}`,
        detail: `${getDisplayProject(project)} requires review across drives`
      });
    }
    if (state.isUnassigned) {
      alerts.push({
        kind: "unassigned",
        projectId: project.id,
        projectName: `${project.parsedDate}_${project.parsedClient}_${project.parsedProject}`,
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
