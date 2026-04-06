import { describe, expect, it } from "vitest";
import { mockDrives, mockScanSessions } from "./mockData";
import {
  buildScanSessionDetailView,
  buildScanSessionListItems,
  filterScanSessions
} from "./scanHistorySelectors";

describe("scanHistorySelectors", () => {
  it("sorts sessions newest first and supports status filters", () => {
    const sessions = buildScanSessionListItems(mockScanSessions, mockDrives, { status: "completed" });

    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.scanId).toBe("scan-drive-a-20260405");
    expect(sessions.every((session) => session.status === "completed")).toBe(true);
  });

  it("supports drive filtering and detail lookup", () => {
    const filtered = filterScanSessions(mockScanSessions, mockDrives, { driveId: "drive-b" });
    const detail = buildScanSessionDetailView(mockScanSessions, mockDrives, "scan-drive-b-20260404");

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.scanId).toBe("scan-drive-b-20260404");
    expect(detail?.driveName).toBe("Drive B");
    expect(detail?.newProjectsCount).toBeGreaterThanOrEqual(0);
  });
});
