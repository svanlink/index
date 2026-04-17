import { describe, expect, it } from "vitest";
import { mockDrives, mockProjects } from "@drive-project-catalog/data/testing";
import {
  buildBatchActionPreview,
  validateManualProjectForm,
  validateSingleProjectMove
} from "./catalogValidation";

describe("catalogValidation", () => {
  it("warns when batch drive assignment clears pending move state", () => {
    const preview = buildBatchActionPreview({
      kind: "assign-drive",
      selectedProjects: [mockProjects[1]!],
      drives: mockDrives,
      assignDriveId: "drive-c"
    });

    expect(preview.warnings.some((warning) => warning.includes("clear pending move state"))).toBe(true);
  });

  it("validates manual project creation inputs", () => {
    const result = validateManualProjectForm({
      parsedDate: "241332",
      parsedClient: "",
      parsedProject: "",
      category: "",
      sizeGigabytes: "",
      currentDriveId: ""
    });

    expect(result.errors.length).toBeGreaterThan(1);
    expect(result.warnings.some((warning) => warning.includes("unassigned"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("unknown size"))).toBe(true);
  });

  it("warns when a move target has insufficient remaining free space", () => {
    const largeProject = {
      ...mockProjects[0]!,
      sizeBytes: 200_000_000_000
    };
    const limitedDrive = {
      ...mockDrives[1]!,
      freeBytes: 50_000_000_000
    };

    const result = validateSingleProjectMove({
      project: largeProject,
      targetDriveId: limitedDrive.id,
      drives: [mockDrives[0]!, limitedDrive, mockDrives[2]!],
      allProjects: mockProjects
    });

    expect(result.warnings.some((warning) => warning.includes("insufficient"))).toBe(true);
  });
});
