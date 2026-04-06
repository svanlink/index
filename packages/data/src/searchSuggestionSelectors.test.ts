import { describe, expect, it } from "vitest";
import { buildProjectSearchSuggestions, mockDrives, mockProjects } from "./index";

describe("searchSuggestionSelectors", () => {
  it("prioritizes prefix matches and groups suggestions", () => {
    const groups = buildProjectSearchSuggestions(mockProjects, mockDrives, "ad", {});

    expect(groups.map((group) => group.label)).toEqual(["Clients", "Projects"]);
    expect(groups[0]?.suggestions[0]?.label).toBe("Adidas");
    expect(groups[0]?.suggestions[0]?.matchType).toBe("prefix");
    expect(groups[1]?.suggestions.some((suggestion) => suggestion.label === "Adidas Social")).toBe(true);
  });

  it("respects active non-search filters when building suggestions", () => {
    const groups = buildProjectSearchSuggestions(mockProjects, mockDrives, "ad", {
      currentDriveId: "__unassigned__",
      showMovePending: true
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]?.suggestions.every((suggestion) => suggestion.label.includes("Adidas"))).toBe(true);
    expect(groups[1]?.suggestions.every((suggestion) => suggestion.label.includes("Adidas"))).toBe(true);
  });
});
