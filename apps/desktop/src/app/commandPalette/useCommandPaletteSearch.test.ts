import { describe, expect, it } from "vitest";
import type { Project } from "@drive-project-catalog/domain";
import { useCommandPaletteSearch, MIN_QUERY_LENGTH } from "./useCommandPaletteSearch";
import { renderHook } from "@testing-library/react";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    folderName: "2026-01_Test - Project",
    folderPath: "/Volumes/Drive/2026-01_Test - Project",
    parsedDate: "2026-01",
    parsedClient: "Test",
    parsedProject: "Project",
    correctedDate: null,
    correctedClient: null,
    correctedProject: null,
    currentDriveId: "drive-1",
    category: null,
    folderType: "standard",
    ...overrides
  } as Project;
}

const DECATHLON_PROJECT = makeProject({
  id: "proj-dec",
  folderName: "2026-03_Decathlon - Shoot",
  parsedClient: "Decathlon",
  parsedProject: "Shoot"
});

describe("useCommandPaletteSearch", () => {
  it("returns empty results when query is empty", () => {
    const { result } = renderHook(() =>
      useCommandPaletteSearch([DECATHLON_PROJECT], [], "")
    );
    expect(result.current.projectResults).toHaveLength(0);
    expect(result.current.driveResults).toHaveLength(0);
  });

  it(`returns empty results when query is shorter than ${MIN_QUERY_LENGTH} chars`, () => {
    const { result } = renderHook(() =>
      useCommandPaletteSearch([DECATHLON_PROJECT], [], "d")
    );
    expect(result.current.projectResults).toHaveLength(0);
  });

  it('"dec" matches a project with "Decathlon" in metadata', () => {
    const { result } = renderHook(() =>
      useCommandPaletteSearch([DECATHLON_PROJECT], [], "dec")
    );
    expect(result.current.projectResults).toHaveLength(1);
    expect(result.current.projectResults[0].id).toBe("proj-dec");
  });

  it('"dcth" fuzzy-matches "Decathlon"', () => {
    const { result } = renderHook(() =>
      useCommandPaletteSearch([DECATHLON_PROJECT], [], "dcth")
    );
    expect(result.current.projectResults.length).toBeGreaterThan(0);
    expect(result.current.projectResults[0].id).toBe("proj-dec");
  });

  it("correctedClient field is searched", () => {
    const project = makeProject({
      id: "proj-corrected",
      correctedClient: "Rolex",
      parsedClient: "OldName",
      folderName: "2026-01_OldName - Watch"
    });
    const { result } = renderHook(() =>
      useCommandPaletteSearch([project], [], "rolex")
    );
    expect(result.current.projectResults.some((p) => p.id === "proj-corrected")).toBe(true);
  });

  it("caps results at 8 projects", () => {
    const projects = Array.from({ length: 12 }, (_, i) =>
      makeProject({ id: `proj-${i}`, folderName: `2026-01_Client - Project ${i}` })
    );
    const { result } = renderHook(() =>
      useCommandPaletteSearch(projects, [], "client")
    );
    expect(result.current.projectResults.length).toBeLessThanOrEqual(8);
  });
});
