import type { Drive, Project, ProjectScanEvent, ScanRecord, ScanSessionSnapshot } from "@drive-project-catalog/domain";
import { describe, expect, it } from "vitest";
import { applyDriveDeleteToSnapshot, applyProjectDeleteToSnapshot } from "./cascadeDelete";
import type { CatalogSnapshot } from "./localPersistence";

// Minimal hand-rolled snapshot fixtures. These tests exercise the pure
// helpers in isolation — cross-adapter parity is proven by the shared
// contract suite in `localPersistenceContract.ts`, which runs the
// identical fixture through `InMemoryLocalPersistence` and
// `SqliteLocalPersistence`. The unit tests here focus on:
//
//   - the exact snapshot transform the helpers produce
//   - stable-reference semantics for unmutated rows
//   - immutability of the input snapshot
//   - no-op behavior for missing ids
//
// A regression in any of those invariants would silently break at least
// one adapter, so the unit layer is additive documentation, not a
// substitute for the contract tests.

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

function project(
  id: string,
  overrides: Partial<Pick<Project, "currentDriveId" | "targetDriveId">> = {}
): Project {
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
    currentDriveId: null,
    targetDriveId: null,
    moveStatus: "none",
    missingStatus: "normal",
    duplicateStatus: "normal",
    isUnassigned: false,
    isManual: false,
    lastSeenAt: null,
    lastScannedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
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

describe("applyProjectDeleteToSnapshot", () => {
  it("removes the project and events whose projectId matches", () => {
    const snap = snapshot({
      projects: [project("project-a"), project("project-b")],
      projectScanEvents: [
        event("evt-a1", "project-a", "scan-1"),
        event("evt-a2", "project-a", "scan-1"),
        event("evt-b1", "project-b", "scan-1")
      ]
    });

    const next = applyProjectDeleteToSnapshot(snap, "project-a");

    expect(next.projects.map((p) => p.id)).toEqual(["project-b"]);
    expect(next.projectScanEvents.map((e) => e.id)).toEqual(["evt-b1"]);
  });

  it("does not touch drives, scans, or scanSessions", () => {
    const snap = snapshot({
      drives: [drive("drive-a")],
      projects: [project("project-a")],
      scans: [scan("scan-1", "drive-a")],
      projectScanEvents: [event("evt-a1", "project-a", "scan-1")],
      scanSessions: [session("scan-1", "drive-a")]
    });

    const next = applyProjectDeleteToSnapshot(snap, "project-a");

    expect(next.drives).toBe(snap.drives);
    expect(next.scans).toBe(snap.scans);
    expect(next.scanSessions).toBe(snap.scanSessions);
  });

  it("is a no-op when the projectId does not exist", () => {
    const snap = snapshot({
      projects: [project("project-a")],
      projectScanEvents: [event("evt-a1", "project-a", "scan-1")]
    });

    const next = applyProjectDeleteToSnapshot(snap, "project-does-not-exist");

    expect(next.projects.map((p) => p.id)).toEqual(["project-a"]);
    expect(next.projectScanEvents.map((e) => e.id)).toEqual(["evt-a1"]);
  });

  it("does not mutate the input snapshot", () => {
    const snap = snapshot({
      projects: [project("project-a"), project("project-b")],
      projectScanEvents: [event("evt-a1", "project-a", "scan-1")]
    });
    const originalProjectIds = snap.projects.map((p) => p.id);
    const originalEventIds = snap.projectScanEvents.map((e) => e.id);

    applyProjectDeleteToSnapshot(snap, "project-a");

    expect(snap.projects.map((p) => p.id)).toEqual(originalProjectIds);
    expect(snap.projectScanEvents.map((e) => e.id)).toEqual(originalEventIds);
  });
});

describe("applyDriveDeleteToSnapshot", () => {
  it("removes the drive row", () => {
    const snap = snapshot({
      drives: [drive("drive-a"), drive("drive-b")]
    });

    const next = applyDriveDeleteToSnapshot(snap, "drive-a");

    expect(next.drives.map((d) => d.id)).toEqual(["drive-b"]);
  });

  it("nullifies currentDriveId and targetDriveId on matching projects but keeps them", () => {
    const snap = snapshot({
      drives: [drive("drive-a"), drive("drive-b")],
      projects: [
        project("project-current-only", { currentDriveId: "drive-a" }),
        project("project-target-only", { targetDriveId: "drive-a" }),
        project("project-both", { currentDriveId: "drive-a", targetDriveId: "drive-a" }),
        project("project-mixed", { currentDriveId: "drive-a", targetDriveId: "drive-b" }),
        project("project-elsewhere", { currentDriveId: "drive-b", targetDriveId: null })
      ]
    });

    const next = applyDriveDeleteToSnapshot(snap, "drive-a");

    const byId = new Map(next.projects.map((p) => [p.id, p] as const));
    expect(byId.size).toBe(5);

    expect(byId.get("project-current-only")?.currentDriveId).toBeNull();
    expect(byId.get("project-target-only")?.targetDriveId).toBeNull();

    expect(byId.get("project-both")?.currentDriveId).toBeNull();
    expect(byId.get("project-both")?.targetDriveId).toBeNull();

    // Mixed: current was drive-a (cleared) but target was drive-b (kept).
    expect(byId.get("project-mixed")?.currentDriveId).toBeNull();
    expect(byId.get("project-mixed")?.targetDriveId).toBe("drive-b");

    // Elsewhere: touches neither field.
    expect(byId.get("project-elsewhere")?.currentDriveId).toBe("drive-b");
    expect(byId.get("project-elsewhere")?.targetDriveId).toBeNull();
  });

  it("preserves stable references for projects that did not reference the deleted drive", () => {
    // Stable-reference semantics are part of the contract: `Object.is`
    // comparisons let callers short-circuit derivations of unchanged rows.
    const untouched = project("project-elsewhere", { currentDriveId: "drive-b" });
    const mutated = project("project-current-only", { currentDriveId: "drive-a" });
    const snap = snapshot({
      drives: [drive("drive-a"), drive("drive-b")],
      projects: [untouched, mutated]
    });

    const next = applyDriveDeleteToSnapshot(snap, "drive-a");

    const untouchedAfter = next.projects.find((p) => p.id === "project-elsewhere");
    const mutatedAfter = next.projects.find((p) => p.id === "project-current-only");
    expect(untouchedAfter).toBe(untouched);
    expect(mutatedAfter).not.toBe(mutated);
  });

  it("cascades scans whose driveId matches and preserves others", () => {
    const snap = snapshot({
      drives: [drive("drive-a"), drive("drive-b")],
      scans: [
        scan("scan-a1", "drive-a"),
        scan("scan-a2", "drive-a"),
        scan("scan-b1", "drive-b")
      ]
    });

    const next = applyDriveDeleteToSnapshot(snap, "drive-a");

    expect(next.scans.map((s) => s.id)).toEqual(["scan-b1"]);
  });

  it("cascades projectScanEvents via scan.driveId, not via project residency", () => {
    // Guards the join semantics: an event whose projectId matches a
    // project that lives on the deleted drive is NOT removed unless its
    // *scan* also belongs to that drive. Keyed on scan.driveId so
    // cross-drive event histories on shared projects are preserved.
    const snap = snapshot({
      drives: [drive("drive-a"), drive("drive-b")],
      scans: [scan("scan-a", "drive-a"), scan("scan-b", "drive-b")],
      projectScanEvents: [
        event("evt-on-a", "project-shared", "scan-a"),
        event("evt-on-b", "project-shared", "scan-b")
      ]
    });

    const next = applyDriveDeleteToSnapshot(snap, "drive-a");

    expect(next.projectScanEvents.map((e) => e.id)).toEqual(["evt-on-b"]);
  });

  it("cascades scanSessions with matching requestedDriveId and preserves nulls / others", () => {
    const snap = snapshot({
      drives: [drive("drive-a")],
      scanSessions: [
        session("scan-target", "drive-a"),
        session("scan-other", "drive-other"),
        session("scan-null", null)
      ]
    });

    const next = applyDriveDeleteToSnapshot(snap, "drive-a");

    expect(next.scanSessions.map((s) => s.scanId).sort()).toEqual([
      "scan-null",
      "scan-other"
    ]);
  });

  it("is a no-op when the driveId does not exist", () => {
    // Matches the "drive-does-not-exist" contract test: every entity is
    // preserved, including projects whose drive references happen to be
    // null (the nullify pass must not rewrite unrelated null fields).
    const snap = snapshot({
      drives: [drive("drive-a")],
      projects: [project("project-a", { currentDriveId: "drive-a" })],
      scans: [scan("scan-1", "drive-a")],
      projectScanEvents: [event("evt-1", "project-a", "scan-1")],
      scanSessions: [session("scan-1", "drive-a")]
    });

    const next = applyDriveDeleteToSnapshot(snap, "drive-does-not-exist");

    expect(next.drives.map((d) => d.id)).toEqual(["drive-a"]);
    expect(next.projects.map((p) => p.id)).toEqual(["project-a"]);
    expect(next.projects[0]?.currentDriveId).toBe("drive-a");
    expect(next.scans.map((s) => s.id)).toEqual(["scan-1"]);
    expect(next.projectScanEvents.map((e) => e.id)).toEqual(["evt-1"]);
    expect(next.scanSessions.map((s) => s.scanId)).toEqual(["scan-1"]);
  });

  it("does not mutate the input snapshot", () => {
    const snap = snapshot({
      drives: [drive("drive-a"), drive("drive-b")],
      projects: [project("project-a", { currentDriveId: "drive-a" })],
      scans: [scan("scan-1", "drive-a")],
      projectScanEvents: [event("evt-1", "project-a", "scan-1")],
      scanSessions: [session("scan-1", "drive-a")]
    });
    const originalDriveIds = snap.drives.map((d) => d.id);
    const originalProject = snap.projects[0]!;
    const originalScanIds = snap.scans.map((s) => s.id);
    const originalEventIds = snap.projectScanEvents.map((e) => e.id);
    const originalSessionIds = snap.scanSessions.map((s) => s.scanId);

    applyDriveDeleteToSnapshot(snap, "drive-a");

    expect(snap.drives.map((d) => d.id)).toEqual(originalDriveIds);
    // The original project object must still carry its pre-call fields —
    // the nullify step returned a *new* project object, leaving the
    // original unchanged.
    expect(originalProject.currentDriveId).toBe("drive-a");
    expect(snap.scans.map((s) => s.id)).toEqual(originalScanIds);
    expect(snap.projectScanEvents.map((e) => e.id)).toEqual(originalEventIds);
    expect(snap.scanSessions.map((s) => s.scanId)).toEqual(originalSessionIds);
  });
});
