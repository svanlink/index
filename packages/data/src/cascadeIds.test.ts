import type { Drive, Project, ProjectScanEvent, ScanRecord, ScanSessionSnapshot } from "@drive-project-catalog/domain";
import { describe, expect, it } from "vitest";
import { computeDriveCascadeIds, computeProjectCascadeIds } from "./cascadeIds";
import type { CatalogSnapshot } from "./localPersistence";

// Minimal, hand-rolled snapshot fixtures. These tests exercise the pure
// enumeration only — they intentionally do not depend on the larger
// mockCatalogSnapshot shape so a cascade rule change (or a new child
// relationship added to one of the persistence adapters) is reflected
// directly in the expected ids below and no mock-data coincidence can hide
// a regression.
const now = "2026-04-06T10:30:00.000Z";

function drive(id: string): Drive {
  return {
    id,
    volumeName: id,
    displayName: id,
    totalCapacityBytes: null,
    usedBytes: null,
    freeBytes: null,
    reservedIncomingBytes: 0,
    lastScannedAt: null,
    createdManually: false,
    createdAt: now,
    updatedAt: now
  };
}

function project(id: string, currentDriveId: string | null = null): Project {
  return {
    id,
    folderType: "client",
    isStandardized: true,
    folderName: id,
    folderPath: null,
    parsedDate: null,
    parsedClient: null,
    parsedProject: null,
    correctedDate: null,
    correctedClient: null,
    correctedProject: null,
    category: "photo",
    sizeBytes: null,
    sizeStatus: "unknown",
    currentDriveId,
    targetDriveId: null,
    moveStatus: "none",
    missingStatus: "normal",
    duplicateStatus: "normal",
    isUnassigned: currentDriveId === null,
    isManual: false,
    lastSeenAt: null,
    lastScannedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

function scan(id: string, driveId: string): ScanRecord {
  return {
    id,
    driveId,
    startedAt: now,
    finishedAt: now,
    status: "completed",
    foldersScanned: 0,
    matchesFound: 0,
    notes: null,
    createdAt: now,
    updatedAt: now
  };
}

function session(scanId: string, requestedDriveId: string | null): ScanSessionSnapshot {
  return {
    scanId,
    rootPath: "/mnt/dummy",
    driveName: "dummy",
    status: "completed",
    startedAt: now,
    finishedAt: now,
    foldersScanned: 0,
    matchesFound: 0,
    error: null,
    sizeJobsPending: 0,
    projects: [],
    requestedDriveId,
    requestedDriveName: null,
    summary: null,
    createdAt: now,
    updatedAt: now
  };
}

function event(id: string, projectId: string, scanId: string): ProjectScanEvent {
  return {
    id,
    projectId,
    scanId,
    observedFolderName: id,
    observedDriveName: "dummy",
    observedFolderType: "client",
    observedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

function snapshot(overrides: Partial<CatalogSnapshot>): CatalogSnapshot {
  return {
    drives: [],
    projects: [],
    scans: [],
    projectScanEvents: [],
    scanSessions: [],
    ...overrides
  };
}

describe("computeDriveCascadeIds", () => {
  it("returns scans, scanSessions, and projectScanEvents that the drive delete will cascade", () => {
    const snap = snapshot({
      drives: [drive("drive-a"), drive("drive-b")],
      scans: [scan("scan-a1", "drive-a"), scan("scan-a2", "drive-a"), scan("scan-b1", "drive-b")],
      scanSessions: [
        session("scan-a1", "drive-a"),
        session("scan-b1", "drive-b")
      ],
      projectScanEvents: [
        event("evt-1", "project-1", "scan-a1"),
        event("evt-2", "project-2", "scan-a2"),
        event("evt-3", "project-3", "scan-b1")
      ]
    });

    const result = computeDriveCascadeIds(snap, "drive-a");

    expect(result.scans.sort()).toEqual(["scan-a1", "scan-a2"]);
    expect(result.scanSessions).toEqual(["scan-a1"]);
    expect(result.projectScanEvents.sort()).toEqual(["evt-1", "evt-2"]);
  });

  it("returns empty arrays when the drive has no children", () => {
    const snap = snapshot({
      drives: [drive("drive-lonely")],
      scans: [scan("scan-elsewhere", "drive-other")],
      scanSessions: [session("scan-elsewhere", "drive-other")],
      projectScanEvents: [event("evt-elsewhere", "p", "scan-elsewhere")]
    });

    const result = computeDriveCascadeIds(snap, "drive-lonely");

    expect(result.scans).toEqual([]);
    expect(result.scanSessions).toEqual([]);
    expect(result.projectScanEvents).toEqual([]);
  });

  it("does not include events whose scan belongs to a different drive", () => {
    // Guards the scanId join: an event whose projectId matches a project on
    // the target drive but whose scanId points at a scan on another drive
    // must NOT be cascaded. The cascade key is scan.driveId, not project
    // residency.
    const snap = snapshot({
      drives: [drive("drive-a"), drive("drive-b")],
      scans: [scan("scan-a", "drive-a"), scan("scan-b", "drive-b")],
      projectScanEvents: [
        event("evt-on-a", "project-shared", "scan-a"),
        event("evt-on-b", "project-shared", "scan-b")
      ]
    });

    const result = computeDriveCascadeIds(snap, "drive-a");

    expect(result.projectScanEvents).toEqual(["evt-on-a"]);
  });

  it("does not include sessions whose requestedDriveId is null or different", () => {
    // Matches the cascade rule in all 3 persistence adapters: sessions with
    // requestedDriveId !== driveId are preserved.
    const snap = snapshot({
      drives: [drive("drive-a")],
      scanSessions: [
        session("scan-null", null),
        session("scan-other", "drive-other"),
        session("scan-target", "drive-a")
      ]
    });

    const result = computeDriveCascadeIds(snap, "drive-a");

    expect(result.scanSessions).toEqual(["scan-target"]);
  });
});

describe("computeProjectCascadeIds", () => {
  it("returns projectScanEvents whose projectId matches", () => {
    const snap = snapshot({
      projects: [project("project-1"), project("project-2")],
      scans: [scan("scan-1", "drive-a")],
      projectScanEvents: [
        event("evt-a", "project-1", "scan-1"),
        event("evt-b", "project-1", "scan-1"),
        event("evt-c", "project-2", "scan-1")
      ]
    });

    const result = computeProjectCascadeIds(snap, "project-1");

    expect(result.scans).toEqual([]);
    expect(result.scanSessions).toEqual([]);
    expect(result.projectScanEvents.sort()).toEqual(["evt-a", "evt-b"]);
  });

  it("returns empty cascade when the project has no events", () => {
    const snap = snapshot({
      projects: [project("project-lonely")],
      projectScanEvents: [event("evt-elsewhere", "project-other", "scan-1")]
    });

    const result = computeProjectCascadeIds(snap, "project-lonely");

    expect(result.projectScanEvents).toEqual([]);
  });

  it("never cascades scans or sessions for project deletion", () => {
    // Scans and sessions are keyed on the drive, not the project. Even with
    // a perfect child relationship present in the snapshot, project
    // deletion must leave them alone — mirroring the persistence adapters.
    const snap = snapshot({
      projects: [project("project-1", "drive-a")],
      scans: [scan("scan-1", "drive-a")],
      scanSessions: [session("scan-1", "drive-a")],
      projectScanEvents: [event("evt-a", "project-1", "scan-1")]
    });

    const result = computeProjectCascadeIds(snap, "project-1");

    expect(result.scans).toEqual([]);
    expect(result.scanSessions).toEqual([]);
    expect(result.projectScanEvents).toEqual(["evt-a"]);
  });
});
