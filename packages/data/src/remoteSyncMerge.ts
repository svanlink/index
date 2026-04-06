import { applyDerivedProjectStates, type Drive, type Project, type ProjectScanEvent, type ScanRecord, type ScanSessionSnapshot } from "@drive-project-catalog/domain";
import type { LocalPersistenceAdapter } from "./localPersistence";
import type { RemoteSyncChange } from "./sync";

export async function applyRemoteSyncChanges(params: {
  persistence: LocalPersistenceAdapter;
  changes: RemoteSyncChange[];
}) {
  if (params.changes.length === 0) {
    return { appliedCount: 0 };
  }

  const snapshot = await params.persistence.readSnapshot();
  const driveMap = new Map(snapshot.drives.map((drive) => [drive.id, drive] as const));
  const scanMap = new Map(snapshot.scans.map((scan) => [scan.id, scan] as const));
  const eventMap = new Map(snapshot.projectScanEvents.map((event) => [event.id, event] as const));
  const sessionMap = new Map(snapshot.scanSessions.map((session) => [session.scanId, session] as const));
  const projectMap = new Map(snapshot.projects.map((project) => [project.id, project] as const));

  let appliedCount = 0;
  let shouldRecomputeProjects = false;

  for (const change of params.changes) {
    switch (change.entity) {
      case "drive": {
        const remoteDrive = change.payload as Drive;
        const localDrive = driveMap.get(remoteDrive.id);
        if (!shouldApplyRemote(localDrive?.updatedAt, change.remoteUpdatedAt)) {
          continue;
        }
        driveMap.set(remoteDrive.id, remoteDrive);
        appliedCount += 1;
        break;
      }
      case "project": {
        const remoteProject = change.payload as Project;
        const localProject = projectMap.get(remoteProject.id);
        if (!shouldApplyRemote(localProject?.updatedAt, change.remoteUpdatedAt)) {
          continue;
        }
        projectMap.set(remoteProject.id, remoteProject);
        shouldRecomputeProjects = true;
        appliedCount += 1;
        break;
      }
      case "scan": {
        const remoteScan = change.payload as ScanRecord;
        const localScan = scanMap.get(remoteScan.id);
        if (!shouldApplyRemote(localScan?.updatedAt, change.remoteUpdatedAt)) {
          continue;
        }
        scanMap.set(remoteScan.id, remoteScan);
        appliedCount += 1;
        break;
      }
      case "projectScanEvent": {
        const remoteEvent = change.payload as ProjectScanEvent;
        const localEvent = eventMap.get(remoteEvent.id);
        if (!shouldApplyRemote(localEvent?.updatedAt, change.remoteUpdatedAt)) {
          continue;
        }
        eventMap.set(remoteEvent.id, remoteEvent);
        appliedCount += 1;
        break;
      }
      case "scanSession": {
        const remoteSession = change.payload as ScanSessionSnapshot;
        const localSession = sessionMap.get(remoteSession.scanId);
        if (!shouldApplyRemote(localSession?.updatedAt, change.remoteUpdatedAt)) {
          continue;
        }
        sessionMap.set(remoteSession.scanId, mergeRemoteScanSession(localSession, remoteSession));
        appliedCount += 1;
        break;
      }
    }
  }

  if (shouldRecomputeProjects) {
    const nextProjects = applyDerivedProjectStates(Array.from(projectMap.values()));
    const changedProjects = getChangedById(snapshot.projects, nextProjects);
    if (changedProjects.length > 0) {
      await params.persistence.upsertProjects(changedProjects);
    }
  }

  const changedDrives = getChangedById(snapshot.drives, Array.from(driveMap.values()));
  if (changedDrives.length > 0) {
    await params.persistence.upsertDrives(changedDrives);
  }

  const changedScans = getChangedById(snapshot.scans, Array.from(scanMap.values()));
  for (const scan of changedScans) {
    await params.persistence.upsertScan(scan);
  }

  const changedEvents = getChangedById(snapshot.projectScanEvents, Array.from(eventMap.values()));
  if (changedEvents.length > 0) {
    await params.persistence.upsertProjectScanEvents(changedEvents);
  }

  const changedSessions = getChangedByScanId(snapshot.scanSessions, Array.from(sessionMap.values()));
  for (const session of changedSessions) {
    await params.persistence.upsertScanSession(session);
  }

  return { appliedCount };
}

function shouldApplyRemote(localUpdatedAt: string | undefined, remoteUpdatedAt: string) {
  if (!localUpdatedAt) {
    return true;
  }

  return remoteUpdatedAt > localUpdatedAt;
}

function mergeRemoteScanSession(local: ScanSessionSnapshot | undefined, remote: ScanSessionSnapshot): ScanSessionSnapshot {
  return {
    ...remote,
    rootPath: local?.rootPath ?? remote.rootPath ?? "",
    projects: local?.projects ?? remote.projects ?? [],
    requestedDriveId: remote.requestedDriveId ?? local?.requestedDriveId ?? null,
    requestedDriveName: remote.requestedDriveName ?? local?.requestedDriveName ?? null,
    summary: remote.summary ?? local?.summary ?? null,
    createdAt: local?.createdAt ?? remote.createdAt,
    updatedAt: remote.updatedAt
  };
}

function getChangedById<T extends { id: string }>(previous: T[], next: T[]) {
  const previousById = new Map(previous.map((item) => [item.id, item] as const));
  return next.filter((item) => JSON.stringify(previousById.get(item.id)) !== JSON.stringify(item));
}

function getChangedByScanId<T extends { scanId: string }>(previous: T[], next: T[]) {
  const previousById = new Map(previous.map((item) => [item.scanId, item] as const));
  return next.filter((item) => JSON.stringify(previousById.get(item.scanId)) !== JSON.stringify(item));
}
