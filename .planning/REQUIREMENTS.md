# Requirements: Catalog

**Defined:** 2026-05-02
**Core Value:** Every piece of data shown is correct — no confusing states, no placeholders, no misleading numbers

## v1 Requirements

### Foundation

- [ ] **FOUND-01**: MUI ThemeProvider, CssBaseline, and Roboto font removed from runtime bundle (~350KB savings)
- [ ] **FOUND-02**: Mutations apply optimistic local state update before IPC round-trip completes, with automatic rollback on error
- [ ] **FOUND-03**: Unused Rust dependencies (notify, sha2) removed from Cargo.toml
- [ ] **FOUND-04**: IGNORED_SYSTEM_FOLDERS constant deduplicated into a shared Rust module (no copy-paste between scan_engine.rs and volume_import.rs)

### Accuracy

- [ ] **ACCU-01**: CapacityBar shows an honest "unknown" state instead of a fake 28% fill when usedBytes or totalBytes is null
- [ ] **ACCU-02**: "No import task has run yet" message is not shown when drives or projects already exist in the catalog
- [ ] **ACCU-03**: Rename Review success/warning toast removed from DriveDetailPage import flow (route does not exist)
- [ ] **ACCU-04**: SQLite scan sessions pruned after successful ingestion (deleteScanSession + CASCADE on scan_session_projects)

### macOS Polish

- [ ] **MAC-01**: Window sidebar displays native vibrancy effect (window-vibrancy crate, Sidebar material, macOS only)
- [ ] **MAC-02**: Window uses overlay titlebar with correctly positioned traffic light buttons (no content obscured)
- [ ] **MAC-03**: Tailwind Preflight gaps addressed after MUI/CssBaseline removal (subpixel smoothing, body background, box-sizing baseline)

### Catalog UX

- [ ] **UX-01**: Project list filters client-side as user types in the search field — no database round-trip, no debounce lag
- [ ] **UX-02**: Every loading, empty, and error state has a specific, accurate label — no generic spinners or contradictory messages
- [ ] **UX-03**: Project detail page displays accurate size, file path, and last scan date — no stale or placeholder data
- [ ] **UX-04**: Project detail page has an "Open in Finder" button that opens the project folder directly

### Code Health

- [ ] **CODE-01**: DrivesPage.tsx (760 lines) split — import flow extracted to useImportFromVolume hook, drive create form to DriveCreateForm component
- [ ] **CODE-02**: DriveDetailPage.tsx (723 lines) split — scan section and import section extracted to focused sub-components

## v2 Requirements

### macOS Polish

- **MAC-V2-01**: system-ui font stack replacing Inter variable font (SF Pro on macOS natively, zero font loading overhead)
- **MAC-V2-02**: Vibrancy on main content area (not just sidebar) when macOS supports it

### Code Health

- **CODE-V2-01**: pagePrimitives.tsx (796 lines) split into search.tsx, feedback.tsx, capacity.tsx
- **CODE-V2-02**: AppScanState sessions map pruned with TTL eviction (memory leak, low severity for typical use)

### Features

- **FEAT-V2-01**: Rename Review flow — dedicated page for identifying and cleaning non-standard folder names
- **FEAT-V2-02**: Supabase remote sync (adapter exists, not needed for personal use)
- **FEAT-V2-03**: Keyboard navigation (⌘K command palette, j/k list navigation)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Drive management as primary flow | Secondary to project catalog for daily use |
| Rename Review full implementation | No page exists, not a daily-driver need, needs design work |
| Signed .app distribution | Dev build (corepack pnpm dev) is the workflow |
| Cross-platform support | macOS only by design |
| OAuth / accounts | Local SQLite, no cloud required |
| Real-time multi-device sync | Out of scope for personal tool |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 2 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Pending |
| ACCU-01 | Phase 2 | Pending |
| ACCU-02 | Phase 2 | Pending |
| ACCU-03 | Phase 1 | Pending |
| ACCU-04 | Phase 2 | Pending |
| MAC-01 | Phase 3 | Pending |
| MAC-02 | Phase 3 | Pending |
| MAC-03 | Phase 1 | Pending |
| UX-01 | Phase 3 | Pending |
| UX-02 | Phase 2 | Pending |
| UX-03 | Phase 3 | Pending |
| UX-04 | Phase 3 | Pending |
| CODE-01 | Phase 2 | Pending |
| CODE-02 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-02*
*Last updated: 2026-05-02 after initial definition*
