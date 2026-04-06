import {
  calculateReservedIncomingBytes,
  hasUnknownIncomingImpact,
  type Drive,
  type Project
} from "@drive-project-catalog/domain";

const NEAR_CAPACITY_ABSOLUTE_BYTES = 250_000_000_000;
const NEAR_CAPACITY_RATIO = 0.1;

export type DriveHealthState = "healthy" | "near-capacity" | "overcommitted" | "unknown-impact";

export interface StoragePlanningRow {
  drive: Drive;
  health: DriveHealthState;
  usedBytes: number | null;
  freeBytes: number | null;
  reservedIncomingBytes: number;
  effectiveFreeBytes: number | null;
  rawEffectiveFreeBytes: number | null;
  hasUnknownIncomingImpact: boolean;
  currentProjects: Project[];
  incomingProjects: Project[];
  outgoingProjects: Project[];
  projectCount: number;
  pendingIncomingMoveCount: number;
  pendingOutgoingMoveCount: number;
  knownIncomingBytes: number;
  unknownIncomingCount: number;
}

export interface StoragePlanningSummary {
  totalDrives: number;
  overcommittedCount: number;
  nearCapacityCount: number;
  unknownImpactCount: number;
  totalReservedIncomingBytes: number;
  unassignedProjectCount: number;
}

export function buildStoragePlanningRows(drives: Drive[], projects: Project[]) {
  return [...drives]
    .map((drive) => buildStoragePlanningRow(drive, projects))
    .sort(compareStoragePlanningRows);
}

export function buildStoragePlanningSummary(rows: StoragePlanningRow[], projects: Project[]): StoragePlanningSummary {
  return {
    totalDrives: rows.length,
    overcommittedCount: rows.filter((row) => row.health === "overcommitted").length,
    nearCapacityCount: rows.filter((row) => row.health === "near-capacity").length,
    unknownImpactCount: rows.filter((row) => row.hasUnknownIncomingImpact).length,
    totalReservedIncomingBytes: rows.reduce((total, row) => total + row.reservedIncomingBytes, 0),
    unassignedProjectCount: projects.filter((project) => project.currentDriveId === null).length
  };
}

export function getDriveHealthLabel(health: DriveHealthState) {
  return health === "near-capacity"
    ? "Near capacity"
    : health === "overcommitted"
      ? "Overcommitted"
      : health === "unknown-impact"
        ? "Unknown impact"
        : "Healthy";
}

function buildStoragePlanningRow(drive: Drive, projects: Project[]): StoragePlanningRow {
  const currentProjects = projects.filter(
    (project) => project.currentDriveId === drive.id && project.missingStatus !== "missing"
  );
  const incomingProjects = projects.filter(
    (project) => project.targetDriveId === drive.id && project.moveStatus === "pending"
  );
  const outgoingProjects = projects.filter(
    (project) => project.currentDriveId === drive.id && project.moveStatus === "pending" && project.targetDriveId !== drive.id
  );
  const reservedIncomingBytes = calculateReservedIncomingBytes(projects, drive.id);
  const unknownIncomingCount = incomingProjects.filter((project) => project.sizeBytes === null).length;
  const knownIncomingBytes = incomingProjects.reduce((total, project) => total + (project.sizeBytes ?? 0), 0);
  const rawEffectiveFreeBytes = drive.freeBytes === null ? null : drive.freeBytes - reservedIncomingBytes;
  const effectiveFreeBytes = rawEffectiveFreeBytes === null ? null : Math.max(rawEffectiveFreeBytes, 0);
  const hasUnknownIncoming = hasUnknownIncomingImpact(projects, drive.id);

  return {
    drive,
    health: getDriveHealthState({
      drive,
      effectiveFreeBytes,
      rawEffectiveFreeBytes,
      hasUnknownIncomingImpact: hasUnknownIncoming
    }),
    usedBytes: drive.usedBytes,
    freeBytes: drive.freeBytes,
    reservedIncomingBytes,
    effectiveFreeBytes,
    rawEffectiveFreeBytes,
    hasUnknownIncomingImpact: hasUnknownIncoming,
    currentProjects,
    incomingProjects,
    outgoingProjects,
    projectCount: currentProjects.length,
    pendingIncomingMoveCount: incomingProjects.length,
    pendingOutgoingMoveCount: outgoingProjects.length,
    knownIncomingBytes,
    unknownIncomingCount
  };
}

function getDriveHealthState(params: {
  drive: Drive;
  effectiveFreeBytes: number | null;
  rawEffectiveFreeBytes: number | null;
  hasUnknownIncomingImpact: boolean;
}): DriveHealthState {
  if (params.rawEffectiveFreeBytes !== null && params.rawEffectiveFreeBytes < 0) {
    return "overcommitted";
  }

  if (params.hasUnknownIncomingImpact) {
    return "unknown-impact";
  }

  if (params.effectiveFreeBytes === null) {
    return "healthy";
  }

  const nearByAbsolute = params.effectiveFreeBytes <= NEAR_CAPACITY_ABSOLUTE_BYTES;
  const nearByRatio =
    params.drive.totalCapacityBytes !== null &&
    params.drive.totalCapacityBytes > 0 &&
    params.effectiveFreeBytes / params.drive.totalCapacityBytes <= NEAR_CAPACITY_RATIO;

  if (nearByAbsolute || nearByRatio) {
    return "near-capacity";
  }

  return "healthy";
}

function compareStoragePlanningRows(left: StoragePlanningRow, right: StoragePlanningRow) {
  const leftPriority = left.health === "overcommitted" ? 0 : 1;
  const rightPriority = right.health === "overcommitted" ? 0 : 1;

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  const leftEffective = left.effectiveFreeBytes ?? Number.POSITIVE_INFINITY;
  const rightEffective = right.effectiveFreeBytes ?? Number.POSITIVE_INFINITY;

  if (leftEffective !== rightEffective) {
    return leftEffective - rightEffective;
  }

  return left.drive.displayName.localeCompare(right.drive.displayName);
}
