import { describe, expect, it } from "vitest";
import type { ScanSessionSnapshot } from "@drive-project-catalog/domain";
import {
  parseScanSessionSnapshot,
  parseScanSessionSnapshotList,
  ScanSnapshotValidationError
} from "./scanSnapshotSchema";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function validSnapshot(): ScanSessionSnapshot {
  return {
    scanId: "scan-1",
    rootPath: "/Volumes/Alpha",
    driveName: "Alpha",
    status: "running",
    startedAt: "2026-04-10T10:00:00.000Z",
    finishedAt: null,
    foldersScanned: 12,
    matchesFound: 4,
    error: null,
    sizeJobsPending: 2,
    projects: [
      {
        id: "p-1",
        folderName: "240401_Acme_Shoot",
        folderPath: "/Volumes/Alpha/240401_Acme_Shoot",
        relativePath: "240401_Acme_Shoot",
        folderType: "client",
        parsedDate: "240401",
        parsedClient: "Acme",
        parsedProject: "Shoot",
        sourceDriveName: "Alpha",
        scanTimestamp: "2026-04-10T10:00:05.000Z",
        sizeStatus: "pending",
        sizeBytes: null,
        sizeError: null
      }
    ],
    requestedDriveId: "drive-alpha",
    requestedDriveName: "Alpha",
    summary: null,
    createdAt: "2026-04-10T10:00:00.000Z",
    updatedAt: "2026-04-10T10:00:05.000Z"
  };
}

describe("parseScanSessionSnapshot — happy path", () => {
  it("accepts a fully-valid snapshot and returns a strongly-typed result", () => {
    const snapshot = validSnapshot();
    const result = parseScanSessionSnapshot(snapshot);
    expect(result).toEqual(snapshot);
    // Reference identity is NOT preserved — we rebuild the object — so a
    // caller mutating the return value won't poison the raw IPC payload.
    expect(result).not.toBe(snapshot);
  });

  it("accepts every declared ScanStatus literal", () => {
    for (const status of ["running", "completed", "cancelled", "failed", "interrupted"] as const) {
      const raw = { ...validSnapshot(), status };
      expect(() => parseScanSessionSnapshot(raw)).not.toThrow();
    }
  });

  it("accepts every declared SizeStatus literal on a project record", () => {
    for (const sizeStatus of ["unknown", "pending", "ready", "failed"] as const) {
      const raw = validSnapshot();
      raw.projects[0]!.sizeStatus = sizeStatus;
      expect(() => parseScanSessionSnapshot(raw)).not.toThrow();
    }
  });

  it("accepts summary when it is populated", () => {
    const raw = validSnapshot();
    raw.summary = {
      newProjectsCount: 3,
      updatedProjectsCount: 1,
      missingProjectsCount: 0,
      duplicatesFlaggedCount: 0,
      durationMs: 1250
    };
    const result = parseScanSessionSnapshot(raw);
    expect(result.summary).toEqual(raw.summary);
  });

  it("preserves optional requestedDriveId/requestedDriveName distinctions (undefined vs null)", () => {
    const raw = validSnapshot();
    raw.requestedDriveId = undefined;
    raw.requestedDriveName = null;
    const result = parseScanSessionSnapshot(raw);
    expect(result.requestedDriveId).toBeUndefined();
    expect(result.requestedDriveName).toBeNull();
  });
});

describe("parseScanSessionSnapshot — enum violations (M6 core)", () => {
  it("rejects a typo in project.sizeStatus", () => {
    const raw = validSnapshot();
    // Realistic failure mode: Rust-side typo, e.g. `"reddy"` instead of `"ready"`
    (raw.projects[0] as unknown as Record<string, unknown>).sizeStatus = "reddy";
    expect(() => parseScanSessionSnapshot(raw)).toThrow(ScanSnapshotValidationError);

    try {
      parseScanSessionSnapshot(raw);
    } catch (error) {
      expect(error).toBeInstanceOf(ScanSnapshotValidationError);
      const validationError = error as ScanSnapshotValidationError;
      expect(validationError.path).toBe("snapshot.projects[0].sizeStatus");
      expect(validationError.actual).toBe("reddy");
      expect(validationError.message).toContain("sizeStatus");
      expect(validationError.message).toContain("reddy");
    }
  });

  it("rejects an unknown ScanStatus value", () => {
    const raw = validSnapshot();
    (raw as unknown as Record<string, unknown>).status = "in-progress";
    expect(() => parseScanSessionSnapshot(raw)).toThrow(ScanSnapshotValidationError);
  });

  it("rejects an unknown FolderType value", () => {
    const raw = validSnapshot();
    (raw.projects[0] as unknown as Record<string, unknown>).folderType = "enterprise";
    expect(() => parseScanSessionSnapshot(raw)).toThrow(ScanSnapshotValidationError);
  });

  it("reports the offending project index in the error path", () => {
    const raw = validSnapshot();
    // Add a second project whose sizeStatus is valid, then corrupt index 0
    raw.projects.push({ ...raw.projects[0]!, id: "p-2" });
    (raw.projects[0] as unknown as Record<string, unknown>).sizeStatus = "done";
    expect(() => parseScanSessionSnapshot(raw)).toThrow(/projects\[0\].sizeStatus/);
  });
});

describe("parseScanSessionSnapshot — shape violations", () => {
  it("rejects a null snapshot", () => {
    expect(() => parseScanSessionSnapshot(null)).toThrow(ScanSnapshotValidationError);
  });

  it("rejects a primitive snapshot", () => {
    expect(() => parseScanSessionSnapshot("oops")).toThrow(ScanSnapshotValidationError);
  });

  it("rejects a snapshot missing required string fields", () => {
    const raw = validSnapshot() as unknown as Record<string, unknown>;
    delete raw.rootPath;
    expect(() => parseScanSessionSnapshot(raw)).toThrow(/rootPath/);
  });

  it("rejects non-finite numbers (NaN) in numeric counters", () => {
    const raw = validSnapshot();
    (raw as unknown as Record<string, unknown>).foldersScanned = Number.NaN;
    expect(() => parseScanSessionSnapshot(raw)).toThrow(/foldersScanned/);
  });

  it("rejects a non-array projects field", () => {
    const raw = validSnapshot() as unknown as Record<string, unknown>;
    raw.projects = { length: 0 };
    expect(() => parseScanSessionSnapshot(raw)).toThrow(/projects/);
  });

  it("rejects a project record with a numeric folderName", () => {
    const raw = validSnapshot();
    (raw.projects[0] as unknown as Record<string, unknown>).folderName = 42;
    expect(() => parseScanSessionSnapshot(raw)).toThrow(/projects\[0\].folderName/);
  });
});

describe("parseScanSessionSnapshotList", () => {
  it("accepts an empty list", () => {
    expect(parseScanSessionSnapshotList([])).toEqual([]);
  });

  it("accepts a list of valid snapshots", () => {
    const list = [validSnapshot(), { ...validSnapshot(), scanId: "scan-2" }];
    expect(parseScanSessionSnapshotList(list)).toHaveLength(2);
  });

  it("rejects a non-array input", () => {
    expect(() => parseScanSessionSnapshotList({ length: 0 })).toThrow(
      ScanSnapshotValidationError
    );
  });

  it("reports the offending index when one entry in the list is invalid", () => {
    const list = [validSnapshot(), validSnapshot()];
    (list[1] as unknown as Record<string, unknown>).status = "bogus";
    expect(() => parseScanSessionSnapshotList(list)).toThrow(/snapshots\[1\].status/);
  });
});
