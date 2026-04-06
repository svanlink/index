import type { CatalogRepository } from "@drive-project-catalog/data";
import type { ScanSessionSnapshot, ScanStartRequest } from "@drive-project-catalog/domain";
import {
  cancelDesktopScan,
  getDesktopScanSnapshot,
  isDesktopScanAvailable,
  listDesktopScanSnapshots,
  pickDesktopScanDirectory,
  startDesktopScan
} from "./scanCommands";

export interface StartCatalogScanInput extends ScanStartRequest {
  requestedDriveId?: string | null;
  requestedDriveName?: string | null;
}

export async function startCatalogScan(repository: CatalogRepository, input: StartCatalogScanInput) {
  const rootPath = input.rootPath.trim();
  if (!rootPath) {
    throw new Error("A scan target path is required.");
  }

  const response = await startDesktopScan({ rootPath });
  const startedAt = new Date().toISOString();
  const driveName = getDriveNameFromPath(rootPath);

  await repository.saveScanSession({
    scanId: response.scanId,
    rootPath,
    driveName,
    status: "running",
    startedAt,
    finishedAt: null,
    foldersScanned: 0,
    matchesFound: 0,
    error: null,
    sizeJobsPending: 0,
    projects: [],
    requestedDriveId: input.requestedDriveId ?? null,
    requestedDriveName: input.requestedDriveName ?? driveName,
    summary: null,
    createdAt: startedAt,
    updatedAt: startedAt
  });

  return {
    response,
    requestedDriveId: input.requestedDriveId ?? null,
    requestedDriveName: input.requestedDriveName ?? driveName
  };
}

export async function ingestScanSession(repository: CatalogRepository, session: ScanSessionSnapshot) {
  await repository.ingestScanSnapshot(session);
  return repository.getScanSession(session.scanId);
}

export async function syncDesktopScanSession(
  repository: CatalogRepository,
  scanId: string,
  requestedDriveId?: string | null
) {
  const persisted = await repository.getScanSession(scanId);
  const session = await getDesktopScanSnapshot(scanId);
  return ingestScanSession(repository, normalizeIncomingScanSession({
    ...session,
    requestedDriveId: requestedDriveId ?? session.requestedDriveId ?? null,
    requestedDriveName: session.requestedDriveName ?? session.driveName
  }, persisted));
}

export async function syncAllDesktopScanSessions(repository: CatalogRepository) {
  const sessions = await listDesktopScanSnapshots();
  const persistedSessions = await repository.listScanSessions();
  const persistedById = new Map(persistedSessions.map((session) => [session.scanId, session]));
  return Promise.all(
    sessions.map((session) =>
      ingestScanSession(repository, normalizeIncomingScanSession({
        ...session,
        requestedDriveId: session.requestedDriveId ?? null,
        requestedDriveName: session.requestedDriveName ?? session.driveName
      }, persistedById.get(session.scanId)))
    )
  );
}

export async function cancelCatalogScan(
  repository: CatalogRepository,
  scanId: string,
  requestedDriveId?: string | null
) {
  const persisted = await repository.getScanSession(scanId);
  const session = await cancelDesktopScan(scanId);
  return ingestScanSession(repository, normalizeIncomingScanSession({
    ...session,
    requestedDriveId: requestedDriveId ?? session.requestedDriveId ?? null,
    requestedDriveName: session.requestedDriveName ?? session.driveName
  }, persisted));
}

export async function reconcilePersistedScanSessions(repository: CatalogRepository) {
  const [persistedSessions, liveSessions] = await Promise.all([
    repository.listScanSessions(),
    listDesktopScanSnapshots()
  ]);
  const liveScanIds = new Set(liveSessions.map((session) => session.scanId));
  const now = new Date().toISOString();

  const interruptedUpdates = persistedSessions
    .filter((session) => session.status === "running" && !liveScanIds.has(session.scanId))
    .map((session) =>
      repository.saveScanSession({
        ...session,
        status: "interrupted",
        finishedAt: session.finishedAt ?? now,
        error: session.error ?? "The app restarted before this scan session could reconnect to a live desktop scan.",
        requestedDriveId: session.requestedDriveId ?? null,
        requestedDriveName: session.requestedDriveName ?? session.driveName,
        updatedAt: now
      })
    );

  const reconciledLiveSessions = await Promise.all(
    liveSessions.map((session) =>
      ingestScanSession(repository, normalizeIncomingScanSession({
        ...session,
        requestedDriveId: session.requestedDriveId ?? null,
        requestedDriveName: session.requestedDriveName ?? session.driveName
      }, persistedSessions.find((persisted) => persisted.scanId === session.scanId)))
    )
  );

  const interruptedSessions = await Promise.all(interruptedUpdates);

  return {
    liveSessions: reconciledLiveSessions.filter(Boolean),
    interruptedSessions
  };
}

export async function chooseCatalogScanDirectory(defaultPath?: string | null) {
  return pickDesktopScanDirectory(defaultPath);
}

export { isDesktopScanAvailable };

function getDriveNameFromPath(rootPath: string) {
  const segments = rootPath.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? rootPath;
}

function normalizeIncomingScanSession(
  session: ScanSessionSnapshot,
  persistedSession?: ScanSessionSnapshot | null
): ScanSessionSnapshot {
  const now = new Date().toISOString();

  return {
    ...session,
    createdAt: persistedSession?.createdAt ?? session.createdAt ?? session.startedAt,
    updatedAt: session.finishedAt ?? now
  };
}
