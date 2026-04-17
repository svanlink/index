// Subpath barrel for test-only fixtures. Consumers:
//   - Inside packages/data: import via relative paths (./testing/mockData, etc.)
//   - Outside packages/data: import from "@drive-project-catalog/data/testing"
//
// This subpath is intentionally NOT re-exported from the main barrel so
// production code cannot accidentally import the mock fixtures and ship
// them in a bundle.
export * from "./mockCatalogRepository";
export * from "./mockData";
