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

async function ingestScanSession(repository: CatalogRepository, session: ScanSessionSnapshot) {
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

  // H6: two ordered phases, never interleaved.
  //
  // Phase 1 — mark stale "running" persisted sessions as "interrupted".
  //   The previous implementation kicked off these saves eagerly via
  //   `.map(() => repository.saveScanSession(...))` and then raced the
  //   resulting promises against the live-session ingestion below. That
  //   meant observers of the repository could transiently see a session in
  //   an inconsistent state (still "running" while a later "completed"
  //   ingest was already applied on top of it, or a just-written
  //   "interrupted" being immediately followed by a running-state replay
  //   from an eager live poll). We now await Phase 1 in full before
  //   reading Phase 2's live snapshots, so Phase 2 sees a settled baseline.
  //
  // Phase 2 — ingest live sessions sequentially. Ingestion has side effects
  //   that read & rewrite the snapshot; running them in parallel against a
  //   single-writer adapter (SQLite, in-memory) would otherwise create
  //   "last writer wins" snapshot clobbers between concurrent calls.
  const staleRunning = persistedSessions.filter(
    (session) => session.status === "running" && !liveScanIds.has(session.scanId)
  );

  const interruptedSessions: ScanSessionSnapshot[] = [];
  for (const session of staleRunning) {
    const updated = await repository.saveScanSession({
      ...session,
      status: "interrupted",
      finishedAt: session.finishedAt ?? now,
      error:
        session.error ??
        "The app restarted before this scan session could reconnect to a live desktop scan.",
      requestedDriveId: session.requestedDriveId ?? null,
      requestedDriveName: session.requestedDriveName ?? session.driveName,
      updatedAt: now
    });
    interruptedSessions.push(updated);
  }

  const reconciledLiveSessions: ScanSessionSnapshot[] = [];
  for (const session of liveSessions) {
    const persisted = persistedSessions.find((entry) => entry.scanId === session.scanId);
    const reconciled = await ingestScanSession(
      repository,
      normalizeIncomingScanSession(
        {
          ...session,
          requestedDriveId: session.requestedDriveId ?? null,
          requestedDriveName: session.requestedDriveName ?? session.driveName
        },
        persisted
      )
    );
    if (reconciled) {
      reconciledLiveSessions.push(reconciled);
    }
  }

  return {
    liveSessions: reconciledLiveSessions,
    interruptedSessions
  };
}

export async function chooseCatalogScanDirectory(defaultPath?: string | null) {
  return pickDesktopScanDirectory(defaultPath);
}

export { isDesktopScanAvailable };

/**
 * Derives a drive display name from a scan root path.
 *
 * M4 hardening: empty / whitespace-only / separator-only inputs used to fall
 * through to an empty string (or to the raw separator), which downstream
 * `slugify()` calls turned into literal `drive-` IDs. We now trim
 * aggressively and fall back to a deterministic placeholder whenever no
 * meaningful path segment can be recovered, so the ID derivation is never
 * left with empty input.
 */
export function getDriveNameFromPath(rootPath: string): string {
  const segments = rootPath
    .split(/[\\/]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const lastSegment = segments.at(-1);
  if (lastSegment && lastSegment.length > 0) {
    return lastSegment;
  }
  return "Unnamed Drive";
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
