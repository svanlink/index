import { describe, expect, it } from "vitest";
import { mockDrives, mockProjects, mockScanSessions } from "./mockData";
import { findCatalogProjectForScanRecord } from "./projectLinkingSelectors";

describe("projectLinkingSelectors", () => {
  it("links a scan record to the matching catalog project on the mapped drive", () => {
    const session = {
      ...mockScanSessions[0]!,
      projects: [
        {
          id: "scan-project-apple",
          folderType: "client" as const,
          folderName: "240401_Apple_ProductShoot",
          folderPath: "/Volumes/Drive A/240401_Apple_ProductShoot",
          relativePath: "240401_Apple_ProductShoot",
          parsedDate: "240401",
          parsedClient: "Apple",
          parsedProject: "ProductShoot",
          sourceDriveName: "Drive A",
          scanTimestamp: "2026-04-05T18:10:00.000Z",
          sizeStatus: "ready" as const,
          sizeBytes: 120_000_000_000,
          sizeError: null
        }
      ]
    };

    const linked = findCatalogProjectForScanRecord(session.projects[0]!, session, mockProjects, mockDrives);

    expect(linked?.id).toBe("project-240401-apple-shoot");
  });
});
