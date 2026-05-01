import { describe, expect, it } from "vitest";
import { classifyFolderName } from "./folderClassifier";

// ---------------------------------------------------------------------------
// Parity tests — these mirror the Rust unit tests in scan_engine.rs so the
// two implementations cannot silently drift. If either side changes a rule,
// this file must be updated alongside the Rust tests.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// New standard: YYYY-MM-DD_Client - Project
// ---------------------------------------------------------------------------

describe("classifyFolderName — new standard YYYY-MM-DD format", () => {
  it("classifies 2024-03-12_Richemont - EventRecap as client with high confidence", () => {
    const c = classifyFolderName("2024-03-12_Richemont - EventRecap");
    expect(c.folderType).toBe("client");
    expect(c.parsedDate).toBe("2024-03-12");
    expect(c.parsedClient).toBe("Richemont");
    expect(c.parsedProject).toBe("EventRecap");
    expect(c.namingConvention).toBe("new_standard");
    expect(c.namingConfidence).toBe("high");
  });

  it("classifies 2024-06-05_Decathlon - RunningCampaign as client with high confidence", () => {
    const c = classifyFolderName("2024-06-05_Decathlon - RunningCampaign");
    expect(c.folderType).toBe("client");
    expect(c.parsedDate).toBe("2024-06-05");
    expect(c.parsedClient).toBe("Decathlon");
    expect(c.parsedProject).toBe("RunningCampaign");
    expect(c.namingConvention).toBe("new_standard");
    expect(c.namingConfidence).toBe("high");
  });

  it("classifies 2023-09-11_Fuerteventura - SurfDoc as client with high confidence", () => {
    const c = classifyFolderName("2023-09-11_Fuerteventura - SurfDoc");
    expect(c.folderType).toBe("client");
    expect(c.parsedDate).toBe("2023-09-11");
    expect(c.parsedClient).toBe("Fuerteventura");
    expect(c.parsedProject).toBe("SurfDoc");
    expect(c.namingConvention).toBe("new_standard");
    expect(c.namingConfidence).toBe("high");
  });

  it("sets normalizedName to the input (already canonical)", () => {
    const name = "2024-03-12_Richemont - EventRecap";
    expect(classifyFolderName(name).normalizedName).toBe(name);
  });

  it("falls back when the date segment has the right length but wrong structure", () => {
    // 10 chars but not YYYY-MM-DD pattern
    expect(classifyFolderName("2024/03/12_Client - Project").folderType).toBe("personal_folder");
    expect(classifyFolderName("20240312AB_Client - Project").folderType).toBe("personal_folder");
  });

  it("treats the old YYYY-MM-DD_Client_Project shape as invalid", () => {
    const c = classifyFolderName("2024-03-12_Richemont_EventRecap");
    expect(c.folderType).toBe("personal_folder");
    expect(c.namingStatus).toBe("invalid");
  });
});

// ---------------------------------------------------------------------------
// Legacy backward-compat: YYMMDD_Client_Project and YYMMDD_Internal_Project
// ---------------------------------------------------------------------------

describe("classifyFolderName — legacy YYMMDD client folders", () => {
  it("classifies well-formed legacy client folders", () => {
    const c = classifyFolderName("240401_Apple_ProductShoot");
    expect(c.folderType).toBe("client");
    expect(c.parsedDate).toBe("240401");
    expect(c.parsedClient).toBe("Apple");
    expect(c.parsedProject).toBe("ProductShoot");
    expect(c.namingConvention).toBe("legacy");
    expect(c.namingConfidence).toBe("medium");
  });

  it("treats lowercase 'internal' as a client name (exact-case match only)", () => {
    const c = classifyFolderName("240401_internal_Archive");
    expect(c.folderType).toBe("client");
    expect(c.parsedClient).toBe("internal");
  });

  it("computes a normalizedName as the proposed YYYY-MM-DD rename target", () => {
    const c = classifyFolderName("240401_Apple_ProductShoot");
    // Century 20xx assumed: 24 → 2024, 04 → 04, 01 → 01
    expect(c.normalizedName).toBe("2024-04-01_Apple - ProductShoot");
  });
});

describe("classifyFolderName — legacy YYMMDD personal_project folders", () => {
  it("classifies 240401_Internal_Archive as personal_project", () => {
    const c = classifyFolderName("240401_Internal_Archive");
    expect(c.folderType).toBe("personal_project");
    expect(c.parsedDate).toBe("240401");
    // Legacy personal_project has no client field
    expect(c.parsedClient).toBeNull();
    expect(c.parsedProject).toBe("Archive");
    expect(c.namingConvention).toBe("legacy");
    expect(c.namingConfidence).toBe("medium");
    expect(c.normalizedName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Naming convention and confidence metadata
// ---------------------------------------------------------------------------

describe("classifyFolderName — naming convention and confidence metadata", () => {
  it("new standard folder gets high confidence, valid status, and normalizedName == input", () => {
    const name = "2024-03-12_Richemont - EventRecap";
    const c = classifyFolderName(name);
    expect(c.namingConvention).toBe("new_standard");
    expect(c.namingConfidence).toBe("high");
    expect(c.namingStatus).toBe("valid");
    expect(c.normalizedName).toBe(name);
  });

  it("legacy client folder gets medium confidence, legacy status, and a proposed normalizedName", () => {
    const c = classifyFolderName("240401_Apple_ProductShoot");
    expect(c.namingConvention).toBe("legacy");
    expect(c.namingConfidence).toBe("medium");
    expect(c.namingStatus).toBe("legacy");
    expect(c.normalizedName).toBe("2024-04-01_Apple - ProductShoot");
  });

  it("legacy Internal folder gets medium confidence, legacy status, and null normalizedName", () => {
    const c = classifyFolderName("240401_Internal_Archive");
    expect(c.namingConvention).toBe("legacy");
    expect(c.namingConfidence).toBe("medium");
    expect(c.namingStatus).toBe("legacy");
    expect(c.normalizedName).toBeNull();
  });

  it("personal_folder fallback gets null convention, low confidence, and invalid status", () => {
    const c = classifyFolderName("Archive");
    expect(c.namingConvention).toBeNull();
    expect(c.namingConfidence).toBe("low");
    expect(c.namingStatus).toBe("invalid");
    expect(c.normalizedName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// personal_folder fallback
// ---------------------------------------------------------------------------

describe("classifyFolderName — personal_folder fallback", () => {
  it("falls back when there are too few parts", () => {
    expect(classifyFolderName("240401_Apple").folderType).toBe("personal_folder");
  });

  it("falls back when there are too many parts (underscores in project name)", () => {
    expect(classifyFolderName("240401_Apple_Product_Shoot").folderType).toBe("personal_folder");
    expect(classifyFolderName("2024-03-12_Richemont_Event_Recap").folderType).toBe("personal_folder");
  });

  it("falls back when the date segment contains non-digits (legacy check)", () => {
    expect(classifyFolderName("24A401_Apple_ProductShoot").folderType).toBe("personal_folder");
  });

  it("falls back when the client segment is empty", () => {
    expect(classifyFolderName("240401__ProductShoot").folderType).toBe("personal_folder");
  });

  it("falls back for plain folder names", () => {
    expect(classifyFolderName("Archive").folderType).toBe("personal_folder");
    expect(classifyFolderName("LUTs").folderType).toBe("personal_folder");
    expect(classifyFolderName("Exports_old").folderType).toBe("personal_folder");
  });

  it("falls back when date segment is the wrong length", () => {
    expect(classifyFolderName("2404_Apple_ProductShoot").folderType).toBe("personal_folder");
    expect(classifyFolderName("2404010_Apple_ProductShoot").folderType).toBe("personal_folder");
  });

  it("falls back for empty input", () => {
    expect(classifyFolderName("").folderType).toBe("personal_folder");
  });

  it("falls back when a non-ASCII digit is used in the legacy date", () => {
    // Unicode full-width digit U+FF10 is NOT an ASCII digit
    expect(classifyFolderName("24040０_Apple_ProductShoot").folderType).toBe("personal_folder");
  });
});

// ---------------------------------------------------------------------------
// Return shape invariants
// ---------------------------------------------------------------------------

describe("classifyFolderName — return shape invariants", () => {
  it("always returns all eight fields (may be null)", () => {
    const c = classifyFolderName("foo");
    expect(c).toEqual({
      folderType: "personal_folder",
      parsedDate: null,
      parsedClient: null,
      parsedProject: null,
      normalizedName: null,
      namingConvention: null,
      namingConfidence: "low",
      namingStatus: "invalid"
    });
  });

  it("never throws on weird input", () => {
    expect(() => classifyFolderName("___")).not.toThrow();
    expect(() => classifyFolderName("_")).not.toThrow();
    expect(() => classifyFolderName("\n\t")).not.toThrow();
  });
});
