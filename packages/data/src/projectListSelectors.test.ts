import { describe, expect, it } from "vitest";
import { mockDrives, mockProjects } from "./mockData";
import { filterProjectCatalog } from "./projectListSelectors";

describe("projectListSelectors", () => {
  it("combines drive and move-pending filters", () => {
    const filtered = filterProjectCatalog(mockProjects, mockDrives, {
      currentDriveId: "drive-b",
      showMovePending: true
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("project-240320-nike-ad");
  });

  it("supports search and category filtering together", () => {
    const filtered = filterProjectCatalog(mockProjects, mockDrives, {
      search: "adidas",
      category: "design"
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("project-240215-adidas-social");
  });
});
