---
phase: 01-strip-dead-weight
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/desktop/package.json
  - apps/desktop/src/main.tsx
  - apps/desktop/src/app/materialTheme.ts
  - apps/desktop/src-tauri/Cargo.toml
  - apps/desktop/src-tauri/src/constants.rs
  - apps/desktop/src-tauri/src/lib.rs
  - apps/desktop/src-tauri/src/scan_engine.rs
  - apps/desktop/src-tauri/src/volume_import.rs
  - apps/desktop/src/pages/DriveDetailPage.tsx
autonomous: true
requirements:
  - FOUND-01
  - FOUND-03
  - FOUND-04
  - ACCU-03
  - MAC-03

must_haves:
  truths:
    - "No @mui, @emotion, or @fontsource import survives in apps/desktop/src"
    - "notify and sha2 are absent from Cargo.toml [dependencies] (transitive presence in Cargo.lock is acceptable)"
    - "IGNORED_SYSTEM_FOLDERS is defined in exactly one place: src-tauri/src/constants.rs"
    - "Importing folders from a volume shows no toast text referencing Rename Review"
    - "App renders with correct body background, subpixel smoothing, and box-sizing after CssBaseline removal"
    - "cargo check passes clean after all Rust changes"
    - "TypeScript build passes clean after all frontend changes"
  artifacts:
    - path: "apps/desktop/src/main.tsx"
      provides: "Entry point — MUI-free"
      contains: "ReactDOM.createRoot"
    - path: "apps/desktop/src-tauri/src/constants.rs"
      provides: "Single source of IGNORED_SYSTEM_FOLDERS"
      contains: "pub(crate) const IGNORED_SYSTEM_FOLDERS"
  key_links:
    - from: "apps/desktop/src-tauri/src/scan_engine.rs"
      to: "apps/desktop/src-tauri/src/constants.rs"
      via: "use crate::constants::IGNORED_SYSTEM_FOLDERS"
      pattern: "use crate::constants::IGNORED_SYSTEM_FOLDERS"
    - from: "apps/desktop/src-tauri/src/volume_import.rs"
      to: "apps/desktop/src-tauri/src/constants.rs"
      via: "use crate::constants::IGNORED_SYSTEM_FOLDERS"
      pattern: "use crate::constants::IGNORED_SYSTEM_FOLDERS"
---

<objective>
Remove all dead runtime code and unused dependencies from the Catalog desktop app so the
foundation is clean before feature work begins.

Purpose: A ~350 KB MUI/Emotion bundle, two unused Rust crates, a duplicated constant, and a
ghost-route toast reference are the only things between the current codebase and a production-
grade starting point. This plan removes all five.

Output:
- MUI/Emotion/Roboto/Inter packages gone from node_modules and bundle
- materialTheme.ts deleted
- main.tsx renders App directly inside StrictMode — no ThemeProvider, no CssBaseline
- notify and sha2 removed from Cargo.toml [dependencies]
- IGNORED_SYSTEM_FOLDERS lives in constants.rs, imported by scan_engine.rs and volume_import.rs
- DriveDetailPage toast no longer pushes a string referencing the nonexistent Rename Review route
- CSS resets already provided by globals.css (lines 236, 242, 245, 267) — confirmed present, no
  new CSS needed (MAC-03 is satisfied by existing file)
</objective>

<execution_context>
@/Users/vaneickelen/Desktop/Catalog/.planning/phases/01-strip-dead-weight/01-RESEARCH.md
</execution_context>

<context>
@/Users/vaneickelen/Desktop/Catalog/.planning/PROJECT.md
@/Users/vaneickelen/Desktop/Catalog/.planning/ROADMAP.md

<interfaces>
<!-- Key contracts the executor needs. Extracted from codebase. -->

From apps/desktop/src/main.tsx (current state — full file):
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";   // DELETE
import { App } from "./app/App";
import { initializeAppLogging } from "./app/appLogging";
import { materialTheme } from "./app/materialTheme";           // DELETE
import "@fontsource/roboto/300.css";                           // DELETE
import "@fontsource/roboto/400.css";                           // DELETE
import "@fontsource/roboto/500.css";                           // DELETE
import "@fontsource/roboto/700.css";                           // DELETE
import "./styles/globals.css";                                 // KEEP

initializeAppLogging();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={materialTheme}>   // DELETE wrapper
      <CssBaseline />                       // DELETE
      <App />                               // KEEP
    </ThemeProvider>                        // DELETE wrapper
  </React.StrictMode>
);
```

Target state for main.tsx:
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

From apps/desktop/src-tauri/Cargo.toml (lines to remove from [dependencies]):
```toml
# Volume mount watcher — FSEvents on macOS via the notify crate.
notify = "6.1"
# Archive manifest — SHA-256 hashing for file integrity records.
sha2 = "0.10"
```

From apps/desktop/src-tauri/src/lib.rs (current mod list, lines 1–3):
```rust
mod scan_engine;
mod volume_import;
mod volume_info;
```

Target state (add mod constants; first):
```rust
mod constants;
mod scan_engine;
mod volume_import;
mod volume_info;
```

From apps/desktop/src/pages/DriveDetailPage.tsx (lines 200–218, import success handler):
```tsx
} else {
  const parts = [
    `${result.importedCount} folder${result.importedCount === 1 ? "" : "s"} added to "${drive.displayName}".`
  ];
  if (result.cleanupReviewCount > 0) {
    parts.push(`${result.cleanupReviewCount} need cleanup and were sent to Rename Review.`); // DELETE this push
  }
  const issueParts = buildImportCleanupIssueParts(result);
  if (issueParts.length > 0) {
    parts.push(`Detected: ${issueParts.join(", ")}.`);
  }
  if (result.skippedCount > 0) {
    parts.push(`${result.skippedCount} already in catalog were skipped.`);
  }
  setFeedback({
    tone: result.cleanupReviewCount > 0 ? "warning" : "success",    // simplify to "success"
    title: result.cleanupReviewCount > 0 ? "Folders imported with cleanup needed" : "Folders imported", // simplify to "Folders imported"
    messages: parts
  });
}
```

Target state for the else branch (lines 200–219):
```tsx
} else {
  const parts = [
    `${result.importedCount} folder${result.importedCount === 1 ? "" : "s"} added to "${drive.displayName}".`
  ];
  const issueParts = buildImportCleanupIssueParts(result);
  if (issueParts.length > 0) {
    parts.push(`Detected: ${issueParts.join(", ")}.`);
  }
  if (result.skippedCount > 0) {
    parts.push(`${result.skippedCount} already in catalog were skipped.`);
  }
  setFeedback({
    tone: "success",
    title: "Folders imported",
    messages: parts
  });
}
```

Note: buildImportCleanupIssueParts (line 207) and its result are retained — it surfaces
real issue details without referencing any route.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove MUI from the frontend — packages, files, and JSX</name>
  <files>
    apps/desktop/package.json
    apps/desktop/src/main.tsx
    apps/desktop/src/app/materialTheme.ts
  </files>
  <action>
Run from workspace root:

```bash
corepack pnpm --filter @drive-project-catalog/desktop remove \
  @mui/material @emotion/react @emotion/styled @fontsource/roboto @fontsource-variable/inter
```

This updates apps/desktop/package.json and prunes node_modules in one step.

Then delete the materialTheme file:
```bash
rm /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/app/materialTheme.ts
```

Then rewrite main.tsx to the target state shown in the context interfaces block:
- Remove lines 3, 6–10 (the MUI/Emotion/Roboto imports and materialTheme import)
- Remove ThemeProvider and CssBaseline from the render tree
- Keep React, ReactDOM, App, initializeAppLogging, globals.css import, and the StrictMode wrapper
- Result is exactly the target state shown above

Threat: pnpm might refuse to remove if the filter name differs.
Confirm package name with: `grep '"name"' apps/desktop/package.json`
It should be `@drive-project-catalog/desktop`.

Threat: other packages in the monorepo might import from @mui. Verify after removal:
```bash
grep -rn "@mui\|@emotion\|@fontsource" \
  /Users/vaneickelen/Desktop/Catalog/packages/ui/src \
  /Users/vaneickelen/Desktop/Catalog/packages/domain/src \
  /Users/vaneickelen/Desktop/Catalog/packages/data/src \
  2>/dev/null || echo "Clean — no MUI in packages/"
```
If any match appears, remove those imports too before verifying the build.
  </action>
  <verify>
    <automated>grep -v '^#' /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/main.tsx | grep -c "@mui\|@emotion\|@fontsource\|ThemeProvider\|CssBaseline\|materialTheme" || true</automated>
  </verify>
  <done>
- Command above returns 0
- apps/desktop/src/app/materialTheme.ts does not exist
- apps/desktop/package.json has no @mui, @emotion, or @fontsource entries
- grep -rn "@mui\|@emotion\|@fontsource" apps/desktop/src returns 0 matches
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove dead Rust dependencies (notify, sha2)</name>
  <files>
    apps/desktop/src-tauri/Cargo.toml
  </files>
  <action>
Edit apps/desktop/src-tauri/Cargo.toml. Remove these four lines from [dependencies]:

```toml
# Volume mount watcher — FSEvents on macOS via the notify crate.
notify = "6.1"
# Archive manifest — SHA-256 hashing for file integrity records.
sha2 = "0.10"
```

Both the comment lines and the dep lines must be deleted.

Then run cargo check to verify the build passes and that Cargo.lock is updated:

```bash
cargo check --manifest-path /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/Cargo.toml
```

Expected outcome: compiles clean. sha2 will remain in Cargo.lock as a transitive dep of
sqlx and wry — this is correct and not a failure condition. Only the direct-dep entry
(drive-project-catalog -> sha2) is gone. notify's entire dep tree will disappear from
Cargo.lock since nothing else depended on it.
  </action>
  <verify>
    <automated>grep -c "^notify\|^sha2" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/Cargo.toml || true</automated>
  </verify>
  <done>
- Command above returns 0 (no direct notify or sha2 entries remain)
- cargo check exits 0
- grep "^notify\|^sha2" Cargo.toml returns no matches
  </done>
</task>

<task type="auto">
  <name>Task 3: Extract IGNORED_SYSTEM_FOLDERS to constants.rs</name>
  <files>
    apps/desktop/src-tauri/src/constants.rs
    apps/desktop/src-tauri/src/lib.rs
    apps/desktop/src-tauri/src/scan_engine.rs
    apps/desktop/src-tauri/src/volume_import.rs
  </files>
  <action>
Step 1 — Create apps/desktop/src-tauri/src/constants.rs with this exact content:

```rust
//! Shared constants used across scan_engine and volume_import.

/// System / recovery folders skipped during both scanning and volume import.
/// Any entry whose name appears here is treated as infrastructure, not a
/// project folder, regardless of drive filesystem or OS.
pub(crate) const IGNORED_SYSTEM_FOLDERS: &[&str] = &[
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

Step 2 — Edit apps/desktop/src-tauri/src/lib.rs. Add `mod constants;` as the first mod
declaration (before mod scan_engine):

```rust
mod constants;
mod scan_engine;
mod volume_import;
mod volume_info;
```

Step 3 — Edit apps/desktop/src-tauri/src/scan_engine.rs:
- Delete lines 48–61: the entire `const IGNORED_SYSTEM_FOLDERS: &[&str] = &[...]` block
- Add the following import line to the use block at the top of the file (after existing use statements):
  `use crate::constants::IGNORED_SYSTEM_FOLDERS;`

Step 4 — Edit apps/desktop/src-tauri/src/volume_import.rs:
- Delete lines 49–65: the doc comment and the entire `const IGNORED_SYSTEM_FOLDERS: &[&str] = &[...]` block
- Add to the use block at the top of the file:
  `use crate::constants::IGNORED_SYSTEM_FOLDERS;`

Step 5 — Run cargo check to verify:

```bash
cargo check --manifest-path /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/Cargo.toml
```

Threat: if either scan_engine.rs or volume_import.rs had a local use that shadowed the
constant (e.g., it was re-declared inside an `impl` block), cargo check will catch it with
a clear error. Verify that all uses of IGNORED_SYSTEM_FOLDERS in both files are bare name
references, not re-declarations.
  </action>
  <verify>
    <automated>grep -c "pub(crate) const IGNORED_SYSTEM_FOLDERS" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/src/constants.rs</automated>
  </verify>
  <done>
- constants.rs exists and contains pub(crate) const IGNORED_SYSTEM_FOLDERS
- grep -rn "const IGNORED_SYSTEM_FOLDERS" src-tauri/src/scan_engine.rs returns 0 (local def removed)
- grep -rn "const IGNORED_SYSTEM_FOLDERS" src-tauri/src/volume_import.rs returns 0 (local def removed)
- grep -c "use crate::constants::IGNORED_SYSTEM_FOLDERS" returns 1 in each of scan_engine.rs and volume_import.rs
- cargo check exits 0
  </done>
</task>

<task type="auto">
  <name>Task 4: Remove ghost-route Rename Review toast from DriveDetailPage</name>
  <files>
    apps/desktop/src/pages/DriveDetailPage.tsx
  </files>
  <action>
Edit apps/desktop/src/pages/DriveDetailPage.tsx. In the import success handler (the `else`
branch starting around line 200), apply these targeted changes:

Remove the cleanupReviewCount ghost-route push (lines 204–206):
```tsx
// DELETE this entire if block:
if (result.cleanupReviewCount > 0) {
  parts.push(`${result.cleanupReviewCount} need cleanup and were sent to Rename Review.`);
}
```

Simplify the setFeedback call (lines 214–218). Replace the ternary-based tone and title
with unconditional success values:
```tsx
// BEFORE:
setFeedback({
  tone: result.cleanupReviewCount > 0 ? "warning" : "success",
  title: result.cleanupReviewCount > 0 ? "Folders imported with cleanup needed" : "Folders imported",
  messages: parts
});

// AFTER:
setFeedback({
  tone: "success",
  title: "Folders imported",
  messages: parts
});
```

Do NOT remove:
- The `buildImportCleanupIssueParts(result)` call and its conditional push (lines 207–210)
- The skippedCount push (lines 211–213)
- The `setFeedback`, `FeedbackNotice`, or `FeedbackState` patterns anywhere in the file
- Any other reference to cleanupReviewCount that is not the push + ternary identified above

After editing, verify no rename-review references remain:

```bash
grep -rn "rename-review\|RenameReview\|Rename Review" \
  /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/ || echo "Clean"
```
  </action>
  <verify>
    <automated>grep -c "were sent to Rename Review\|rename-review\|RenameReview" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/pages/DriveDetailPage.tsx || true</automated>
  </verify>
  <done>
- Command above returns 0
- buildImportCleanupIssueParts call is still present in the file
- setFeedback call uses tone: "success" and title: "Folders imported" (no ternary)
  </done>
</task>

<task type="auto">
  <name>Task 5: Final build verification</name>
  <files></files>
  <action>
Run TypeScript type check first (fast, catches import errors from materialTheme deletion):

```bash
corepack pnpm --filter @drive-project-catalog/desktop exec tsc --noEmit
```

If that passes, run the full Vite build to confirm the bundle ships no MUI chunks:

```bash
corepack pnpm --filter @drive-project-catalog/desktop build 2>&1 | tail -40
```

Inspect build output for any chunk named `@mui`, `@emotion`, or `material`. There should
be none. Expected: only app chunks + vendor chunks from React/Router/Tauri.

Run cargo check one final time to confirm Rust is green across all three task changes
together:

```bash
cargo check --manifest-path /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/Cargo.toml
```

If tsc --noEmit fails with "Cannot find module './app/materialTheme'": materialTheme.ts
deletion did not also remove the import from main.tsx. Re-check Task 1.

If cargo check fails with "unresolved import crate::constants": mod constants; is missing
from lib.rs. Re-check Task 3.
  </action>
  <verify>
    <automated>cargo check --manifest-path /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/Cargo.toml 2>&1 | grep -c "^error" || true</automated>
  </verify>
  <done>
- tsc --noEmit exits 0 with no errors
- pnpm build exits 0 and build output contains no @mui or @emotion chunks
- cargo check exits 0 with no errors
- grep -rn "@mui\|@emotion\|@fontsource" apps/desktop/src returns 0 matches
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| pnpm filter scope | Packages removed must target apps/desktop, not the workspace root |
| Cargo.lock transitive | sha2 staying in Cargo.lock after Cargo.toml removal is expected, not a failure |
| Rust module visibility | pub(crate) in constants.rs, not pub — prevents accidental export |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Tampering | pnpm remove scope | mitigate | Use `--filter @drive-project-catalog/desktop` flag; verify with `grep '"name"' package.json` before running |
| T-01-02 | Denial | cargo check after dep removal | mitigate | Run cargo check immediately after Cargo.toml edit; if it fails, both deps are gone and the failure is in application code using them (not expected) |
| T-01-03 | Information Disclosure | sha2 in Cargo.lock after removal | accept | Expected — sha2 stays as transitive dep of sqlx/wry. Direct dep entry for drive-project-catalog -> sha2 is what gets removed |
| T-01-04 | Tampering | IGNORED_SYSTEM_FOLDERS content drift | mitigate | constants.rs content copied exactly from existing scan_engine.rs lines 48–61 (verified identical in both files by research grep) |
| T-01-05 | Denial | monorepo packages importing MUI | mitigate | Grep packages/ui, packages/domain, packages/data after Task 1; remove any matches before build |
</threat_model>

<verification>
After all five tasks complete, run this sequence from the repo root:

```bash
# 1. No MUI/Emotion/fontsource in frontend source
grep -rn "@mui\|@emotion\|@fontsource" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src
# Expected: no output

# 2. notify and sha2 gone from direct deps
grep "^notify\|^sha2" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/Cargo.toml
# Expected: no output

# 3. IGNORED_SYSTEM_FOLDERS defined in exactly one place
grep -rn "const IGNORED_SYSTEM_FOLDERS" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/src/
# Expected: exactly one match — in constants.rs

# 4. No ghost-route reference
grep -rn "Rename Review\|rename-review\|RenameReview" /Users/vaneickelen/Desktop/Catalog/apps/desktop/src/
# Expected: no output

# 5. TypeScript compiles
corepack pnpm --filter @drive-project-catalog/desktop exec tsc --noEmit
# Expected: exit 0

# 6. Rust compiles
cargo check --manifest-path /Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/Cargo.toml
# Expected: exit 0
```
</verification>

<success_criteria>
Phase 1 is complete when ALL of the following are true:

1. `grep -rn "@mui\|@emotion\|@fontsource" apps/desktop/src` returns no matches
2. `grep "^notify\|^sha2" apps/desktop/src-tauri/Cargo.toml` returns no matches
3. `grep -rn "const IGNORED_SYSTEM_FOLDERS" apps/desktop/src-tauri/src/` returns exactly one match (constants.rs)
4. `grep -rn "Rename Review\|rename-review" apps/desktop/src/` returns no matches
5. `corepack pnpm --filter @drive-project-catalog/desktop exec tsc --noEmit` exits 0
6. `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` exits 0
7. `apps/desktop/src/app/materialTheme.ts` does not exist
</success_criteria>

<output>
After completion, create `.planning/phases/01-strip-dead-weight/01-01-SUMMARY.md` with:
- What was removed (packages, files, Rust deps)
- What was extracted (constants.rs)
- What was fixed (DriveDetailPage toast)
- Final verification command results (copy the grep outputs)
- Any pitfalls encountered
</output>
