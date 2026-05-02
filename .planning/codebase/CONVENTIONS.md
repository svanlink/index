# Coding Conventions

**Analysis Date:** 2026-05-02

## Language Split

This is a bilingual codebase: TypeScript (frontend + data/domain packages) and Rust (Tauri backend). Conventions differ by layer.

---

## TypeScript Conventions

### Naming Patterns

**Files:**
- React components: PascalCase — `ProjectsPage.tsx`, `ErrorBoundary.tsx`, `RootLayout.tsx`
- Hooks: camelCase with `use` prefix — `useAsyncAction.ts`, `useWindowDragRegions.ts`, `useOptimisticMutation.ts`
- Services / utilities: camelCase — `catalogActions.ts`, `syncHelpers.ts`, `scanIngestionService.ts`
- Test files: co-located, same name + `.test.` suffix — `useAsyncAction.ts` → `useAsyncAction.test.ts`
- CSS/styles: `styles/` directory, snake_case or camelCase — `materialTheme.ts`, `pagePrimitives.tsx`

**Functions:**
- camelCase for all functions and methods — `startCatalogScan`, `getSyncStatusLabel`, `buildDriveNameMap`
- Boolean returns: `is` / `has` / `should` / `can` prefix — `isSyncEnabled`, `isOnline`

**Variables:**
- camelCase throughout — `mockCatalogSnapshot`, `localProject`, `remoteProject`

**Types / Interfaces:**
- PascalCase — `CatalogRepository`, `SyncAdapter`, `DriveDetailView`, `StartCatalogScanInput`
- Use `interface` for object shapes, `type` for unions and utility types
- String literal unions over enums — e.g. `"local-only" | "remote-ready"`, `"pending" | "completed" | "interrupted"`

**Constants:**
- camelCase for module-level const objects — `mockCatalogSnapshot`, `mockDrives`
- Avoid magic numbers; use named variables or inline comments

### TypeScript Strict Mode

All packages extend `tsconfig.base.json` which enforces:
- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `forceConsistentCasingInFileNames: true`
- `isolatedModules: true`
- Target: `ES2022`, module resolution: `Bundler`

### Immutability

Immutability is enforced throughout. The data package uses `structuredClone` for all state copies:

```typescript
// packages/data/src/inMemoryLocalPersistence.ts
const clone = <T>(value: T): T => structuredClone(value);

const upsertById = <T extends { id: string }>(items: T[], input: T) => {
  const index = items.findIndex((item) => item.id === input.id);
  if (index === -1) {
    return [...items, clone(input)];   // new array — never push()
  }
  const next = clone(items);
  next[index] = clone(input);
  return next;                          // mutate only the clone
};
```

Never mutate state in place. Always return new arrays/objects.

### Import Organization

**Order (by convention observed in source):**
1. Node built-ins — `import { mkdtempSync } from "node:fs"`
2. Third-party — `import { describe, expect, it } from "vitest"`
3. Workspace packages — `import type { CatalogRepository } from "@drive-project-catalog/data"`
4. Local — `import { repository } from "./catalogRepository"`

**Workspace aliases (from `vite.config.ts`):**
- `@drive-project-catalog/domain` → `packages/domain/src/index.ts`
- `@drive-project-catalog/data` → `packages/data/src/index.ts`
- `@drive-project-catalog/data/testing` → `packages/data/src/testing/index.ts`
- `@drive-project-catalog/ui` → `packages/ui/src/index.ts`

### Error Handling

- Unknown errors narrowed before use: `if (error instanceof Error) { ... }`
- No silent swallowing — errors are re-thrown or passed to an `onError` callback
- User-facing hooks use normalized `Error` instances — see `useAsyncAction.ts` which converts string/object throws to `Error`
- Tauri commands return `Result<T, String>` on the Rust side; the TS side handles rejected promises via try/catch

### Logging

- No `console.log` in production code
- Tauri backend logging via `tauri-plugin-log` (structured, writes to log dir)
- Frontend uses `appLogging.ts` — `apps/desktop/src/app/appLogging.ts`

### Comments

- Module-level JSDoc for complex modules — e.g. `folderClassifier.ts` has a full `@module` block explaining rules
- Inline comments for non-obvious behavior and sync invariants
- Test files use comment blocks (dashes) to separate test categories/passes

### Private Fields

TypeScript private class fields use the `#` prefix (native JS private), not the `private` keyword:

```typescript
// packages/data/src/inMemoryLocalPersistence.ts
export class InMemoryLocalPersistence implements LocalPersistenceAdapter {
  #snapshot: CatalogSnapshot;
  #renameSuggestions: RenameSuggestion[] = [];
```

### Class vs Function

- Domain logic: classes with `#`-private fields and constructor injection
- React: function components only, no class components
- React hooks: standalone exported functions

### React Component Props

- Named `interface` or `type` per component, not inline
- No `React.FC` — destructure props directly:

```typescript
function UserCard({ user, onSelect }: UserCardProps) { ... }
```

### Context Pattern

Context is created with `createContext`, consumed via a named hook, and provided with a wrapper component — see `apps/desktop/src/app/providers.tsx`.

---

## Rust Conventions

### Naming

Follows standard Rust conventions:
- `snake_case` — functions, methods, variables, modules — `classify_folder_name`, `scan_directory`, `is_cancelled`
- `PascalCase` — types, enums, structs — `FolderClassification`, `AppScanState`, `ScanSession`
- `SCREAMING_SNAKE_CASE` — constants — `MAX_SCAN_DEPTH`, `CANCELLED_ERROR`, `IGNORED_SYSTEM_FOLDERS`

### Module Organization

Four files under `apps/desktop/src-tauri/src/`:
- `lib.rs` — plugin setup, command registration, app entry
- `scan_engine.rs` — scan logic, folder classification, size workers
- `volume_info.rs` — macOS volume metadata
- `volume_import.rs` — folder enumeration for import flow

### Serde

All Tauri command outputs derive `Serialize`. Fields use `#[serde(rename_all = "camelCase")]` to match TypeScript conventions:

```rust
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo { ... }
```

### Error Handling

- Tauri commands return `Result<T, String>` — errors are `String` messages, not typed errors
- `?` for propagation within internal helpers
- `expect("scan state poisoned")` on `Mutex::lock()` (intentional panic on poison)
- `map_err(|e| format!("...")` for readable context at boundaries

### Ownership

- `Arc<ScanSession>` for shared scan state across threads
- `Mutex<ScanSnapshot>` for interior mutability of mutable scan state
- `AtomicBool` for lock-free cancel/finalized flags
- `State<'_, AppScanState>` for Tauri-managed shared state injection

### Safety / Lint

- `#[cfg_attr(not(test), deny(clippy::disallowed_methods))]` in `scan_engine.rs` — prevents write-to-disk in production paths
- `.clippy.toml` at crate root forbids specific `std::fs` write functions
- Tests explicitly `#[allow(clippy::disallowed_methods)]` with a comment explaining the exemption

### Parity Principle

`classify_folder_name` in Rust (`scan_engine.rs`) and `classifyFolderName` in TypeScript (`packages/domain/src/folderClassifier.ts`) must stay in sync. The TypeScript version carries a module-level comment: "Keep this in sync with `scan_engine.rs::classify_folder_name`."

---

## Build / Tooling

**TypeScript:**
- Formatter: none configured (no `.prettierrc` or `eslint.config.*` detected — TypeScript strict mode enforced by `tsc`)
- Type-check: `pnpm typecheck` (runs `tsc --noEmit`)
- Build: `vite build` (frontend), `tauri build` (full app)

**Rust:**
- `cargo fmt` — formatting
- `cargo clippy` — linting (`disallowed_methods` enforced)
- `cargo build` / `tauri dev` — dev

---

*Convention analysis: 2026-05-02*
