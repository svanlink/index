import { describe, expect, it } from "vitest";
import { generateRenameCandidate, generateRenameCandidates } from "./smartRenameEngine";
import type { Project } from "./project";

// ---------------------------------------------------------------------------
// Minimal project factory — only the fields the engine cares about.
// ---------------------------------------------------------------------------

function makeProject(overrides: Partial<Project> & Pick<Project, "id" | "folderName">): Project {
  return {
    folderType: "client",
    isStandardized: false,
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
    isUnassigned: true,
    isManual: false,
    lastSeenAt: null,
    lastScannedAt: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    namingStatus: "invalid",
    namingConfidence: null,
    normalizedName: null,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Projects that are already canonical — must NOT generate a suggestion.
// ---------------------------------------------------------------------------

describe("generateRenameCandidate — already canonical", () => {
  it("returns null for namingStatus=valid", () => {
    const project = makeProject({
      id: "p1",
      folderName: "2024-03-12_Richemont - EventRecap",
      namingStatus: "valid"
    });
    expect(generateRenameCandidate(project)).toBeNull();
  });

  it("returns null when normalizedName equals folderName", () => {
    const project = makeProject({
      id: "p2",
      folderName: "2024-03-12_Richemont - EventRecap",
      normalizedName: "2024-03-12_Richemont - EventRecap",
      namingStatus: "invalid" // edge case
    });
    expect(generateRenameCandidate(project)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fast path: classifier already produced normalizedName (legacy YYMMDD).
// ---------------------------------------------------------------------------

describe("generateRenameCandidate — fast path from normalizedName", () => {
  it("uses normalizedName directly for a legacy client folder", () => {
    const project = makeProject({
      id: "p3",
      folderName: "240401_Apple_ProductShoot",
      parsedDate: "240401",
      parsedClient: "Apple",
      parsedProject: "ProductShoot",
      normalizedName: "2024-04-01_Apple - ProductShoot",
      namingStatus: "legacy",
      namingConfidence: "medium"
    });
    const candidate = generateRenameCandidate(project);
    expect(candidate).not.toBeNull();
    expect(candidate!.suggestedName).toBe("2024-04-01_Apple - ProductShoot");
    expect(candidate!.currentName).toBe("240401_Apple_ProductShoot");
    expect(candidate!.confidence).toBe("medium");
    expect(candidate!.projectId).toBe("p3");
  });

  it("includes the parsedDate in the reason string", () => {
    const project = makeProject({
      id: "p4",
      folderName: "231015_Nike_RunningCampaign",
      parsedDate: "231015",
      normalizedName: "2023-10-15_Nike - RunningCampaign",
      namingStatus: "legacy",
      namingConfidence: "medium"
    });
    const candidate = generateRenameCandidate(project);
    expect(candidate!.reason).toContain("231015");
  });
});

// ---------------------------------------------------------------------------
// Smart detection: YYYYMMDD (8-digit date token).
// ---------------------------------------------------------------------------

describe("generateRenameCandidate — YYYYMMDD format", () => {
  it("rewrites the old YYYY-MM-DD_Client_Project shape to the only canonical form", () => {
    const project = makeProject({
      id: "p-old-iso",
      folderName: "2024-03-12_Richemont_EventRecap",
      namingStatus: "invalid"
    });
    const candidate = generateRenameCandidate(project);
    expect(candidate).not.toBeNull();
    expect(candidate!.suggestedName).toBe("2024-03-12_Richemont - EventRecap");
    expect(candidate!.confidence).toBe("high");
  });

  it("detects YYYYMMDD and suggests YYYY-MM-DD canonical form", () => {
    const project = makeProject({
      id: "p5",
      folderName: "20240312_Richemont_EventRecap",
      namingStatus: "invalid"
    });
    const candidate = generateRenameCandidate(project);
    expect(candidate).not.toBeNull();
    expect(candidate!.suggestedName).toBe("2024-03-12_Richemont - EventRecap");
    expect(candidate!.confidence).toBe("high");
  });

  it("rejects an invalid calendar date in YYYYMMDD position", () => {
    const project = makeProject({
      id: "p6",
      folderName: "20241399_Client_Project", // month 13 is invalid
      namingStatus: "invalid"
    });
    expect(generateRenameCandidate(project)).toBeNull();
  });

  it("handles end-of-month dates correctly", () => {
    const project = makeProject({
      id: "p7",
      folderName: "20241231_Sony_YearEnd",
      namingStatus: "invalid"
    });
    const candidate = generateRenameCandidate(project);
    expect(candidate!.suggestedName).toBe("2024-12-31_Sony - YearEnd");
  });

  it("rejects Feb 30 as an impossible date", () => {
    const project = makeProject({
      id: "p8",
      folderName: "20240230_Sony_YearEnd",
      namingStatus: "invalid"
    });
    expect(generateRenameCandidate(project)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Smart detection: YYYY_MM_DD (5-part, underscore-delimited date).
// ---------------------------------------------------------------------------

describe("generateRenameCandidate — YYYY_MM_DD underscore format", () => {
  it("detects YYYY_MM_DD spread across three tokens", () => {
    const project = makeProject({
      id: "p9",
      folderName: "2024_03_12_Richemont_EventRecap",
      namingStatus: "invalid"
    });
    const candidate = generateRenameCandidate(project);
    expect(candidate).not.toBeNull();
    expect(candidate!.suggestedName).toBe("2024-03-12_Richemont - EventRecap");
    expect(candidate!.confidence).toBe("high");
  });

  it("rejects invalid dates in YYYY_MM_DD position", () => {
    const project = makeProject({
      id: "p10",
      folderName: "2024_13_01_Client_Project", // month 13
      namingStatus: "invalid"
    });
    expect(generateRenameCandidate(project)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Smart detection: YYYY-MM partial date (low confidence).
// ---------------------------------------------------------------------------

describe("generateRenameCandidate — YYYY-MM partial date", () => {
  it("generates a low-confidence suggestion with day defaulted to 01", () => {
    const project = makeProject({
      id: "p11",
      folderName: "2024-03_Decathlon_RunningCampaign",
      namingStatus: "invalid"
    });
    const candidate = generateRenameCandidate(project);
    expect(candidate).not.toBeNull();
    expect(candidate!.suggestedName).toBe("2024-03-01_Decathlon - RunningCampaign");
    expect(candidate!.confidence).toBe("low");
    expect(candidate!.reason).toContain("2024-03-01");
  });
});

// ---------------------------------------------------------------------------
// Folders with no detectable structure — must return null.
// ---------------------------------------------------------------------------

describe("generateRenameCandidate — unstructured folders", () => {
  it("returns null for a plain folder name", () => {
    expect(generateRenameCandidate(makeProject({ id: "q1", folderName: "misc" }))).toBeNull();
  });

  it("returns null for a two-part name", () => {
    expect(generateRenameCandidate(makeProject({ id: "q2", folderName: "Client_Project" }))).toBeNull();
  });

  it("returns null for a name with too many parts and no date", () => {
    expect(generateRenameCandidate(makeProject({ id: "q3", folderName: "a_b_c_d_e_f" }))).toBeNull();
  });

  it("never throws on empty string", () => {
    expect(() => generateRenameCandidate(makeProject({ id: "q4", folderName: "" }))).not.toThrow();
    expect(generateRenameCandidate(makeProject({ id: "q4", folderName: "" }))).toBeNull();
  });

  it("never throws on weird unicode input", () => {
    expect(() =>
      generateRenameCandidate(makeProject({ id: "q5", folderName: "🎬_Client_Project" }))
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Batch API.
// ---------------------------------------------------------------------------

describe("generateRenameCandidates", () => {
  it("filters nulls and returns only actionable candidates", () => {
    const projects = [
      makeProject({ id: "r1", folderName: "2024-03-12_Valid - Already", namingStatus: "valid" }),
      makeProject({ id: "r2", folderName: "20240312_Client_Project", namingStatus: "invalid" }),
      makeProject({ id: "r3", folderName: "random" }),
      makeProject({
        id: "r4",
        folderName: "230915_Nike_Ad",
        normalizedName: "2023-09-15_Nike_Ad",
        namingStatus: "legacy",
        namingConfidence: "medium"
      })
    ];
    const candidates = generateRenameCandidates(projects);
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.projectId)).toEqual(["r2", "r4"]);
  });

  it("returns empty array for an empty input", () => {
    expect(generateRenameCandidates([])).toEqual([]);
  });

  it("returns empty array when all projects are already canonical", () => {
    const projects = [
      makeProject({ id: "s1", folderName: "2024-01-01_A - B", namingStatus: "valid" }),
      makeProject({ id: "s2", folderName: "2024-02-02_C - D", namingStatus: "valid" })
    ];
    expect(generateRenameCandidates(projects)).toEqual([]);
  });
});
