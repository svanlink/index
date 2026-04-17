import type { Drive, Project, ProjectScanEvent, ScanRecord, ScanSessionSnapshot, ScanSummary } from "@drive-project-catalog/domain";
import type { DashboardSnapshot, MoveReminder, StatusAlert } from "../repository";
import type { CatalogSnapshot } from "../localPersistence";

const now = "2026-04-06T10:30:00.000Z";

export const mockDrives: Drive[] = [
  {
    id: "drive-a",
    volumeName: "Drive A",
    displayName: "Drive A",
    totalCapacityBytes: 2_000_000_000_000,
    usedBytes: 1_200_000_000_000,
    freeBytes: 800_000_000_000,
    reservedIncomingBytes: 120_000_000_000,
    lastScannedAt: "2026-04-05T18:20:00.000Z",
    createdManually: false,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "drive-b",
    volumeName: "Drive B",
    displayName: "Drive B",
    totalCapacityBytes: 1_000_000_000_000,
    usedBytes: 850_000_000_000,
    freeBytes: 150_000_000_000,
    reservedIncomingBytes: 85_000_000_000,
    lastScannedAt: "2026-04-04T12:05:00.000Z",
    createdManually: false,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "drive-c",
    volumeName: "Freezer Drive",
    displayName: "Freezer Drive",
    totalCapacityBytes: 4_000_000_000_000,
    usedBytes: 2_700_000_000_000,
    freeBytes: 1_300_000_000_000,
    reservedIncomingBytes: 0,
    lastScannedAt: "2026-03-18T08:40:00.000Z",
    createdManually: true,
    createdAt: now,
    updatedAt: now
  }
];

export const mockProjects: Project[] = [
  {
    id: "project-240401-apple-shoot",
    folderType: "client",
    isStandardized: true,
    folderName: "240401_Apple_ProductShoot",
    folderPath: "/Volumes/Drive A/240401_Apple_ProductShoot",
    parsedDate: "240401",
    parsedClient: "Apple",
    parsedProject: "ProductShoot",
    correctedDate: null,
    correctedClient: null,
    correctedProject: "Apple Product Shoot",
    category: "photo",
    sizeBytes: 120_000_000_000,
    sizeStatus: "ready",
    currentDriveId: "drive-a",
    targetDriveId: null,
    moveStatus: "none",
    missingStatus: "normal",
    duplicateStatus: "normal",
    isUnassigned: false,
    isManual: false,
    lastSeenAt: "2026-04-05T18:20:00.000Z",
    lastScannedAt: "2026-04-05T18:20:00.000Z",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "project-240320-nike-ad",
    folderType: "client",
    isStandardized: true,
    folderName: "240320_Nike_Ad",
    folderPath: "/Volumes/Drive B/240320_Nike_Ad",
    parsedDate: "240320",
    parsedClient: "Nike",
    parsedProject: "Ad",
    correctedDate: null,
    correctedClient: null,
    correctedProject: null,
    category: "video",
    sizeBytes: 85_000_000_000,
    sizeStatus: "ready",
    currentDriveId: "drive-b",
    targetDriveId: "drive-c",
    moveStatus: "pending",
    missingStatus: "normal",
    duplicateStatus: "normal",
    isUnassigned: false,
    isManual: false,
    lastSeenAt: "2026-04-04T12:05:00.000Z",
    lastScannedAt: "2026-04-04T12:05:00.000Z",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "project-240316-personal",
    folderType: "personal_project",
    isStandardized: true,
    folderName: "240316_Internal_Archive",
    folderPath: "/Volumes/Drive A/240316_Internal_Archive",
    parsedDate: "240316",
    parsedClient: "Internal",
    parsedProject: "Archive",
    correctedDate: null,
    correctedClient: null,
    correctedProject: "Personal Archive",
    category: "personal",
    sizeBytes: 65_000_000_000,
    sizeStatus: "ready",
    currentDriveId: "drive-a",
    targetDriveId: null,
    moveStatus: "none",
    missingStatus: "normal",
    duplicateStatus: "duplicate",
    isUnassigned: false,
    isManual: false,
    lastSeenAt: "2026-04-05T18:20:00.000Z",
    lastScannedAt: "2026-04-05T18:20:00.000Z",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "project-240316-personal-dup",
    folderType: "personal_project",
    isStandardized: true,
    folderName: "240316_Internal_Archive",
    folderPath: "/Volumes/Freezer Drive/240316_Internal_Archive",
    parsedDate: "240316",
    parsedClient: "Internal",
    parsedProject: "Archive",
    correctedDate: null,
    correctedClient: null,
    correctedProject: "Personal Archive",
    category: "personal",
    sizeBytes: 65_000_000_000,
    sizeStatus: "ready",
    currentDriveId: "drive-c",
    targetDriveId: null,
    moveStatus: "none",
    missingStatus: "normal",
    duplicateStatus: "duplicate",
    isUnassigned: false,
    isManual: false,
    lastSeenAt: "2026-03-18T08:40:00.000Z",
    lastScannedAt: "2026-03-18T08:40:00.000Z",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "project-240215-adidas-social",
    folderType: "client",
    isStandardized: true,
    folderName: "240215_Adidas_SocialContent",
    folderPath: null,
    parsedDate: "240215",
    parsedClient: "Adidas",
    parsedProject: "SocialContent",
    // M3 — this row exercises the correctedDate override branch. Mock
    // snapshots must have at least one project whose correctedDate is
    // non-null so consumers of getDisplayDate() can't silently regress
    // the "correctedDate wins over parsedDate" semantics.
    correctedDate: "240301",
    correctedClient: null,
    correctedProject: "Adidas Social",
    category: "design",
    sizeBytes: null,
    sizeStatus: "unknown",
    currentDriveId: null,
    targetDriveId: "drive-b",
    moveStatus: "pending",
    missingStatus: "normal",
    duplicateStatus: "normal",
    isUnassigned: true,
    isManual: true,
    lastSeenAt: null,
    lastScannedAt: null,
    createdAt: now,
    updatedAt: now
  },
  {
    id: "project-240228-clientx-concept",
    folderType: "client",
    isStandardized: true,
    folderName: "240228_ClientX_Concept",
    folderPath: "/Volumes/Drive B/240228_ClientX_Concept",
    parsedDate: "240228",
    parsedClient: "ClientX",
    parsedProject: "Concept",
    correctedDate: null,
    correctedClient: null,
    correctedProject: null,
    category: "design",
    sizeBytes: 24_000_000_000,
    sizeStatus: "ready",
    currentDriveId: "drive-b",
    targetDriveId: null,
    moveStatus: "none",
    missingStatus: "missing",
    duplicateStatus: "normal",
    isUnassigned: false,
    isManual: false,
    lastSeenAt: "2026-03-10T17:20:00.000Z",
    lastScannedAt: "2026-04-04T12:05:00.000Z",
    createdAt: now,
    updatedAt: now
  }
];

export const mockRecentScans: ScanSummary[] = [
  {
    id: "scan-drive-a-20260405",
    driveId: "drive-a",
    driveName: "Drive A",
    lastScannedAt: "2026-04-05T18:20:00.000Z",
    projectCount: 12,
    totalCapacityBytes: 2_000_000_000_000,
    freeBytes: 800_000_000_000,
    reservedIncomingBytes: 120_000_000_000
  },
  {
    id: "scan-drive-b-20260404",
    driveId: "drive-b",
    driveName: "Drive B",
    lastScannedAt: "2026-04-04T12:05:00.000Z",
    projectCount: 9,
    totalCapacityBytes: 1_000_000_000_000,
    freeBytes: 150_000_000_000,
    reservedIncomingBytes: 85_000_000_000
  }
];

export const mockScans: ScanRecord[] = [
  {
    id: "scan-drive-a-20260405",
    driveId: "drive-a",
    startedAt: "2026-04-05T18:00:00.000Z",
    finishedAt: "2026-04-05T18:20:00.000Z",
    status: "completed",
    foldersScanned: 48,
    matchesFound: 12,
    notes: null,
    createdAt: "2026-04-05T18:00:00.000Z",
    updatedAt: "2026-04-05T18:20:00.000Z"
  },
  {
    id: "scan-drive-b-20260404",
    driveId: "drive-b",
    startedAt: "2026-04-04T11:45:00.000Z",
    finishedAt: "2026-04-04T12:05:00.000Z",
    status: "completed",
    foldersScanned: 39,
    matchesFound: 9,
    notes: null,
    createdAt: "2026-04-04T11:45:00.000Z",
    updatedAt: "2026-04-04T12:05:00.000Z"
  }
];

export const mockProjectScanEvents: ProjectScanEvent[] = [
  {
    id: "event-project-apple-drive-a",
    projectId: "project-240401-apple-shoot",
    scanId: "scan-drive-a-20260405",
    observedFolderName: "240401_Apple_ProductShoot",
    observedDriveName: "Drive A",
    observedFolderType: "client",
    observedAt: "2026-04-05T18:10:00.000Z",
    createdAt: "2026-04-05T18:10:00.000Z",
    updatedAt: "2026-04-05T18:10:00.000Z"
  },
  {
    id: "event-project-nike-drive-b",
    projectId: "project-240320-nike-ad",
    scanId: "scan-drive-b-20260404",
    observedFolderName: "240320_Nike_Ad",
    observedDriveName: "Drive B",
    observedFolderType: "client",
    observedAt: "2026-04-04T11:58:00.000Z",
    createdAt: "2026-04-04T11:58:00.000Z",
    updatedAt: "2026-04-04T11:58:00.000Z"
  }
];

export const mockScanSessions: ScanSessionSnapshot[] = [
  {
    scanId: "scan-drive-a-20260405",
    rootPath: "/Volumes/Drive A",
    driveName: "Drive A",
    status: "completed",
    startedAt: "2026-04-05T18:00:00.000Z",
    finishedAt: "2026-04-05T18:20:00.000Z",
    foldersScanned: 48,
    matchesFound: 12,
    error: null,
    sizeJobsPending: 0,
    projects: [],
    createdAt: "2026-04-05T18:00:00.000Z",
    updatedAt: "2026-04-05T18:20:00.000Z"
  },
  {
    scanId: "scan-drive-b-20260404",
    rootPath: "/Volumes/Drive B",
    driveName: "Drive B",
    status: "completed",
    startedAt: "2026-04-04T11:45:00.000Z",
    finishedAt: "2026-04-04T12:05:00.000Z",
    foldersScanned: 39,
    matchesFound: 9,
    error: null,
    sizeJobsPending: 0,
    projects: [],
    createdAt: "2026-04-04T11:45:00.000Z",
    updatedAt: "2026-04-04T12:05:00.000Z"
  }
];

export const mockMoveReminders: MoveReminder[] = [
  {
    projectId: "project-240320-nike-ad",
    projectName: "240320_Nike_Ad",
    currentDriveName: "Drive B",
    targetDriveName: "Freezer Drive",
    sizeBytes: 85_000_000_000
  },
  {
    projectId: "project-240215-adidas-social",
    projectName: "240215_Adidas_SocialContent",
    currentDriveName: "Unassigned",
    targetDriveName: "Drive B",
    sizeBytes: null
  }
];

export const mockStatusAlerts: StatusAlert[] = [
  {
    kind: "missing",
    projectId: "project-240228-clientx-concept",
    projectName: "240228_ClientX_Concept",
    detail: "Last seen on Drive B"
  },
  {
    kind: "duplicate",
    projectId: "project-240316-personal",
    projectName: "240316_Personal_Archive",
    detail: "Found on Drive A and Freezer Drive"
  },
  {
    kind: "unassigned",
    projectId: "project-240215-adidas-social",
    projectName: "240215_Adidas_SocialContent",
    detail: "Waiting for a current drive assignment"
  }
];

export const mockDashboardSnapshot: DashboardSnapshot = {
  recentScans: mockRecentScans,
  recentProjects: mockProjects.slice(0, 5),
  moveReminders: mockMoveReminders,
  statusAlerts: mockStatusAlerts
};

export const mockCatalogSnapshot: CatalogSnapshot = {
  drives: mockDrives,
  projects: mockProjects,
  scans: mockScans,
  projectScanEvents: mockProjectScanEvents,
  scanSessions: mockScanSessions
};
