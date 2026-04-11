import { describe, expect, it } from "vitest";
import { classifyFolderName } from "./folderClassifier";

// ---------------------------------------------------------------------------
// Parity tests — these mirror the Rust unit tests in scan_engine.rs so the
// two implementations cannot silently drift. If either side changes a rule,
// this file must be updated alongside the Rust tests.
// ---------------------------------------------------------------------------

describe("classifyFolderName — client classification", () => {
  it("classifies well-formed client folders", () => {
    const c = classifyFolderName("240401_Apple_ProductShoot");
    expect(c.folderType).toBe("client");
    expect(c.parsedDate).toBe("240401");
    expect(c.parsedClient).toBe("Apple");
    expect(c.parsedProject).toBe("ProductShoot");
  });

  it("treats lowercase 'internal' as a client name (exact-case match only)", () => {
    const c = classifyFolderName("240401_internal_Archive");
    expect(c.folderType).toBe("client");
    expect(c.parsedClient).toBe("internal");
  });
});

describe("classifyFolderName — personal_project classification", () => {
  it("classifies 240401_Internal_Archive as personal_project", () => {
    const c = classifyFolderName("240401_Internal_Archive");
    expect(c.folderType).toBe("personal_project");
    expect(c.parsedDate).toBe("240401");
    // Matches the Rust contract: parsed_client() returns None for PersonalProject
    expect(c.parsedClient).toBeNull();
    expect(c.parsedProject).toBe("Archive");
  });
});

describe("classifyFolderName — personal_folder fallback", () => {
  it("falls back when there are too few parts", () => {
    expect(classifyFolderName("240401_Apple").folderType).toBe("personal_folder");
  });

  it("falls back when there are too many parts", () => {
    expect(classifyFolderName("240401_Apple_Product_Shoot").folderType).toBe("personal_folder");
  });

  it("falls back when the date segment contains non-digits", () => {
    expect(classifyFolderName("24A401_Apple_ProductShoot").folderType).toBe("personal_folder");
  });

  it("falls back when the client segment is empty", () => {
    expect(classifyFolderName("240401__ProductShoot").folderType).toBe("personal_folder");
  });

  it("falls back for plain folder names", () => {
    expect(classifyFolderName("Archive").folderType).toBe("personal_folder");
  });

  it("falls back when date segment is the wrong length", () => {
    expect(classifyFolderName("2404_Apple_ProductShoot").folderType).toBe("personal_folder");
    expect(classifyFolderName("2404010_Apple_ProductShoot").folderType).toBe("personal_folder");
  });

  it("falls back for empty input", () => {
    expect(classifyFolderName("").folderType).toBe("personal_folder");
  });

  it("falls back when a non-ASCII digit is used in the date", () => {
    // Unicode full-width digit U+FF10 is NOT an ASCII digit
    expect(classifyFolderName("24040\uFF10_Apple_ProductShoot").folderType).toBe("personal_folder");
  });
});

describe("classifyFolderName — return shape invariants", () => {
  it("always returns all four fields (may be null)", () => {
    const c = classifyFolderName("foo");
    expect(c).toEqual({
      folderType: "personal_folder",
      parsedDate: null,
      parsedClient: null,
      parsedProject: null
    });
  });

  it("never throws on weird input", () => {
    expect(() => classifyFolderName("___")).not.toThrow();
    expect(() => classifyFolderName("_")).not.toThrow();
    expect(() => classifyFolderName("\n\t")).not.toThrow();
  });
});
