# Phase 1: Strip Dead Weight — Pattern Map

**Mapped:** 2026-05-02
**Files analyzed:** 5 change targets
**Analogs found:** 5 / 5

---

## File Classification

| Change Target | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/desktop/src/main.tsx` (MUI removal) | entry-point | request-response | itself (current state) | exact |
| `apps/desktop/package.json` (MUI deps removal) | config | — | itself | exact |
| `apps/desktop/src-tauri/Cargo.toml` (dep removal) | config | — | itself | exact |
| `apps/desktop/src/styles/globals.css` (CSS resets) | styles | — | itself (lines 232–269) | exact |
| `apps/desktop/src-tauri/src/lib.rs` (add `mod constants;`) | Rust module registry | — | itself (lines 1–3) | exact |
| `apps/desktop/src-tauri/src/constants.rs` (new file) | Rust constants module | — | `scan_engine.rs` lines 48–61 | role-match |
| `apps/desktop/src/pages/DriveDetailPage.tsx` (toast removal) | page component | request-response | itself (lines 200–219) | exact |

---

## Pattern Assignments

### 1. `apps/desktop/src/main.tsx` — Remove MUI

**What to remove** (lines 3, 6–10, 17–19 and the wrapping JSX):

```tsx
// DELETE these imports:
import { CssBaseline, ThemeProvider } from "@mui/material";
import { materialTheme } from "./app/materialTheme";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

// DELETE these wrapper components from the render tree:
<ThemeProvider theme={materialTheme}>
  <CssBaseline />
  ...
</ThemeProvider>
```

**Target state** after removal — keep only:

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

**Note:** The file currently imports `./styles/globals.css` at line 11 — this import already exists and must be preserved. The `@fontsource-variable/inter` package listed in `package.json` devDependencies is also present but NOT imported in main.tsx; leave it for now unless a separate cleanup task covers it.

---

### 2. `apps/desktop/package.json` — Remove MUI npm packages

**File:** `/Users/vaneickelen/Desktop/Catalog/apps/desktop/package.json`

**Packages to remove from `dependencies`** (lines 20–22):

```json
"@emotion/react": "^11.14.0",
"@emotion/styled": "^11.14.1",
"@mui/material": "^9.0.0",
```

**Also remove** (line 10, in dependencies):

```json
"@fontsource/roboto": "^5.2.10",
```

**Command to run after editing:**

```bash
corepack pnpm --filter @drive-project-catalog/desktop install
```

---

### 3. `apps/desktop/src-tauri/Cargo.toml` — Remove unused Rust deps

**File:** `/Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/Cargo.toml`

**Lines to delete** (lines 22–25):

```toml
# Volume mount watcher — FSEvents on macOS via the notify crate.
notify = "6.1"
# Archive manifest — SHA-256 hashing for file integrity records.
sha2 = "0.10"
```

Both crates are listed in `[dependencies]` but have no `use` statements in any `.rs` file in `src-tauri/src/`. Safe to drop.

---

### 4. `apps/desktop/src/styles/globals.css` — Add CSS resets

**File:** `/Users/vaneickelen/Desktop/Catalog/apps/desktop/src/styles/globals.css`

**What CssBaseline provided that Tailwind Preflight does NOT cover:**

| Reset | CssBaseline source | Preflight gap |
|---|---|---|
| `-webkit-font-smoothing: antialiased` | MUI baseline | Preflight omits this |
| `-moz-osx-font-smoothing: grayscale` | MUI baseline | Preflight omits this |
| `background-color` on `body` | MUI baseline | Preflight resets to transparent |
| `box-sizing: border-box` on `*` | Preflight covers this | Already present line 267 |

**Analysis of existing globals.css:**

- Lines 233–239: `html` rule already sets `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale`. These are already present and correct.
- Lines 241–256: `body` rule already sets `background: var(--canvas)` and `color: var(--ink)`. These are already present and correct.
- Lines 267–269: `* { box-sizing: border-box; }` already present.

**Conclusion:** The existing `globals.css` already covers all gaps that CssBaseline was filling. No new CSS rules are needed. Removing MUI/CssBaseline leaves no functional hole in the reset layer.

**Analog for the existing pattern** (lines 232–269 of `globals.css`):

```css
/* ── Base ── */
html {
  font-family: var(--font-sans);
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;       /* covers CssBaseline gap */
  -moz-osx-font-smoothing: grayscale;        /* covers CssBaseline gap */
  font-feature-settings: "cv11", "ss01", "calt", "kern";
}

body {
  margin: 0;
  background: var(--canvas);                 /* covers CssBaseline gap */
  color: var(--ink);
  /* ... */
}

* {
  box-sizing: border-box;                    /* Preflight also sets this */
}
```

No edits needed to this file.

---

### 5. New file: `apps/desktop/src-tauri/src/constants.rs`

**Analog:** `apps/desktop/src-tauri/src/scan_engine.rs` lines 48–61

The `IGNORED_SYSTEM_FOLDERS` slice is defined identically in both `scan_engine.rs` (lines 48–61) and `volume_import.rs` (lines 52–65). The `volume_import.rs` comment at line 32 already acknowledges this duplication: "Kept in lock-step with `scan_engine.rs::IGNORED_SYSTEM_FOLDERS`."

**New file content to create:**

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

**Visibility:** `pub(crate)` — only `scan_engine` and `volume_import` consume it. No need for `pub`.

---

### 6. `apps/desktop/src-tauri/src/lib.rs` — Register `mod constants;`

**File:** `/Users/vaneickelen/Desktop/Catalog/apps/desktop/src-tauri/src/lib.rs`

**Existing module declaration pattern** (lines 1–3):

```rust
mod scan_engine;
mod volume_import;
mod volume_info;
```

**Add one line** at the top of that block:

```rust
mod constants;
mod scan_engine;
mod volume_import;
mod volume_info;
```

No `use` needed in `lib.rs` itself — `scan_engine` and `volume_import` will reference it as `crate::constants::IGNORED_SYSTEM_FOLDERS`.

---

### 7. `apps/desktop/src-tauri/src/scan_engine.rs` — Use shared constant

**What to remove** (lines 48–61):

```rust
const IGNORED_SYSTEM_FOLDERS: &[&str] = &[
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

**What to add** (after the `use` block, before `const MAX_SCAN_DEPTH`):

```rust
use crate::constants::IGNORED_SYSTEM_FOLDERS;
```

No other call sites change — `IGNORED_SYSTEM_FOLDERS` is used by name and the type is identical.

---

### 8. `apps/desktop/src-tauri/src/volume_import.rs` — Use shared constant

**What to remove** (lines 49–65 — the comment block and the const):

```rust
/// System / recovery folders skipped across every OS. Kept in lock-step with
/// `scan_engine.rs::IGNORED_SYSTEM_FOLDERS` so the scan and import paths agree
/// on what counts as "not a project folder."
const IGNORED_SYSTEM_FOLDERS: &[&str] = &[
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

**What to add** (to the existing `use` block at line 47):

```rust
use crate::constants::IGNORED_SYSTEM_FOLDERS;
```

---

### 9. `apps/desktop/src/pages/DriveDetailPage.tsx` — Remove Rename Review toast text

**What to remove** (lines 204–206 and their containing condition):

```tsx
if (result.cleanupReviewCount > 0) {
  parts.push(`${result.cleanupReviewCount} need cleanup and were sent to Rename Review.`);
}
```

**The condition at lines 215–216 also references `cleanupReviewCount`:**

```tsx
tone: result.cleanupReviewCount > 0 ? "warning" : "success",
title: result.cleanupReviewCount > 0 ? "Folders imported with cleanup needed" : "Folders imported",
```

These ternaries should collapse to the non-Rename-Review branch:

```tsx
tone: "success",
title: "Folders imported",
```

**Pattern analog** — the FeedbackState/setFeedback pattern used throughout the file (established at lines 62, 143, 165, 214–218) stays unchanged. Only the content of one `setFeedback` call changes.

**Also check:** `buildImportCleanupIssueParts` (called at line 207) — grep shows it is a local helper. Verify it does not itself reference `cleanupReviewCount` before removing the guarded push. The issue-parts logic (lines 207–210) is independent and should be retained.

---

## Shared Patterns

### FeedbackNotice / setFeedback (cross-cutting across DriveDetailPage)

**Source:** `apps/desktop/src/pages/DriveDetailPage.tsx` lines 62, 143, 165, 214
**Apply to:** The toast removal in task 9 above — do not change the shape of `FeedbackState`, only the content of one call.

```tsx
// Pattern — all feedback calls follow this shape:
setFeedback({
  tone: "success" | "warning" | "error" | "info",
  title: "Human-readable title",
  messages: ["One or more message strings"]
});
```

### Rust module visibility (`pub(crate)` for internal sharing)

**Source:** Rust coding-style rules + existing `lib.rs` pattern
**Apply to:** `constants.rs` new file — use `pub(crate)` not `pub`.

---

## No Analog Found

None. All five changes have direct analogs or are pure deletions from existing files.

---

## Metadata

**Analog search scope:** `apps/desktop/src/`, `apps/desktop/src-tauri/src/`, `apps/desktop/package.json`, `apps/desktop/src-tauri/Cargo.toml`
**Files read:** 9
**Pattern extraction date:** 2026-05-02
