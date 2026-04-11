import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanSessionSnapshot } from "@drive-project-catalog/domain";
import { MockCatalogRepository } from "@drive-project-catalog/data";

// ---------------------------------------------------------------------------
// Mock the ./scanCommands Tauri bridge. The tests below drive
// reconcilePersistedScanSessions and getDriveNameFromPath, which must never
// touch the live Tauri runtime.
// ---------------------------------------------------------------------------

const listDesktopScanSnapshotsMock = vi.fn<() => Promise<ScanSessionSnapshot[]>>();
const startDesktopScanMock = vi.fn();
const cancelDesktopScanMock = vi.fn();
const getDesktopScanSnapshotMock = vi.fn();
const pickDesktopScanDirectoryMock = vi.fn();

vi.mock("./scanCommands", () => ({
  startDesktopScan: (...args: unknown[]) => startDesktopScanMock(...args),
  cancelDesktopScan: (...args: unknown[]) => cancelDesktopScanMock(...args),
  getDesktopScanSnapshot: (...args: unknown[]) => getDesktopScanSnapshotMock(...args),
  listDesktopScanSnapshots: () => listDesktopScanSnapshotsMock(),
  pickDesktopScanDirectory: (...args: unknown[]) => pickDesktopScanDirectoryMock(...args),
  isDesktopScanAvailable: () => false
}));

// eslint-disable-next-line import/first
import { getDriveNameFromPath, reconcilePersistedScanSessions } from "./catalogActions";

// ---------------------------------------------------------------------------
// M4 — getDriveNameFromPath
// ---------------------------------------------------------------------------

describe("S3/M4 — getDriveNameFromPath", () => {
  it("returns the last segment for a well-formed POSIX path", () => {
    expect(getDriveNameFromPath("/Volumes/Drive A")).toBe("Drive A");
  });

  it("returns the last segment for a well-formed Windows path", () => {
    expect(getDriveNameFromPath("C:\\Media\\Drive B")).toBe("Drive B");
  });

  it("trims surrounding whitespace in the path and in segments", () => {
    expect(getDriveNameFromPath("  /Volumes/  Drive C  ")).toBe("Drive C");
  });

  it("falls back to 'Unnamed Drive' for an empty string", () => {
    expect(getDriveNameFromPath("")).toBe("Unnamed Drive");
  });

  it("falls back to 'Unnamed Drive' for whitespace-only input", () => {
    expect(getDriveNameFromPath("   \t  ")).toBe("Unnamed Drive");
  });

  it("falls back to 'Unnamed Drive' for a separator-only POSIX path", () => {
    expect(getDriveNameFromPath("/")).toBe("Unnamed Drive");
  });

  it("falls back to 'Unnamed Drive' for a separator-only Windows path", () => {
    expect(getDriveNameFromPath("\\\\")).toBe("Unnamed Drive");
  });

  it("never returns a bare empty string that would produce slug 'drive-'", () => {
    // Defensive: even with degenerate whitespace/separator inputs, the result
    // must be non-empty so downstream slugify() calls produce a stable ID.
    const inputs = ["", " ", "/", "\\", "  /  ", "   //   "];
    for (const input of inputs) {
      const result = getDriveNameFromPath(input);
      expect(result.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// H6 — reconcilePersistedScanSessions ordering
// ---------------------------------------------------------------------------

describe("S3/H6 — reconcilePersistedScanSessions ordering", () => {
  beforeEach(() => {
    listDesktopScanSnapshotsMock.mockReset();
  });

  async function seedRunningSession(
    repository: MockCatalogRepository,
    scanId: string,
    driveName: string
  ): Promise<ScanSessionSnapshot> {
    const now = "2026-04-10T10:00:00.000Z";
    const session: ScanSessionSnapshot = {
      scanId,
      rootPath: `/Volumes/${driveName}`,
      driveName,
      status: "running",
      startedAt: now,
      finishedAt: null,
      foldersScanned: 0,
      matchesFound: 0,
      error: null,
      sizeJobsPending: 0,
      projects: [],
      requestedDriveId: null,
      requestedDriveName: driveName,
      summary: null,
      createdAt: now,
      updatedAt: now
    };
    await repository.saveScanSession(session);
    return session;
  }

  it("marks a running session as interrupted when no live snapshot exists", async () => {
    const repository = new MockCatalogRepository();
    await seedRunningSession(repository, "scan-dead-1", "Drive Dead");

    listDesktopScanSnapshotsMock.mockResolvedValue([]);

    const result = await reconcilePersistedScanSessions(repository);

    expect(result.interruptedSessions).toHaveLength(1);
    expect(result.interruptedSessions[0]!.status).toBe("interrupted");
    expect(result.interruptedSessions[0]!.error).toContain("restarted");

    const persisted = await repository.getScanSession("scan-dead-1");
    expect(persisted?.status).toBe("interrupted");
  });

  it("does not mark a running session as interrupted when a live snapshot exists", async () => {
    const repository = new MockCatalogRepository();
    await seedRunningSession(repository, "scan-live-1", "Drive Live");

    const liveSession: ScanSessionSnapshot = {
      scanId: "scan-live-1",
      rootPath: "/Volumes/Drive Live",
      driveName: "Drive Live",
      status: "running",
      startedAt: "2026-04-10T10:00:00.000Z",
      finishedAt: null,
      foldersScanned: 3,
      matchesFound: 1,
      error: null,
      sizeJobsPending: 0,
      projects: [],
      requestedDriveId: null,
      requestedDriveName: "Drive Live",
      summary: null,
      createdAt: "2026-04-10T10:00:00.000Z",
      updatedAt: "2026-04-10T10:00:30.000Z"
    };
    listDesktopScanSnapshotsMock.mockResolvedValue([liveSession]);

    const result = await reconcilePersistedScanSessions(repository);

    expect(result.interruptedSessions).toHaveLength(0);
    // The live session was ingested (running status can be upgraded later).
    const persisted = await repository.getScanSession("scan-live-1");
    expect(persisted?.status).toBe("running");
  });

  it("completes Phase 1 (interrupts) before Phase 2 (live ingest) — no interleaving", async () => {
    const repository = new MockCatalogRepository();
    await seedRunningSession(repository, "scan-dead-2", "Drive Dead");
    await seedRunningSession(repository, "scan-dead-3", "Drive Dead 2");

    // Track every call to saveScanSession and every call to ingestScanSnapshot
    // so we can assert every interrupt save resolves BEFORE any live ingest
    // begins.
    const callOrder: string[] = [];
    const originalSave = repository.saveScanSession.bind(repository);
    const originalIngest = repository.ingestScanSnapshot.bind(repository);

    repository.saveScanSession = async (session) => {
      if (session.status === "interrupted") {
        // simulate persistence latency
        await new Promise((resolve) => setTimeout(resolve, 5));
        callOrder.push(`interrupt:${session.scanId}`);
      }
      return originalSave(session);
    };
    repository.ingestScanSnapshot = async (session) => {
      callOrder.push(`ingest:${session.scanId}`);
      return originalIngest(session);
    };

    const liveSession: ScanSessionSnapshot = {
      scanId: "scan-live-2",
      rootPath: "/Volumes/Drive Live",
      driveName: "Drive Live",
      status: "completed",
      startedAt: "2026-04-10T10:00:00.000Z",
      finishedAt: "2026-04-10T10:05:00.000Z",
      foldersScanned: 5,
      matchesFound: 2,
      error: null,
      sizeJobsPending: 0,
      projects: [],
      requestedDriveId: null,
      requestedDriveName: "Drive Live",
      summary: null,
      createdAt: "2026-04-10T10:00:00.000Z",
      updatedAt: "2026-04-10T10:05:00.000Z"
    };
    listDesktopScanSnapshotsMock.mockResolvedValue([liveSession]);

    const result = await reconcilePersistedScanSessions(repository);

    expect(result.interruptedSessions).toHaveLength(2);
    expect(result.liveSessions).toHaveLength(1);

    // Every "interrupt:*" entry must appear BEFORE every "ingest:*" entry.
    const firstIngestIndex = callOrder.findIndex((entry) => entry.startsWith("ingest:"));
    const lastInterruptIndex = (() => {
      let idx = -1;
      callOrder.forEach((entry, i) => {
        if (entry.startsWith("interrupt:")) {
          idx = i;
        }
      });
      return idx;
    })();
    expect(lastInterruptIndex).toBeGreaterThanOrEqual(0);
    expect(firstIngestIndex).toBeGreaterThan(lastInterruptIndex);
  });

  it("ingests multiple live sessions sequentially (no parallel snapshot clobber)", async () => {
    const repository = new MockCatalogRepository();

    const inflight: string[] = [];
    const maxConcurrent = { value: 0 };
    const originalIngest = repository.ingestScanSnapshot.bind(repository);
    repository.ingestScanSnapshot = async (session) => {
      inflight.push(session.scanId);
      maxConcurrent.value = Math.max(maxConcurrent.value, inflight.length);
      // yield to event loop so that true parallel calls would overlap here
      await new Promise((resolve) => setTimeout(resolve, 2));
      const result = await originalIngest(session);
      inflight.splice(inflight.indexOf(session.scanId), 1);
      return result;
    };

    const liveSessions: ScanSessionSnapshot[] = ["scan-a", "scan-b", "scan-c"].map((scanId) => ({
      scanId,
      rootPath: `/Volumes/${scanId}`,
      driveName: scanId,
      status: "completed" as const,
      startedAt: "2026-04-10T10:00:00.000Z",
      finishedAt: "2026-04-10T10:05:00.000Z",
      foldersScanned: 1,
      matchesFound: 0,
      error: null,
      sizeJobsPending: 0,
      projects: [],
      requestedDriveId: null,
      requestedDriveName: scanId,
      summary: null,
      createdAt: "2026-04-10T10:00:00.000Z",
      updatedAt: "2026-04-10T10:05:00.000Z"
    }));
    listDesktopScanSnapshotsMock.mockResolvedValue(liveSessions);

    await reconcilePersistedScanSessions(repository);

    expect(maxConcurrent.value).toBe(1);
  });
});
