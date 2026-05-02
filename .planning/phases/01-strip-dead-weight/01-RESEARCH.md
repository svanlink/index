# Phase 1: Strip Dead Weight — Research

**Researched:** 2026-05-02
**Domain:** Bundle cleanup — MUI removal, Rust dep pruning, Rust module deduplication, ghost-route UI fix
**Confidence:** HIGH

---

## Summary

Phase 1 is five discrete surgical changes — none depends on the others, all are low-risk. The codebase has already fully migrated to Tailwind; MUI exists only as three import lines in `main.tsx` and one file (`materialTheme.ts`). The CSS resets that CssBaseline provided are already present in `globals.css`. The Rust `constants.rs` deduplication is a standard module extraction — Rust's module system handles this with two lines of change per file. The ghost-route toast reference is isolated to one string and one conditional expression block in `DriveDetailPage.tsx` lines 204–216.

The key non-obvious finding: `sha2` is a **transitive dependency** of `sqlx-core`, `wry`, and `tauri-codegen` — removing `sha2` from `Cargo.toml` removes it as a *direct* dep, which is correct, but it will remain in `Cargo.lock` and in the compiled binary via those transitive chains. This is the expected and correct outcome; the Cargo.lock entry is not a sign of failure.

`@fontsource-variable/inter` is installed in `package.json` but never imported anywhere in the codebase. It is dead weight alongside Roboto. FOUND-01 as stated covers only the MUI/Emotion/Roboto bundle; the Inter package is a bonus removal opportunity the planner may bundle into the same task.

**Primary recommendation:** Execute all five changes as independent tasks. No cross-task dependencies. Each verifiable independently with `cargo check` (Rust) or `pnpm build` / visual inspection (frontend).

---

## Project Constraints (from CLAUDE.md)

- macOS only — Tauri WKWebView runtime, not a browser
- `corepack pnpm --filter @drive-project-catalog/desktop dev` is the dev command
- pnpm monorepo: workspace root at `/Users/vaneickelen/Desktop/Catalog/`, desktop package at `apps/desktop/`
- SQLite singleton, WAL mode — not relevant to this phase (no DB changes)
- Migrations are append-only — not relevant to this phase

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| MUI package removal | Frontend build | — | Build-time only; runtime bundle affected |
| CSS baseline resets | Frontend (WKWebView) | — | CSS runs in WKWebView; no server tier |
| Rust dep removal | Rust binary | — | Cargo.toml / compile-time only |
| Rust constants dedup | Rust binary | — | Compile-time module reorganization |
| Ghost-route toast fix | Frontend (page component) | — | UI string fix in DriveDetailPage |

---

## Standard Stack

No new libraries introduced in this phase. All work is removal or reorganization.

### Verified package locations

| Package | Location | Status |
|---------|----------|--------|
| `@mui/material ^9.0.0` | `apps/desktop/package.json` dependencies | Remove |
| `@emotion/react ^11.14.0` | `apps/desktop/package.json` dependencies | Remove |
| `@emotion/styled ^11.14.1` | `apps/desktop/package.json` dependencies | Remove |
| `@fontsource/roboto ^5.2.10` | `apps/desktop/package.json` dependencies | Remove |
| `@fontsource-variable/inter ^5.2.8` | `apps/desktop/package.json` dependencies | Remove (never imported anywhere) |
| `notify = "6.1"` | `apps/desktop/src-tauri/Cargo.toml` | Remove |
| `sha2 = "0.10"` | `apps/desktop/src-tauri/Cargo.toml` | Remove |

[VERIFIED: grep of package.json and Cargo.toml]

---

## Architecture Patterns

### FOUND-01: MUI Removal

**What exists now** [VERIFIED: codebase grep]:

MUI is confined to exactly two files:

1. `apps/desktop/src/main.tsx` — lines 3, 7–10, 17–20:
   ```tsx
   import { CssBaseline, ThemeProvider } from "@mui/material";
   import { materialTheme } from "./app/materialTheme";
   import "@fontsource/roboto/300.css";
   import "@fontsource/roboto/400.css";
   import "@fontsource/roboto/500.css";
   import "@fontsource/roboto/700.css";
   // ...
   <ThemeProvider theme={materialTheme}>
     <CssBaseline />
     <App />
   </ThemeProvider>
   ```

2. `apps/desktop/src/app/materialTheme.ts` — entire file, only imports `createTheme` from `@mui/material/styles`.

No other file in `src/` imports from `@mui/*`, `@emotion/*`, or `@fontsource/roboto`. [VERIFIED: grep across all `.tsx`/`.ts`/`.css` files]

**After removal**, `main.tsx` becomes:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { initializeAppLogging } from "./app/appLogging";
import "./styles/globals.css";

initializeAppLogging();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`materialTheme.ts` is deleted entirely.

**pnpm uninstall command** (must run inside `apps/desktop/` workspace, or use filter):

```bash
corepack pnpm --filter @drive-project-catalog/desktop remove \
  @mui/material @emotion/react @emotion/styled @fontsource/roboto @fontsource-variable/inter
```

[ASSUMED: `@fontsource-variable/inter` removal is correct — it is installed but never imported. Confirmed by grep.]
[VERIFIED: package name is `@drive-project-catalog/desktop` from `apps/desktop/package.json`]

---

### MAC-03: Tailwind Preflight Gap Audit

**What MUI CssBaseline injected** [CITED: https://github.com/mui/material-ui/blob/master/packages/mui-material/src/CssBaseline/CssBaseline.js]:

MUI v9 CssBaseline applies the theme's `palette.background.default` to `body`, sets `margin:0`, sets `-webkit-font-smoothing: antialiased`, sets `box-sizing: border-box` on `html` and inherits it via `*, *::before, *::after`. It also sets the theme font-family on body.

**What globals.css already covers** [VERIFIED: reading `apps/desktop/src/styles/globals.css`]:

| CssBaseline behavior | Coverage in globals.css | Line |
|---------------------|------------------------|------|
| `-webkit-font-smoothing: antialiased` | `html { -webkit-font-smoothing: antialiased; }` | 236 |
| `-moz-osx-font-smoothing: grayscale` | `html { -moz-osx-font-smoothing: grayscale; }` | 237 |
| `body { margin: 0 }` | `body { margin: 0; }` | 242 |
| `body { background-color }` | `body { background: var(--canvas); }` | 245 |
| `body { color }` | `body { color: var(--ink); }` | 247 |
| `body { font-family }` | `body { font-family: var(--font-sans); }` | 248 |
| `* { box-sizing: border-box }` | `* { box-sizing: border-box; }` | 267–269 |
| `body { font-size: 14px }` | `body { font-size: 14px; }` | 249 |
| `button { font-family: inherit }` | `button { font-family: inherit; }` | 271–273 |

**Conclusion:** Every reset CssBaseline provided is already in `globals.css`. MAC-03 requires no new CSS additions — only verification that these rules exist (they do). The requirement is satisfied by the existing globals.

**One edge case**: `index.html` inlines `body { background: #ffffff }` for first-paint. This is intentionally overridden by `globals.css` at module load. This was true before CssBaseline too — no change needed.

**What Tailwind Preflight does NOT cover** that CssBaseline does (but globals.css already handles):
- Body background color (Preflight sets nothing; globals.css sets `var(--canvas)`)
- `-webkit-font-smoothing` (Preflight does not set this; globals.css line 236 does)
- `* { box-sizing: border-box }` — Tailwind Preflight uses a different approach (sets `box-sizing: border-box` on specific elements). The globals.css `*` selector is more universal and overrides correctly.

[CITED: https://tailwindcss.com/docs/preflight — Preflight is based on modern-normalize and does not set font-smoothing or body background]

---

### FOUND-03: Rust Dependency Removal

**What to remove from `Cargo.toml`** [VERIFIED: reading Cargo.toml]:

```toml
# DELETE these two lines:
notify = "6.1"
sha2 = "0.10"
```

**Verification that they are unused** [VERIFIED: grep of all `.rs` files in `src-tauri/src/`]:

Zero matches for `use notify`, `use sha2`, `notify::`, or `sha2::` across all five Rust source files (`lib.rs`, `main.rs`, `scan_engine.rs`, `volume_import.rs`, `volume_info.rs`).

**Transitive dep caveat** [VERIFIED: parsing Cargo.lock]:

- `notify`: only depended on by `drive-project-catalog` (the crate itself). Removing it from `Cargo.toml` removes it from the build entirely. After `cargo check`, `notify` and its tree will disappear from Cargo.lock.
- `sha2`: depended on by `sqlx-core`, `sqlx-macros-core`, `sqlx-mysql`, `sqlx-postgres`, `tauri-codegen`, and `wry` — all transitive dependencies. Removing `sha2` from `Cargo.toml` is correct (it should not be a direct dep if unused), but `sha2` will remain in `Cargo.lock` and the compiled binary via those transitive chains. This is expected and correct behavior, not a failure.

**Verification command** [VERIFIED: Rust toolchain standard]:

```bash
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

This recompiles without linking and takes ~10–30s. Faster than `cargo build`. If this passes, the removal is safe.

After `cargo check`, `cargo update` is NOT needed — `cargo check` will automatically update `Cargo.lock` to remove `notify` (and its unique transitive tree) from the lock file.

---

### FOUND-04: Rust Constants Deduplication

**Current state** [VERIFIED: reading both files]:

`IGNORED_SYSTEM_FOLDERS` is defined as identical `const` arrays in two files:
- `src-tauri/src/scan_engine.rs` lines 48–61
- `src-tauri/src/volume_import.rs` lines 52–65

Both contain identical entries: `$RECYCLE.BIN`, `System Volume Information`, `.Spotlight-V100`, `.Trashes`, `.fseventsd`, `DCIM`, `MISC`, `LOST+FOUND`.

**Rust module system pattern** [CITED: https://doc.rust-lang.org/book/ch07-02-defining-modules-to-control-scope-and-privacy.html]:

Standard pattern for a single-binary Tauri app (no separate library crate needed):

**Step 1: Create `src-tauri/src/constants.rs`**:

```rust
/// System / recovery folders skipped on every OS. Used by both the scan
/// engine and the volume import path to agree on what is not a project folder.
pub const IGNORED_SYSTEM_FOLDERS: &[&str] = &[
    // Windows
    "$RECYCLE.BIN",
    "System Volume Information",
    // macOS
    ".Spotlight-V100",
    ".Trashes",
    ".fseventsd",
    // Camera / memory card system folders
    "DCIM",
    "MISC",
    // Unix filesystem recovery
    "LOST+FOUND",
];
```

**Step 2: Declare in `src-tauri/src/lib.rs`** (add one line at top):

```rust
mod constants;
mod scan_engine;
mod volume_import;
mod volume_info;
```

**Step 3: Replace in `scan_engine.rs`** — delete the local `const IGNORED_SYSTEM_FOLDERS` block and add at top:

```rust
use crate::constants::IGNORED_SYSTEM_FOLDERS;
```

**Step 4: Replace in `volume_import.rs`** — delete the local `const IGNORED_SYSTEM_FOLDERS` block (and its doc comment) and add:

```rust
use crate::constants::IGNORED_SYSTEM_FOLDERS;
```

**Key Rust scoping rules** [CITED: https://doc.rust-lang.org/reference/visibility-and-privacy.html]:

- `pub const` in `constants.rs` makes it visible outside the module
- `crate::constants::IGNORED_SYSTEM_FOLDERS` reaches it from sibling modules
- The `mod constants;` declaration in `lib.rs` tells the compiler to look for `constants.rs` in the same directory
- No `Cargo.toml` changes required — this is purely source reorganization
- The `#![cfg_attr(not(test), deny(clippy::disallowed_methods))]` attribute in both source files is on those modules, not on `constants.rs` — no attribute changes needed in constants.rs

**Verification**:

```bash
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
```

---

### ACCU-03: Remove Ghost-Route Toast Reference

**Current state** [VERIFIED: reading DriveDetailPage.tsx lines 200–218]:

When `result.cleanupReviewCount > 0`, the import success handler:
1. Pushes the string `"${result.cleanupReviewCount} need cleanup and were sent to Rename Review."` into `parts` (line 205)
2. Sets `tone: "warning"` and `title: "Folders imported with cleanup needed"` (lines 215–216)

The "Rename Review" route does not exist in `router.tsx` [VERIFIED: reading router.tsx — routes are `/projects`, `/projects/:projectId`, `/drives`, `/drives/:driveId` only]. No `rename-review` or similar route exists.

**What `cleanupReviewCount` represents** [VERIFIED: reading `packages/data/src/repository.ts` and `localCatalogRepository.ts`]:

`cleanupReviewCount` is a real field — it counts folders imported with non-standard names (legacy format, invalid names, etc.) that were flagged during import. The field is populated and meaningful. Only the message referencing a nonexistent route is wrong.

**Fix strategy**: Remove the ghost-route string. Keep the `cleanupReviewCount > 0` check but change the message to something accurate. Two options:

Option A (minimal — remove the ghost line, tone stays warning):
```tsx
if (result.cleanupReviewCount > 0) {
  parts.push(`${result.cleanupReviewCount} folder${result.cleanupReviewCount === 1 ? " has" : "s have"} non-standard names.`);
}
```

Option B (simplest — collapse warning/success into one tone, remove the branch entirely):

Drop the `cleanupReviewCount` branch and let `buildImportCleanupIssueParts` carry all the detail (it already runs on line 208 and covers the same data). Set tone always to `"success"` when `importedCount > 0`.

[ASSUMED: Which option to use. Option A is recommended — it preserves user-visible information about cleanup issues without referencing a ghost route. Planner should pick one and document.]

**Exact lines to modify** [VERIFIED: DriveDetailPage.tsx]:

- Line 204–206: the `if (result.cleanupReviewCount > 0) { parts.push(...) }` block — replace or remove the `parts.push` string
- Line 215: `tone: result.cleanupReviewCount > 0 ? "warning" : "success"` — keep or simplify
- Line 216: `title: result.cleanupReviewCount > 0 ? "Folders imported with cleanup needed" : "Folders imported"` — keep or simplify

No other files need changes for ACCU-03.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Shared Rust constants | Re-duplicate or use lazy_static/once_cell | Plain `pub const` in a module file |
| CSS resets | Custom reset stylesheet | Already handled in globals.css |

---

## Common Pitfalls

### Pitfall 1: Forgetting to delete materialTheme.ts
**What goes wrong:** Import of `materialTheme` removed from `main.tsx` but `materialTheme.ts` left in place. TypeScript build passes (unused file), but Roboto and MUI types still ship in the bundle if Vite tree-shakes incorrectly.
**How to avoid:** Delete `src/app/materialTheme.ts` as part of the task, not just remove the import.
**Warning signs:** `apps/desktop/src/app/materialTheme.ts` still present after the change.

### Pitfall 2: Removing sha2 and expecting it to vanish from Cargo.lock
**What goes wrong:** Developer removes `sha2` from `Cargo.toml`, runs `cargo check`, sees sha2 still in `Cargo.lock`, concludes the removal failed.
**Why it happens:** sha2 is a transitive dep of sqlx and wry. It stays in Cargo.lock for those chains.
**How to avoid:** Accept this. The direct dep entry for `drive-project-catalog` → `sha2` will be gone. Only the `notify` dep tree fully disappears from Cargo.lock.

### Pitfall 3: Running pnpm remove from the workspace root instead of the correct package
**What goes wrong:** Running `pnpm remove @mui/material` from `/Users/vaneickelen/Desktop/Catalog/` removes from root `package.json` (which doesn't have MUI). Nothing happens. Packages remain in `apps/desktop/package.json`.
**How to avoid:** Use the filter flag: `corepack pnpm --filter @drive-project-catalog/desktop remove ...`

### Pitfall 4: Assuming MAC-03 requires new CSS
**What goes wrong:** Planner adds font-smoothing or box-sizing rules to globals.css that are already there.
**Why it happens:** The requirement says "restore" — implying they were missing. They were never removed; they predate the MUI addition.
**How to avoid:** Read globals.css first. Lines 236, 242, 245, 267 confirm all resets are present.

### Pitfall 5: Clippy disallowed_methods denial on scan_engine.rs
**What goes wrong:** When moving IGNORED_SYSTEM_FOLDERS to constants.rs, a developer adds new code to constants.rs that triggers `disallowed_methods`. 
**Why it can't happen:** `#![cfg_attr(not(test), deny(clippy::disallowed_methods))]` is an inner attribute on `scan_engine.rs` and `volume_import.rs`, not on `constants.rs`. The constants file contains only a `pub const` with string literals — no method calls of any kind. No issue.

---

## Runtime State Inventory

Phase 1 is code/config changes only. No runtime state affected.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no DB schema or content changes | — |
| Live service config | None | — |
| OS-registered state | None | — |
| Secrets/env vars | None | — |
| Build artifacts | `node_modules/@mui`, `node_modules/@emotion`, `node_modules/@fontsource` — will be pruned by pnpm after removal | Automatic via pnpm |

---

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| pnpm (corepack) | Package removal | Confirmed (project uses it) | `corepack pnpm --filter` syntax verified |
| cargo | Rust dep verification | macOS Tauri dev machine | Standard toolchain |
| Vite 7 | Bundle verification | `apps/desktop/devDependencies` | `^7.1.7` |

---

## Validation Architecture

> `nyquist_validation: false` in config.json — skip.

---

## Security Domain

Phase 1 removes dead code and unused dependencies. No auth, input handling, or external data flows modified. No ASVS categories applicable.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@fontsource-variable/inter` should be removed alongside Roboto (never imported) | FOUND-01 | Low — worst case it stays installed, no runtime impact. Can defer. |
| A2 | Option A for ACCU-03 (replace ghost-route string with accurate message) is correct | ACCU-03 | Low — Option B is also valid. Planner should confirm which approach. |

---

## Open Questions

1. **ACCU-03 tone after fix**: Should `cleanupReviewCount > 0` still show a `"warning"` tone after the ghost-route string is removed, or collapse to `"success"` since there's no actionable destination?
   - What we know: `buildImportCleanupIssueParts` already surfaces the detected issue details in the same message block.
   - What's unclear: Product intent — is "cleanup needed" a warning state the user should notice, or just informational?
   - Recommendation: Keep `"warning"` tone for `cleanupReviewCount > 0` (folders with non-standard names are genuinely a data quality signal), change only the ghost-route string.

---

## Sources

### Primary (HIGH confidence)
- Codebase grep — all MUI/emotion/fontsource imports, all IGNORED_SYSTEM_FOLDERS definitions, full router.tsx, full DriveDetailPage.tsx relevant sections, full globals.css, Cargo.toml, Cargo.lock analysis
- [CITED: Tailwind Preflight docs](https://tailwindcss.com/docs/preflight)
- [CITED: Rust module system](https://doc.rust-lang.org/book/ch07-02-defining-modules-to-control-scope-and-privacy.html)
- [CITED: Rust visibility and privacy](https://doc.rust-lang.org/reference/visibility-and-privacy.html)

### Secondary (MEDIUM confidence)
- [CITED: MUI CssBaseline source](https://github.com/mui/material-ui/blob/master/packages/mui-material/src/CssBaseline/CssBaseline.js) — used to enumerate what CssBaseline applied, cross-verified against globals.css content

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified by reading actual package.json and Cargo.toml
- Architecture: HIGH — all file locations and line numbers verified by reading source
- Pitfalls: HIGH — sha2 transitive dep finding verified by parsing Cargo.lock; MUI scope verified by grep

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (stable; no external services involved)
