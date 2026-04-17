import { describe, expect, it } from "vitest";
import type { ScanProjectRecord, ScanSessionSnapshot } from "@drive-project-catalog/domain";
import type { CatalogSnapshot } from "./localPersistence";
import { mockCatalogSnapshot } from "./testing/mockData";
import { ingestScanSessionSnapshot } from "./scanIngestionService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmptySnapshot(): CatalogSnapshot {
  return { drives: [], projects: [], scans: [], projectScanEvents: [], scanSessions: [] };
}

function makeSession(
  projects: ScanProjectRecord[],
  overrides?: Partial<ScanSessionSnapshot>
): ScanSessionSnapshot {
  return {
    scanId: "scan-test-1",
    rootPath: "/Volumes/TestDrive",
    driveName: "TestDrive",
    status: "completed",
    startedAt: "2026-04-08T09:00:00.000Z",
    finishedAt: "2026-04-08T09:05:00.000Z",
    foldersScanned: projects.length,
    matchesFound: projects.length,
    error: null,
    sizeJobsPending: 0,
    createdAt: "2026-04-08T09:00:00.000Z",
    updatedAt: "2026-04-08T09:05:00.000Z",
    projects,
    ...overrides
  };
}

function makeRecord(overrides: Partial<ScanProjectRecord> & { folderName: string }): ScanProjectRecord {
  return {
    id: `scan-${overrides.folderName}`,
    folderType: "personal_folder",
    folderPath: `/Volumes/TestDrive/${overrides.folderName}`,
    relativePath: overrides.folderName,
    parsedDate: null,
    parsedClient: null,
    parsedProject: null,
    sourceDriveName: "TestDrive",
    scanTimestamp: "2026-04-08T09:01:00.000Z",
    sizeStatus: "ready",
    sizeBytes: 1_000_000,
    sizeError: null,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Case A — Standard client folder (YYMMDD_ClientName_ProjectName)
// ---------------------------------------------------------------------------

describe("Case A — client folder classification", () => {
  it("classifies a standard YYMMDD_Client_Project folder as client", () => {
    const session = makeSession([
      makeRecord({
        folderType: "client",
        folderName: "240401_Apple_ProductShoot",
        parsedDate: "240401",
        parsedClient: "Apple",
        parsedProject: "ProductShoot"
      })
    ]);

    const result = ingestScanSessionSnapshot(makeEmptySnapshot(), session);
    const project = result.snapshot.projects[0]!;

    expect(project.folderType).toBe("client");
    expect(project.isStandardized).toBe(true);
    expect(project.parsedDate).toBe("240401");
    expect(project.parsedClient).toBe("Apple");
    expect(project.parsedProject).toBe("ProductShoot");
    expect(project.folderName).toBe("240401_Apple_ProductShoot");
  });

  it("stores correctedClient/correctedProject as null on first ingest — never auto-populated", () => {
    const session = makeSession([
      makeRecord({
        folderType: "client",
        folderName: "240401_Apple_ProductShoot",
        parsedDate: "240401",
        parsedClient: "Apple",
        parsedProject: "ProductShoot"
      })
    ]);

    const result = ingestScanSessionSnapshot(makeEmptySnapshot(), session);
    const project = result.snapshot.projects[0]!;

    expect(project.correctedDate).toBeNull();
    expect(project.correctedClient).toBeNull();
    expect(project.correctedProject).toBeNull();
  });

  it("does not mutate the folderPath during ingest", () => {
    const session = makeSession([
      makeRecord({
        folderType: "client",
        folderName: "240401_Apple_ProductShoot",
        folderPath: "/Volumes/Drive A/240401_Apple_ProductShoot",
        parsedDate: "240401",
        parsedClient: "Apple",
        parsedProject: "ProductShoot"
      })
    ]);

    const result = ingestScanSessionSnapshot(makeEmptySnapshot(), session);
    const project = result.snapshot.projects[0]!;

    expect(project.folderPath).toBe("/Volumes/Drive A/240401_Apple_ProductShoot");
    expect(project.folderName).toBe("240401_Apple_ProductShoot");
  });
});

// ---------------------------------------------------------------------------
// Case B — Standard personal project (YYMMDD_Internal_ProjectName)
// ---------------------------------------------------------------------------

describe("Case B — personal_project classification", () => {
  it("classifies a YYMMDD_Internal_Project folder as personal_project", () => {
    const session = makeSession([
      makeRecord({
        folderType: "personal_project",
        folderName: "240316_Internal_Archive",
        parsedDate: "240316",
        parsedClient: "Internal",
        parsedProject: "Archive"
      })
    ]);

    const result = ingestScanSessionSnapshot(makeEmptySnapshot(), session);
    const project = result.snapshot.projects[0]!;

    expect(project.folderType).toBe("personal_project");
    expect(project.isStandardized).toBe(true);
    expect(project.parsedDate).toBe("240316");
    expect(project.parsedClient).toBe("Internal");
    expect(project.parsedProject).toBe("Archive");
  });

  it("treats only the exact literal 'Internal' as the personal_project client token", () => {
    // A folder like "240316_internal_Foo" (lowercase) would still be classified as
    // client by the Rust engine since exact-case "Internal" is required.
    // This test verifies the JS layer stores whatever folderType the engine emits.
    const lowercaseSession = makeSession([
      makeRecord({
        folderType: "client", // Rust emitted "client" because "internal" ≠ "Internal"
        folderName: "240316_internal_Foo",
        parsedDate: "240316",
        parsedClient: "internal",
        parsedProject: "Foo"
      })
    ]);

    const result = ingestScanSessionSnapshot(makeEmptySnapshot(), lowercaseSession);
    expect(result.snapshot.projects[0]!.folderType).toBe("client");
  });
});

// ---------------------------------------------------------------------------
// Case C — Non-standard folder (personal_folder)
// ---------------------------------------------------------------------------

describe("Case C — personal_folder classification", () => {
  const nonStandardFolders = ["Tutorials", "LUTs", "Exports_old", "RandomFolder"];

  for (const name of nonStandardFolders) {
    it(`stores '${name}' as personal_folder with null parsed fields`, () => {
      const session = makeSession([makeRecord({ folderName: name })]);
      const result = ingestScanSessionSnapshot(makeEmptySnapshot(), session);
      const project = result.snapshot.projects[0]!;

      expect(project.folderType).toBe("personal_folder");
      expect(project.isStandardized).toBe(false);
      expect(project.parsedDate).toBeNull();
      expect(project.parsedClient).toBeNull();
      expect(project.parsedProject).toBeNull();
      expect(project.folderName).toBe(name); // raw name preserved
    });
  }

  it("stores all non-standard folders — none are skipped", () => {
    const session = makeSession(
      nonStandardFolders.map((name) => makeRecord({ folderName: name }))
    );

    const result = ingestScanSessionSnapshot(makeEmptySnapshot(), session);

    expect(result.snapshot.projects).toHaveLength(nonStandardFolders.length);
    expect(result.snapshot.projects.every((p) => p.folderType === "personal_folder")).toBe(true);
  });

  it("does not rename or normalise the folderName during ingest", () => {
    const session = makeSession([makeRecord({ folderName: "Exports_old" })]);
    const result = ingestScanSessionSnapshot(makeEmptySnapshot(), session);

    expect(result.snapshot.projects[0]!.folderName).toBe("Exports_old");
    expect(result.snapshot.projects[0]!.folderPath).toBe("/Volumes/TestDrive/Exports_old");
  });

  it("re-scans an existing personal_folder by folderName identity", () => {
    const first = makeSession([makeRecord({ folderName: "Tutorials", sizeBytes: 500_000 })]);
    const firstResult = ingestScanSessionSnapshot(makeEmptySnapshot(), first);

    const second = makeSession([makeRecord({ folderName: "Tutorials", sizeBytes: 800_000 })], {
      scanId: "scan-test-2"
    });
    const secondResult = ingestScanSessionSnapshot(firstResult.snapshot, second);

    // Should update, not create a duplicate entry
    expect(secondResult.snapshot.projects).toHaveLength(1);
    expect(secondResult.snapshot.projects[0]!.sizeBytes).toBe(800_000);
  });
});

// ---------------------------------------------------------------------------
// Case D — Mixed scan (structured + personal_folder on same drive)
// ---------------------------------------------------------------------------

describe("Case D — mixed scan with structured and personal_folder entries", () => {
  const mixedSession = () =>
    makeSession([
      makeRecord({
        folderType: "client",
        folderName: "240401_Apple_ProductShoot",
        parsedDate: "240401",
        parsedClient: "Apple",
        parsedProject: "ProductShoot"
      }),
      makeRecord({
        folderType: "personal_project",
        folderName: "240316_Internal_Archive",
        parsedDate: "240316",
        parsedClient: "Internal",
        parsedProject: "Archive"
      }),
      makeRecord({ folderName: "Tutorials" }),
      makeRecord({ folderName: "LUTs" }),
      makeRecord({ folderName: "Exports_old" })
    ]);

  it("ingests all five records — none are dropped", () => {
    const result = ingestScanSessionSnapshot(makeEmptySnapshot(), mixedSession());
    expect(result.snapshot.projects).toHaveLength(5);
  });

  it("preserves folder types across all records", () => {
    const result = ingestScanSessionSnapshot(makeEmptySnapshot(), mixedSession());
    const byName = Object.fromEntries(result.snapshot.projects.map((p) => [p.folderName, p.folderType]));

    expect(byName["240401_Apple_ProductShoot"]).toBe("client");
    expect(byName["240316_Internal_Archive"]).toBe("personal_project");
    expect(byName["Tutorials"]).toBe("personal_folder");
    expect(byName["LUTs"]).toBe("personal_folder");
    expect(byName["Exports_old"]).toBe("personal_folder");
  });

  it("personal_folder entries have null parsed fields, structured entries have non-null", () => {
    const result = ingestScanSessionSnapshot(makeEmptySnapshot(), mixedSession());

    for (const project of result.snapshot.projects) {
      if (project.folderType === "personal_folder") {
        expect(project.parsedDate).toBeNull();
        expect(project.parsedClient).toBeNull();
        expect(project.parsedProject).toBeNull();
      } else {
        expect(project.parsedDate).not.toBeNull();
        expect(project.parsedProject).not.toBeNull();
      }
    }
  });

  it("records all five entries in the scan summary", () => {
    const result = ingestScanSessionSnapshot(makeEmptySnapshot(), mixedSession());
    const summary = result.session.summary!;
    expect(summary.newProjectsCount).toBe(5);
    expect(summary.updatedProjectsCount).toBe(0);
  });

  it("second scan of the same drive updates existing records — no duplicates created", () => {
    const first = ingestScanSessionSnapshot(makeEmptySnapshot(), mixedSession());
    const second = ingestScanSessionSnapshot(first.snapshot, {
      ...mixedSession(),
      scanId: "scan-test-2"
    });

    expect(second.snapshot.projects).toHaveLength(5);
    expect(second.session.summary!.updatedProjectsCount).toBe(5);
    expect(second.session.summary!.newProjectsCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Case D (continued) — Late cancel after scan work finished
// ---------------------------------------------------------------------------

describe("Case D — late cancel after completed scan", () => {
  it("does not overwrite a completed session with a subsequent cancelled status", () => {
    const completedSession = makeSession([], {
      scanId: "scan-drive-a-late-cancel",
      status: "completed",
      finishedAt: "2026-04-08T09:05:00.000Z"
    });

    const firstResult = ingestScanSessionSnapshot(mockCatalogSnapshot, completedSession);

    const cancelledSession = makeSession([], {
      scanId: "scan-drive-a-late-cancel",
      status: "cancelled",
      finishedAt: "2026-04-08T09:05:30.000Z" // arrives 30s later
    });

    const secondResult = ingestScanSessionSnapshot(firstResult.snapshot, cancelledSession);

    const storedSession = secondResult.snapshot.scanSessions.find(
      (s) => s.scanId === "scan-drive-a-late-cancel"
    );
    const storedScan = secondResult.snapshot.scans.find(
      (s) => s.id === "scan-drive-a-late-cancel"
    );

    expect(storedSession?.status).toBe("completed");
    expect(storedScan?.status).toBe("completed");
  });

  it("does not overwrite a completed session with an interrupted status", () => {
    const completedSession = makeSession([], {
      scanId: "scan-drive-a-interrupt-race",
      status: "completed",
      finishedAt: "2026-04-08T09:05:00.000Z"
    });

    const firstResult = ingestScanSessionSnapshot(mockCatalogSnapshot, completedSession);

    const interruptedSession = makeSession([], {
      scanId: "scan-drive-a-interrupt-race",
      status: "interrupted"
    });

    const secondResult = ingestScanSessionSnapshot(firstResult.snapshot, interruptedSession);
    const storedSession = secondResult.snapshot.scanSessions.find(
      (s) => s.scanId === "scan-drive-a-interrupt-race"
    );

    expect(storedSession?.status).toBe("completed");
  });

  it("allows an interrupted session to be superseded by completed", () => {
    const interruptedSession = makeSession([], {
      scanId: "scan-drive-a-recovery",
      status: "interrupted"
    });

    const firstResult = ingestScanSessionSnapshot(mockCatalogSnapshot, interruptedSession);

    const completedSession = makeSession([], {
      scanId: "scan-drive-a-recovery",
      status: "completed",
      finishedAt: "2026-04-08T09:10:00.000Z"
    });

    const secondResult = ingestScanSessionSnapshot(firstResult.snapshot, completedSession);
    const storedSession = secondResult.snapshot.scanSessions.find(
      (s) => s.scanId === "scan-drive-a-recovery"
    );

    expect(storedSession?.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// S3/H7 — Expanded status priority (running, failed)
// ---------------------------------------------------------------------------

describe("S3/H7 — terminal status priority (running, failed)", () => {
  it("does not overwrite a completed session with a stale running snapshot", () => {
    const completedSession = makeSession([], {
      scanId: "scan-h7-completed-running",
      status: "completed",
      finishedAt: "2026-04-10T12:00:00.000Z"
    });
    const firstResult = ingestScanSessionSnapshot(mockCatalogSnapshot, completedSession);

    const staleRunningSession = makeSession([], {
      scanId: "scan-h7-completed-running",
      status: "running",
      finishedAt: null
    });
    const secondResult = ingestScanSessionSnapshot(firstResult.snapshot, staleRunningSession);

    const stored = secondResult.snapshot.scanSessions.find(
      (s) => s.scanId === "scan-h7-completed-running"
    );
    expect(stored?.status).toBe("completed");
  });

  it("does not overwrite a failed session with a stale running snapshot", () => {
    const failedSession = makeSession([], {
      scanId: "scan-h7-failed-running",
      status: "failed",
      error: "disk IO error",
      finishedAt: "2026-04-10T12:00:00.000Z"
    });
    const firstResult = ingestScanSessionSnapshot(mockCatalogSnapshot, failedSession);

    const staleRunningSession = makeSession([], {
      scanId: "scan-h7-failed-running",
      status: "running",
      finishedAt: null
    });
    const secondResult = ingestScanSessionSnapshot(firstResult.snapshot, staleRunningSession);

    const stored = secondResult.snapshot.scanSessions.find(
      (s) => s.scanId === "scan-h7-failed-running"
    );
    expect(stored?.status).toBe("failed");
  });

  it("does not overwrite a failed session with a stale completed snapshot", () => {
    // failed is ranked highest — a completion that was already in flight when
    // the engine gave up must not silently erase the failure signal.
    const failedSession = makeSession([], {
      scanId: "scan-h7-failed-completed",
      status: "failed",
      error: "abort",
      finishedAt: "2026-04-10T12:00:00.000Z"
    });
    const firstResult = ingestScanSessionSnapshot(mockCatalogSnapshot, failedSession);

    const staleCompletedSession = makeSession([], {
      scanId: "scan-h7-failed-completed",
      status: "completed",
      finishedAt: "2026-04-10T12:00:30.000Z"
    });
    const secondResult = ingestScanSessionSnapshot(firstResult.snapshot, staleCompletedSession);

    const stored = secondResult.snapshot.scanSessions.find(
      (s) => s.scanId === "scan-h7-failed-completed"
    );
    expect(stored?.status).toBe("failed");
  });

  it("allows a failed session to supersede a completed one (upgrade)", () => {
    // completed → failed is an upgrade: failing is a stronger terminal signal
    // than the earlier completion, so we keep the failed status.
    const completedSession = makeSession([], {
      scanId: "scan-h7-completed-failed",
      status: "completed",
      finishedAt: "2026-04-10T12:00:00.000Z"
    });
    const firstResult = ingestScanSessionSnapshot(mockCatalogSnapshot, completedSession);

    const failedSession = makeSession([], {
      scanId: "scan-h7-completed-failed",
      status: "failed",
      error: "verify step failed",
      finishedAt: "2026-04-10T12:01:00.000Z"
    });
    const secondResult = ingestScanSessionSnapshot(firstResult.snapshot, failedSession);

    const stored = secondResult.snapshot.scanSessions.find(
      (s) => s.scanId === "scan-h7-completed-failed"
    );
    expect(stored?.status).toBe("failed");
  });

  it("allows a running session to be replaced by a terminal status (upgrade)", () => {
    const runningSession = makeSession([], {
      scanId: "scan-h7-running-completed",
      status: "running",
      finishedAt: null
    });
    const firstResult = ingestScanSessionSnapshot(mockCatalogSnapshot, runningSession);

    const completedSession = makeSession([], {
      scanId: "scan-h7-running-completed",
      status: "completed",
      finishedAt: "2026-04-10T12:05:00.000Z"
    });
    const secondResult = ingestScanSessionSnapshot(firstResult.snapshot, completedSession);

    const stored = secondResult.snapshot.scanSessions.find(
      (s) => s.scanId === "scan-h7-running-completed"
    );
    expect(stored?.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// Original regression tests
// ---------------------------------------------------------------------------

describe("ingestScanSessionSnapshot", () => {
  it("creates or updates scanned projects and stores the scan session", () => {
    const session: ScanSessionSnapshot = {
      scanId: "scan-drive-a-20260406",
      rootPath: "/Volumes/Drive A",
      driveName: "Drive A",
      status: "completed",
      startedAt: "2026-04-06T09:00:00.000Z",
      finishedAt: "2026-04-06T09:05:00.000Z",
      foldersScanned: 8,
      matchesFound: 1,
      error: null,
      sizeJobsPending: 0,
      createdAt: "2026-04-06T09:00:00.000Z",
      updatedAt: "2026-04-06T09:05:00.000Z",
      projects: [
        {
          id: "scan-project-1",
          folderType: "client" as const,
          folderName: "240401_Apple_ProductShoot",
          folderPath: "/Volumes/Drive A/240401_Apple_ProductShoot",
          relativePath: "240401_Apple_ProductShoot",
          parsedDate: "240401",
          parsedClient: "Apple",
          parsedProject: "ProductShoot",
          sourceDriveName: "Drive A",
          scanTimestamp: "2026-04-06T09:03:00.000Z",
          sizeStatus: "ready",
          sizeBytes: 125_000_000_000,
          sizeError: null
        }
      ]
    };

    const result = ingestScanSessionSnapshot(mockCatalogSnapshot, session);
    const updatedProject = result.snapshot.projects.find((project) => project.id === "project-240401-apple-shoot");

    expect(updatedProject?.sizeBytes).toBe(125_000_000_000);
    expect(updatedProject?.lastSeenAt).toBe("2026-04-06T09:03:00.000Z");
    expect(result.snapshot.scans.some((scan) => scan.id === session.scanId)).toBe(true);
    expect(result.snapshot.scanSessions.some((entry) => entry.scanId === session.scanId)).toBe(true);
    expect(result.snapshot.projectScanEvents.some((event) => event.scanId === session.scanId)).toBe(true);
    expect(result.session.summary?.updatedProjectsCount).toBe(1);
    expect(result.session.summary?.durationMs).toBe(300000);
  });

  it("marks previously seen projects as missing when a drive scan completes without them", () => {
    const session: ScanSessionSnapshot = {
      scanId: "scan-drive-b-20260406",
      rootPath: "/Volumes/Drive B",
      driveName: "Drive B",
      status: "completed",
      startedAt: "2026-04-06T11:00:00.000Z",
      finishedAt: "2026-04-06T11:05:00.000Z",
      foldersScanned: 4,
      matchesFound: 0,
      error: null,
      sizeJobsPending: 0,
      createdAt: "2026-04-06T11:00:00.000Z",
      updatedAt: "2026-04-06T11:05:00.000Z",
      projects: []
    };

    const result = ingestScanSessionSnapshot(mockCatalogSnapshot, session);
    const missingProject = result.snapshot.projects.find((project) => project.id === "project-240320-nike-ad");

    expect(missingProject?.missingStatus).toBe("missing");
    expect(missingProject?.currentDriveId).toBe("drive-b");
    expect(result.session.summary?.missingProjectsCount).toBeGreaterThan(0);
  });
});
