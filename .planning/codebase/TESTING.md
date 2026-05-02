# Testing Patterns

**Analysis Date:** 2026-05-02

## Test Framework

**Runner (TypeScript):**
- Vitest `^3.2.4`
- Config: inline in `apps/desktop/vite.config.ts` (`test` key); packages run with default Vitest config
- Setup file: `apps/desktop/src/test/setup.ts`

**Assertion Library:**
- Vitest built-in `expect` (Jest-compatible)
- `@testing-library/jest-dom` matchers imported in `setup.ts` and per-test via `import "@testing-library/jest-dom/vitest"`

**React Testing:**
- `@testing-library/react` `^16.3.0` — `render`, `screen`, `fireEvent`, `waitFor`, `renderHook`, `act`

**Runner (Rust):**
- Cargo built-in `#[test]` / `#[cfg(test)]`
- `tempfile` crate for temporary fixture directories in Rust tests

**Run Commands:**
```bash
pnpm test                    # Run all tests across all packages (recursive)
pnpm --filter @drive-project-catalog/desktop test   # Desktop package only
pnpm --filter @drive-project-catalog/data test      # Data package only
pnpm --filter @drive-project-catalog/domain test    # Domain package only

# Rust tests
cargo test                   # Run all Rust tests
cargo test -- --nocapture    # Show println output
```

## Test File Organization

**Location:** Co-located with source files.

```
packages/data/src/
├── catalogSelectors.ts
├── catalogSelectors.test.ts      # same directory as implementation
├── localCatalogRepository.ts
├── localCatalogRepository.test.ts
└── testing/
    ├── index.ts                  # re-exports
    ├── mockCatalogRepository.ts  # MockCatalogRepository class
    ├── mockCatalogRepository.test.ts
    └── mockData.ts               # shared fixture data

apps/desktop/src/app/
├── useAsyncAction.ts
├── useAsyncAction.test.ts
├── catalogActions.ts
├── catalogActions.test.ts

apps/desktop/src-tauri/src/
└── scan_engine.rs                # #[cfg(test)] mod tests { ... } at bottom
```

**Naming:**
- TypeScript: `<module>.test.ts` or `<Component>.test.tsx`
- Rust: `#[cfg(test)] mod tests` block at the bottom of the same `.rs` file

## Test Structure

**TypeScript — Suite Organization:**
```typescript
import { describe, expect, it, vi } from "vitest";

describe("ModuleName", () => {
  it("does the expected thing", () => {
    // Arrange
    const input = ...;

    // Act
    const result = fn(input);

    // Assert
    expect(result).toBe(expected);
  });

  describe("nested sub-feature", () => {
    it("specific behavior", () => { ... });
  });
});
```

**Rust — Suite Organization:**
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_new_standard_yyyy_mm_dd_folders() {
        let c = classify_folder_name("2024-03-12_Richemont - EventRecap");
        assert!(matches!(c, FolderClassification::Client { .. }));
        assert_eq!(c.folder_type_str(), "client");
    }
}
```

**Patterns:**
- No `beforeEach`/`afterEach` for state (prefer setup inside `it` block)
- `afterEach(() => cleanup())` in `setup.ts` — cleans React DOM after every test
- `beforeEach` used for spy setup in `ErrorBoundary.test.tsx`
- AAA (Arrange-Act-Assert) structure throughout

## Mocking

**Framework:** Vitest `vi`

**Tauri API modules — mock entire module:**
```typescript
// apps/desktop/src/app/useWindowDragRegions.test.tsx
const { getCurrentWindowMock, startDraggingMock } = vi.hoisted(() => ({
  getCurrentWindowMock: vi.fn(),
  startDraggingMock: vi.fn(() => Promise.resolve())
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => {
    getCurrentWindowMock();
    return { startDragging: startDraggingMock };
  }
}));
```

**Tauri commands — mock the command wrapper module:**
```typescript
// apps/desktop/src/app/catalogActions.test.ts
const startDesktopScanMock = vi.fn();
vi.mock("./scanCommands", () => ({
  startDesktopScan: startDesktopScanMock,
  cancelDesktopScan: cancelDesktopScanMock,
  ...
}));
```

**Repository — swap implementation via MockCatalogRepository:**
```typescript
// apps/desktop/src/pages/ProjectsPage.test.tsx
vi.mock("../app/catalogRepository", async () => {
  const { MockCatalogRepository } = await import("@drive-project-catalog/data/testing");
  return { repository: new MockCatalogRepository() };
});
```

**`MockCatalogRepository`** extends `LocalCatalogRepository` with `InMemoryLocalPersistence` seeded from `mockCatalogSnapshot`. Located at `packages/data/src/testing/mockCatalogRepository.ts`.

**Spy on methods:**
```typescript
// apps/desktop/src/app/ErrorBoundary.test.tsx
consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
```

**What to Mock:**
- All Tauri IPC APIs (`@tauri-apps/api/*`, `@tauri-apps/plugin-*`)
- External command wrappers (`scanCommands.ts`, `volumeImportCommands.ts`)
- The `repository` singleton from `catalogRepository.ts` in page tests

**What NOT to Mock:**
- Domain logic (pure functions, selectors, classifiers)
- Data layer internals — use `InMemoryLocalPersistence` / `InMemorySyncAdapter` instead
- The repository interface — use `MockCatalogRepository` which is a real implementation

## Fixtures and Factories

**Shared test data** lives in `packages/data/src/testing/mockData.ts`:
- `mockDrives: Drive[]` — 3 drives (drive-a, drive-b, drive-c/Freezer)
- `mockProjects: Project[]` — real project instances with all fields
- `mockCatalogSnapshot: CatalogSnapshot` — combined snapshot used as seed

**Usage pattern:**
```typescript
// Spread + override — immutable, never mutate mockCatalogSnapshot directly
const snapshot = structuredClone(mockCatalogSnapshot);
snapshot.scanSessions = [...];

// Or pass to InMemoryLocalPersistence for full repository tests
const repository = new LocalCatalogRepository(
  new InMemoryLocalPersistence(mockCatalogSnapshot),
  new InMemorySyncAdapter()
);
```

**Local fixture factories in test files** — defined inline as helper functions:
```typescript
// packages/data/src/localCatalogRepository.test.ts
async function seedProject(repository, overrides) {
  const template = mockCatalogSnapshot.projects.find(...);
  return repository.saveProject({ ...template, ...overrides });
}
```

**Rust fixture pattern** — `tempfile::tempdir()` for SQLite-backed tests:
```rust
let directory = mkdtempSync(join(tmpdir(), "drive-project-catalog-repository-"));
try {
  // ... test with real SQLite ...
} finally {
  rmSync(directory, { recursive: true, force: true });
}
```

## Stub / Fake Adapters

Complex integration tests use hand-written stub adapters defined at the bottom of the test file (not in a shared module). Pattern seen in `localCatalogRepository.test.ts`:

- `StubSyncAdapter` — configurable pull result, spy on `cancelPendingForRecord` calls
- `RecoveringSyncAdapter` — simulates a crashed-and-recovered sync state
- `QueuedPullableSyncAdapter` — real queue + configurable pull, no-op flush (for F5/F7 end-to-end tests)

These are declared as local `class` at the bottom of the test file, not exported.

## Test Types

**Unit Tests:**
- Pure functions, selectors, domain logic — no I/O, no React
- Examples: `catalogSelectors.test.ts`, `syncHelpers.test.ts`, `status.test.ts`, `folderClassifier.test.ts`
- Pattern: import function, call with fixture, assert on return value

**Integration Tests (TypeScript):**
- Repository + persistence + sync adapter wired together
- Use `InMemoryLocalPersistence` for fast, deterministic tests
- Use real `SqliteLocalPersistence` (via `node:sqlite`) for adapter parity tests
- File: `localCatalogRepository.test.ts` (1600+ lines, the largest test file)

**Component / Hook Tests:**
- `renderHook` for hooks — `useAsyncAction.test.ts`
- `render` + `screen` + `fireEvent` for pages — `ProjectsPage.test.tsx`
- Full router setup via `createTestRouter(initialEntries)` for page tests
- `waitFor` for async assertions

**Rust Unit Tests:**
- Inline `#[cfg(test)] mod tests` at bottom of each `.rs` file
- `scan_engine.rs` — covers `classify_folder_name` with named test functions per case
- `volume_import.rs` — covered similarly

**Parity Tests:**
- `packages/domain/src/folderClassifier.test.ts` mirrors `scan_engine.rs::tests` exactly
- Both test the same folder name inputs and assert identical outputs
- Comment in file: "these mirror the Rust unit tests in scan_engine.rs so the two implementations cannot silently drift"

**E2E Tests:** Not present. No Playwright configuration detected.

## Coverage

**Requirements:** None enforced — no coverage threshold configured.

**View Coverage:**
```bash
# Vitest coverage (add --coverage flag)
pnpm --filter @drive-project-catalog/data test -- --coverage

# Rust coverage
cargo llvm-cov
```

## Common Patterns

**Async Testing:**
```typescript
// waitFor for async state
await waitFor(() => expect(result.current.isPending).toBe(false));

// resolves/rejects matchers
await expect(repository.planProjectMove("id", "drive-c")).resolves.toBeUndefined();
await expect(repository.planProjectMove("id", "drive-a")).rejects.toThrow("target drive matches");
```

**Error Testing:**
```typescript
await expect(repository.planProjectMove("id", "same-drive")).rejects.toThrow(
  "The target drive matches the current drive."
);
```

**Spy assertion:**
```typescript
expect(sync.cancelCalls).toEqual(
  expect.arrayContaining([
    { entity: "drive", recordId: driveId },
    { entity: "project", recordId: projectId }
  ])
);
expect(sync.cancelCalls).toHaveLength(4);
```

**Setup file (`apps/desktop/src/test/setup.ts`):**
- Imports `@testing-library/jest-dom/vitest`
- Calls `cleanup()` in `afterEach`
- Patches `globalThis.AbortController`, `AbortSignal`, and `Request` for jsdom compatibility

---

*Testing analysis: 2026-05-02*
