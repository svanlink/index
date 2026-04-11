import { describe, expect, it } from "vitest";
import type {
  Drive,
  Project,
  ProjectScanEvent,
  ScanRecord,
  ScanSessionSnapshot
} from "@drive-project-catalog/domain";
import {
  fromSupabaseDriveRow,
  fromSupabaseProjectRow,
  fromSupabaseProjectScanEventRow,
  fromSupabaseScanRow,
  fromSupabaseScanSessionRow,
  localOnlySyncFields,
  toSupabaseDriveRow,
  toSupabaseProjectRow,
  toSupabaseProjectScanEventRow,
  toSupabaseScanRow,
  toSupabaseScanSessionRow,
  type SupabaseDriveRow,
  type SupabaseProjectRow,
  type SupabaseProjectScanEventRow,
  type SupabaseScanRow,
  type SupabaseScanSessionRow
} from "./supabaseSyncMapping";

// S5 / M1 — Symmetry contract for `supabaseSyncMapping`.
//
// Every domain field MUST round-trip cleanly through `to → from` UNLESS it
// is listed in `localOnlySyncFields`. This test is the single enforcement
// point: any field added to a domain type that is forgotten in the mapper
// will fail here, preventing silent zero-ing on push or pull.
//
// Per-entity layout:
//   1. Build a fully-populated, non-default domain object.
//   2. Run it through `to`, then through `from`.
//   3. Diff against the original; assert exact equality on every field
//      EXCEPT the ones declared local-only.

const baseTimestamps = {
  createdAt: "2026-04-01T08:00:00.000Z",
  updatedAt: "2026-04-09T15:30:00.000Z"
};

function omit<T extends object, K extends readonly (keyof T | string)[]>(
  source: T,
  keys: K
): Omit<T, Extract<K[number], keyof T>> {
  const next = { ...source } as Record<string, unknown>;
  for (const key of keys) {
    delete next[key as string];
  }
  return next as Omit<T, Extract<K[number], keyof T>>;
}

describe("supabaseSyncMapping — round-trip symmetry", () => {
  describe("Drive", () => {
    const fullyPopulatedDrive: Drive = {
      id: "drive-symmetry-001",
      volumeName: "WD_BLACK_8TB",
      displayName: "Archive Drive 01",
      totalCapacityBytes: 8_000_000_000_000,
      usedBytes: 5_500_000_000_000,
      freeBytes: 2_500_000_000_000,
      reservedIncomingBytes: 750_000_000_000, // local-only / derived
      lastScannedAt: "2026-04-08T22:14:00.000Z",
      createdManually: true,
      ...baseTimestamps
    };

    it("preserves every non-local-only field through to → from", () => {
      const row = toSupabaseDriveRow(fullyPopulatedDrive);
      const restored = fromSupabaseDriveRow(row as SupabaseDriveRow);

      const expected = omit(fullyPopulatedDrive, localOnlySyncFields.drive);
      const actual = omit(restored, localOnlySyncFields.drive);

      expect(actual).toEqual(expected);
    });

    it("does not include any local-only field on the projected row", () => {
      const row = toSupabaseDriveRow(fullyPopulatedDrive) as Record<string, unknown>;

      // The local-only field names use camelCase in the domain. The row uses
      // snake_case keys. The contract is that NO column on the row corresponds
      // to a local-only field. We assert by name on both sides for robustness.
      expect(row).not.toHaveProperty("reservedIncomingBytes");
      expect(row).not.toHaveProperty("reserved_incoming_bytes");
    });

    it("seeds reservedIncomingBytes to 0 on pull (caller must recompute via getDriveCapacitySnapshot)", () => {
      const row = toSupabaseDriveRow(fullyPopulatedDrive) as SupabaseDriveRow;
      const restored = fromSupabaseDriveRow(row);
      expect(restored.reservedIncomingBytes).toBe(0);
    });
  });

  describe("Project", () => {
    const fullyPopulatedProject: Project = {
      id: "project-symmetry-001",
      folderType: "personal_project",
      isStandardized: true,
      folderName: "240409_AcmeCo_LaunchVideo",
      folderPath: "/Volumes/Archive/Clients/Acme/240409_AcmeCo_LaunchVideo",
      parsedDate: "240409",
      parsedClient: "AcmeCo",
      parsedProject: "LaunchVideo",
      correctedDate: "240410",
      correctedClient: "Acme Corporation",
      correctedProject: "Launch Campaign",
      category: "video",
      sizeBytes: 482_300_000_000,
      sizeStatus: "ready",
      currentDriveId: "drive-archive-01",
      targetDriveId: "drive-archive-02",
      moveStatus: "pending",
      missingStatus: "normal",
      duplicateStatus: "duplicate",
      isUnassigned: false,
      isManual: true,
      lastSeenAt: "2026-04-09T11:00:00.000Z",
      lastScannedAt: "2026-04-09T11:00:00.000Z",
      ...baseTimestamps
    };

    it("preserves every field through to → from", () => {
      const row = toSupabaseProjectRow(fullyPopulatedProject);
      const restored = fromSupabaseProjectRow(row as SupabaseProjectRow);
      expect(restored).toEqual(fullyPopulatedProject);
    });
  });

  describe("ScanRecord", () => {
    const fullyPopulatedScan: ScanRecord = {
      id: "scan-symmetry-001",
      driveId: "drive-archive-01",
      startedAt: "2026-04-08T22:00:00.000Z",
      finishedAt: "2026-04-08T22:14:00.000Z",
      status: "completed",
      foldersScanned: 1247,
      matchesFound: 312,
      notes: "Quarterly archive sweep",
      ...baseTimestamps
    };

    it("preserves every field through to → from", () => {
      const row = toSupabaseScanRow(fullyPopulatedScan);
      const restored = fromSupabaseScanRow(row as SupabaseScanRow);
      expect(restored).toEqual(fullyPopulatedScan);
    });
  });

  describe("ScanSessionSnapshot", () => {
    const fullyPopulatedSession: ScanSessionSnapshot = {
      scanId: "scan-symmetry-001",
      rootPath: "/Volumes/Archive/Clients", // local-only
      driveName: "Archive Drive 01",
      status: "completed",
      startedAt: "2026-04-08T22:00:00.000Z",
      finishedAt: "2026-04-08T22:14:00.000Z",
      foldersScanned: 1247,
      matchesFound: 312,
      error: null,
      sizeJobsPending: 0,
      projects: [
        {
          id: "scan-project-001",
          folderName: "240409_AcmeCo_LaunchVideo",
          folderPath: "/Volumes/Archive/Clients/Acme/240409_AcmeCo_LaunchVideo",
          relativePath: "Acme/240409_AcmeCo_LaunchVideo",
          folderType: "personal_project",
          parsedDate: "240409",
          parsedClient: "AcmeCo",
          parsedProject: "LaunchVideo",
          sourceDriveName: "Archive Drive 01",
          scanTimestamp: "2026-04-08T22:14:00.000Z",
          sizeStatus: "ready",
          sizeBytes: 482_300_000_000,
          sizeError: null
        }
      ], // local-only at the row level (synced via separate entity)
      requestedDriveId: "drive-archive-01",
      requestedDriveName: "Archive Drive 01",
      summary: {
        newProjectsCount: 12,
        updatedProjectsCount: 47,
        missingProjectsCount: 3,
        duplicatesFlaggedCount: 2,
        durationMs: 840_000
      },
      ...baseTimestamps
    };

    it("preserves every non-local-only field through to → from", () => {
      const row = toSupabaseScanSessionRow(fullyPopulatedSession);
      const restored = fromSupabaseScanSessionRow(row as SupabaseScanSessionRow);

      const expected = omit(fullyPopulatedSession, localOnlySyncFields.scanSession);
      const actual = omit(restored, localOnlySyncFields.scanSession);

      expect(actual).toEqual(expected);
    });

    it("does not include any local-only field on the projected row", () => {
      const row = toSupabaseScanSessionRow(fullyPopulatedSession) as Record<string, unknown>;
      expect(row).not.toHaveProperty("rootPath");
      expect(row).not.toHaveProperty("root_path");
      expect(row).not.toHaveProperty("projects");
    });

    it("restores rootPath as empty string and projects as empty array on pull", () => {
      const row = toSupabaseScanSessionRow(fullyPopulatedSession) as SupabaseScanSessionRow;
      const restored = fromSupabaseScanSessionRow(row);
      expect(restored.rootPath).toBe("");
      expect(restored.projects).toEqual([]);
    });

    it("preserves a null summary through to → from", () => {
      const sessionWithoutSummary: ScanSessionSnapshot = {
        ...fullyPopulatedSession,
        summary: null
      };
      const row = toSupabaseScanSessionRow(sessionWithoutSummary);
      const restored = fromSupabaseScanSessionRow(row as SupabaseScanSessionRow);
      expect(restored.summary).toBeNull();
    });
  });

  describe("ProjectScanEvent", () => {
    const fullyPopulatedEvent: ProjectScanEvent = {
      id: "event-symmetry-001",
      projectId: "project-symmetry-001",
      scanId: "scan-symmetry-001",
      observedFolderName: "240409_AcmeCo_LaunchVideo",
      observedDriveName: "Archive Drive 01",
      observedFolderType: "personal_project",
      observedAt: "2026-04-08T22:14:00.000Z",
      ...baseTimestamps
    };

    it("preserves every field through to → from", () => {
      const row = toSupabaseProjectScanEventRow(fullyPopulatedEvent);
      const restored = fromSupabaseProjectScanEventRow(row as SupabaseProjectScanEventRow);
      expect(restored).toEqual(fullyPopulatedEvent);
    });

    it("preserves a null observedFolderType (legacy events written before the column existed)", () => {
      const legacyEvent: ProjectScanEvent = {
        ...fullyPopulatedEvent,
        observedFolderType: null
      };
      const row = toSupabaseProjectScanEventRow(legacyEvent);
      const restored = fromSupabaseProjectScanEventRow(row as SupabaseProjectScanEventRow);
      expect(restored.observedFolderType).toBeNull();
    });
  });
});
