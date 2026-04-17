# Drive Project Catalog — Architecture

## 1. High-Level Architecture

The system is a **macOS desktop app** — a single client surface that owns the full catalog workflow, including drive scanning. Future companion surfaces (read-only mobile, browser-based viewers, etc.) are not on the current scope; the architecture preserves a clean local-first / sync boundary so they remain possible without blocking the macOS-first build.

---

## 2. Architectural Layers

### A. Scan Engine (desktop-only)
Implemented in Rust via Tauri commands.

Responsibilities:
- enumerate folders
- apply depth rules
- ignore hidden/system folders
- parse valid folder names
- emit scan results
- schedule size calculation
- support cancellation

### B. Domain Layer
Shared business rules for:
- project display values
- move state
- duplicate state
- missing state
- drive space calculations
- reserved incoming capacity
- status derivation

This should be represented with shared TypeScript types on the frontend and equivalent Rust/domain structs as needed.

### C. Local Persistence Layer
Offline-first storage used by the desktop app.

Responsibilities:
- store projects
- store drives
- store scans
- queue sync operations
- resolve local reads fast

Three backends implement the `LocalPersistenceAdapter` contract: SQLite (desktop production), Storage-localStorage (fallback / non-Tauri runtime), and InMemory (tests). The contract test in `packages/data/src/localPersistenceContract.ts` locks them to identical behavior so the adapter layer stays swappable without coupling the UI to a specific backend.

### D. Sync Layer
A sync-ready adapter around local data and cloud data.

Responsibilities:
- persist local changes
- push changes when online
- pull remote changes
- resolve simple single-user conflicts conservatively

### E. UI Layer
React + TypeScript + Tailwind UI.

Responsibilities:
- dashboard
- projects
- drives
- forms
- move workflow
- search
- scan progress

---

## 3. Monorepo Shape

- `apps/desktop` — Tauri app (React frontend + Rust scan engine)
- `packages/ui` — shared UI components
- `packages/domain` — types, status logic, helpers
- `packages/data` — repositories, adapters, sync interface

---

## 4. Desktop Scan Flow

1. User chooses drive to scan
2. UI calls Tauri command
3. Rust scan engine traverses directories with depth limit
4. Matching folder names are parsed into project candidates
5. Candidate projects are written into local persistence
6. Background size calculation jobs run
7. UI updates progress and results
8. Sync layer later propagates changes to cloud

---

## 5. Data Strategy

### Operational truth
The operational truth for planning and organization is the catalog database.

### Filesystem truth
Filesystem state is only imported when scanned. It does not automatically overwrite all app state.

Examples:
- user corrections remain intact
- move plans remain intact until explicitly changed
- missing projects remain recorded

---

## 6. Offline-First Strategy

The system should be designed so the user can:
- browse data offline
- edit metadata offline
- create manual projects offline
- create manual drives offline
- plan moves offline

Then sync later when online.

For MVP, there is no authentication requirement, but the persistence boundary should not make future sync impossible.

---

## 7. Reserved Space Logic

Drive capacity UI should include:
- total capacity
- used bytes
- free bytes
- reserved incoming bytes

Reserved incoming bytes:
- sum of move-pending project sizes targeting the drive

If a project size is unknown:
- allow assignment
- mark unknown impact visibly

---

## 8. Future-Ready Extension Points

The architecture should leave room for:
- thumbnails
- notes and attachments
- drive categories
- team collaboration
- authentication
- better sync conflict handling
- future companion surfaces (read-only mobile, browser-based viewers) if product direction reopens them
