# Feature Landscape: macOS Project Catalog (Personal Daily Driver)

**Domain:** macOS native app for cataloging creative/developer projects across external drives
**Researched:** 2026-05-02
**Reference apps:** Finder, Forklift 4, HoudahSpot 6, Alfred, Raycast, LaunchBar, Quick Look
**Confidence:** HIGH (synthesized from current product reviews + UX research + existing PROJECT.md context)

---

## Framing: What "Daily Driver" Demands

A daily driver is judged on three things, in this order:

1. **Trust** — every number/path/state shown is correct. One lie = user stops believing the rest.
2. **Speed of access** — open app, find thing, act on it. Sub-second perceived latency from launch to result.
3. **Friction-free repetition** — the workflow you do 50x/day must not require a mouse, a confirmation dialog, or a context switch.

Catalog already names trust as Core Value (PROJECT.md line 9). The features below are filtered through that lens — anything that risks misleading the user is downgraded or rejected.

---

## Table Stakes

Missing these = product feels broken or like a toy. User abandons within a week.

### Search & Find

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Instant substring search across project names | Baseline expectation set by Spotlight/Alfred/Raycast — typing must show results within ~50ms perceived | Low | Already partially present. Must filter the in-memory project list, not re-query SQLite per keystroke. |
| Search-as-you-type with no submit step | Modal "press enter to search" feels archaic for a launcher-class tool | Low | URL state `?q=` already exists per ARCHITECTURE.md |
| Cancel stale in-flight queries | If "app" response arrives after "appl" was typed, never overwrite the newer result | Low | Race-condition protection — sequence number or AbortController pattern |
| Keyboard-first navigation of results (↑/↓/Enter) | Power users never reach for the mouse during search | Low | Standard list semantics |
| Empty-search state shows recent / pinned projects | Empty white box is hostile; recents are the most common access pattern | Low | Mirror Raycast's empty-search behaviour |
| Visible "X of Y projects" count | Trust signal — confirms search is matching the universe user expects | Low | Single line of UI |
| Clear-search affordance (⌘K, Esc, click X) | Standard pattern; Esc must always return to the unfiltered catalog | Low | — |

### Data Accuracy & State Honesty

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Distinguish unknown / loading / stale / current explicitly | Core Value of project. CapacityBar showing "28%" placeholder is the canonical example of breaking trust | Low | UI primitive: never render a number derived from `??` fallback |
| Show "—" for unknown values, never a fake number | Em-dash is the universal honest-unknown symbol on macOS | Low | Cheap, high-trust |
| Last-scanned timestamp on every project + drive | Lets user judge whether the size/path data is fresh enough to act on | Low | Already in schema (ScanRecord) |
| Scan progress visible while running | Polling already exists every 900ms; UI must surface it without modal | Low | Inline indicator on the scanned drive row |
| Graceful "drive not connected" state on project detail | External drives unmount constantly. Showing a path with no badge = false confidence | Low | Check volume mount status on detail-page render |
| Boot does not block on missing drives | App must open and show last-known catalog instantly even with everything unplugged | Medium | Already roughly true; verify no startup IPC waits on diskutil |

### Project Detail (table-stakes metadata)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Full canonical path (copyable) | First thing every user does is "where is this actually" | Low | ⌘C should copy path |
| Drive name + connected status badge | Resolves "is this thing reachable right now?" instantly | Low | — |
| Total size + file count | Standard Finder Get Info expectation | Low | Already scanned |
| Date last modified + date imported | Distinguishes archived vs active projects | Low | Already in schema |
| Reveal in Finder button | Universal escape hatch. Single most-used action in Forklift/Path Finder | Low | Tauri `opener` plugin already a dep |
| Open in Terminal | Developer table-stakes alongside Reveal in Finder | Low | `open -a Terminal <path>` via Rust IPC |

### Navigation & Chrome

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Sidebar with Projects + Drives as primary destinations | macOS Finder/Mail/Notes mental model; Catalog already has this | Low | Existing |
| Breadcrumb / path bar on detail pages | Standard wayfinding; ⌥⌘P parity in Finder | Low | — |
| ⌘1/⌘2 to switch between Projects / Drives | LaunchBar, Mail, Finder all use this — muscle memory | Low | — |
| ⌘F to focus search from anywhere | Universal expectation. Equally critical: ⌘L to focus the address/path bar parity | Low | — |
| ⌘, opens Settings (even if minimal) | macOS HIG mandates this | Low | — |
| Native macOS window chrome (traffic lights, vibrancy where appropriate) | Catches the eye instantly when app feels "Electron-y" | Medium | Tauri 2 supports; needs deliberate styling |
| Quick Look (Spacebar) on selected project | Most-loved Finder feature; spacebar = preview is muscle memory across the OS | Medium | Surface README, screenshots, or a generated card |

### Behavioural Reliability

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| App opens to last-viewed page / scroll position | Daily-driver expectation set by Mail, Notes, Xcode | Low | Persist `lastRoute` + scroll offset |
| No data loss on crash (WAL already set) | SQLite WAL gives this for free — verify under kill -9 | Low | Already configured |
| Search/filter state survives navigation away and back | Going into a detail view and hitting Back must restore the exact list state | Low | URL params already cover this |
| No "white flash" on navigation | Tahoe/dark mode appearance must be set on the HTML root before React mounts | Low | Pre-paint background colour |

---

## Differentiators

These are what make a personal daily driver loved, not just tolerated. Pick 2–3 per milestone; do not chase all at once.

### Search That Feels Magical

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Fuzzy match with character-skip ("rcmnd" → "recommendation-engine") | Power users type abbreviations. Raycast/Alfred set this expectation | Medium | Use `fuse.js` or a Rust-side fuzzy crate (e.g. `nucleo` — battle-tested, used by Helix editor) |
| Highlighted match characters in results | Visible explanation of *why* a result matched — directly addresses the "trust ranking" UX problem | Low | Render once fuzzy library returns match indices |
| Multi-token AND search ("client acme 2024") | Lets user narrow without leaving keyboard | Low | Tokenise on whitespace, AND across project name + drive + path |
| Scoped filter chips (Drive: Samsung T7, Type: Client) | HoudahSpot's killer feature — multi-criteria narrowing | Medium | Filters already in URL params; needs visible chip UI |
| Recently opened + frequently opened sections in empty state | Raycast pattern; surfaces 80% of access without typing | Low | Track `openedAt` per project |
| Pinned/favourite projects | The 5 projects you touch every day deserve a top-of-list slot | Low | Boolean column + sidebar section |

### Project Detail That Earns Its Page

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| README rendering inline (Markdown) | Developer projects all have one; reading it is the reason you opened the detail page | Medium | `react-markdown` + GFM plugin |
| Detected technology badges (Node, Rust, Swift, Figma file present) | "What kind of project is this" answered at a glance — stronger signal than folder name | Medium | Heuristic from manifest files: `package.json`, `Cargo.toml`, `.xcodeproj`, `.fig` |
| Git status if `.git` present (branch, dirty/clean, last commit date) | Tells you "did I leave this in a mess" without opening the project | Medium | Shell-out to `git` via Rust; cache aggressively |
| Inline thumbnail/preview strip (first N image files, screenshots/, etc.) | Creative projects identified visually faster than by name | Medium | Tauri can serve local files via custom protocol; lazy-load |
| Notes field per project (free text, persisted) | "What was I doing on this" memory aid; no other catalog tool does this well | Low | Single TEXT column |
| Tags / labels (user-defined, multi-select filter) | Spans the gap between rigid folder-type classification and free-form notes | Medium | Junction table; chip UI |
| Custom URL/link list per project (Linear ticket, Figma, deployed URL) | Centralises external context — kills the "where is the Notion page for this" hunt | Low | JSON column or simple side table |

### Speed & Polish

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Optimistic mutations (already in PROJECT.md as Active) | Sub-100ms perceived feedback on every write; full reload is the current bottleneck | Medium | `useOptimisticMutation` hook already drafted per PROJECT.md context |
| Incremental scan (don't re-scan unchanged folders) | Re-scanning a 4TB drive every time is the #1 complaint pattern in file-manager reviews | High | Compare folder mtime against `lastScannedAt`; skip subtree if unchanged |
| Background scan with native notification on completion | macOS notification + Dock badge = "I can ignore this until done" | Medium | `tauri-plugin-notification` already declared |
| Vibrancy/translucent sidebar matching Finder/Mail | Single biggest "this is a real Mac app" signal | Medium | Tauri 2 + CSS `-webkit-backdrop-filter` or native vibrancy |
| Spotlight-style global hotkey to open Catalog | Daily driver = ⌘⇧Space anywhere → search → enter → reveal in Finder | Medium | `tauri-plugin-global-shortcut` |
| Quick Look generator extension (.qlgenerator) | Lets Finder show project-card previews. Aspirational; high effort | High | Defer — only after core flow rock solid |

### Cross-Drive Intelligence

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "Where is this project?" — surface duplicates across drives | Common backup/migration pain; current scanners ignore it | Medium | Match by folder name + size signature |
| "Find by content/file present" (e.g. "projects with a .sketch file") | Bridges into HoudahSpot territory without competing | Medium | Index file extensions per project during scan |
| Drive health summary (free space trend, last connected) | Not a feature any competitor does well for project-bearing externals | Medium | Light timeline chart on DrivesPage |

---

## Anti-Features (Deliberately NOT for v1)

Each of these is a real temptation that competitor tools have shipped. Each is rejected with reason.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Dual-pane file manager view** | Forklift's whole product. Catalog is not a file manager — it's a finder of projects. Building this dilutes the value prop and competes with a $19 lifetime tool that already wins | Single focused list + detail. Reveal in Finder for any actual file ops |
| **File operations (move/copy/rename/delete)** | Already explicitly Out of Scope in PROJECT.md. The Rust read-only invariant (`#![deny(clippy::disallowed_methods)]`) is a load-bearing trust property | Keep filesystem strictly read-only. Reveal in Finder is the escape hatch |
| **Cloud sync / multi-device** | Out of Scope per PROJECT.md. Adds auth, conflict resolution, secret handling — none serve "find my project on the T7 drive" | Local SQLite only. Sync adapter exists but stays disabled |
| **FTP / SFTP / S3 / remote protocols** | Forklift territory. No daily-driver value for personal project catalog | Out of scope |
| **Spotlight-style global system search** | Competing with Apple at OS level is a losing fight. Raycast already won this category | App-scoped search only. Optional global hotkey just opens Catalog |
| **Heavy filtering UI with 200 attributes (HoudahSpot model)** | Right tool for lawyers/researchers, wrong for personal use. Cognitive overhead too high for daily flow | 3–5 filter chips max: Drive, Type, Tag, Connected/Disconnected |
| **Workflows / automations / scripting / extensions** | Alfred and Raycast own this. Every hour spent on extensibility is an hour not spent on the core "find project" loop | Defer indefinitely |
| **Dashboard with charts / "insights"** | Every catalog tool that ships this finds users ignore it. Not aligned with daily-driver intent | Drives page already gives the only chart that matters: free space |
| **Manual rename review / smart-rename engine in UI** | PROJECT.md flags Rename Review as Out of Scope. Domain has the engine; do not surface in v1 | Engine stays in `packages/domain` for future use, no route, no toast referencing it |
| **Multi-window / multi-tab browsing** | Forklift's "tabs in a pane" is great for file management, irrelevant for catalog browsing | Single window. ⌘N opens a new window only if it ever earns its keep |
| **Tagging that mirrors macOS Finder coloured tags** | Two systems for the same job confuses users. macOS tags are not portable across external drives anyway | Catalog-internal tags only, clearly app-scoped |
| **Auto-categorisation by ML / "smart" classification** | Existing `classifyFolderName` is rules-based and predictable. ML adds magic that breaks Core Value (trust) | Keep rules-based classifier. User can override with manual type/tag |
| **Onboarding wizard / tutorial / tooltips on first run** | Daily-driver tools earn trust by being immediately usable, not by lecturing | Empty state prompts ("Scan a drive to begin") with one obvious action |
| **In-app settings sprawl** | Every additional toggle is a maintenance + trust liability | One Settings pane: appearance, default scan options, log location |

---

## Feature Dependencies

```
Optimistic mutations          → required before any new write surface ships
                                (otherwise every new feature inherits the
                                 full-reload performance bug)

Honest-unknown UI primitive   → required before Project Detail enrichment
                                (size, git status, tech badges, etc. all
                                 need a shared "—" rendering rule)

Recently/Frequently opened    → requires `openedAt` column + open-tracking
                                hook
                                ↓
Empty-search recents          → consumes `openedAt`

Pinned projects               → independent (boolean column)
                                ↓
Sidebar pinned section        → consumes pinned flag

Tags                          → junction table
                                ↓
Tag filter chips              → consumes tags
                                ↓
Tag-scoped search             → consumes tags + search

README rendering              → requires file-read IPC (read-only, scoped to
                                project root)
                                ↓
Tech badges / git status      → reuse same scoped-read IPC

Incremental scan              → requires per-folder mtime tracking in scan
                                schema
                                ↓
Background + notification     → consumes incremental scan (otherwise UX
                                punishes the user for letting it run)

Quick Look (Spacebar)         → requires either README rendering OR
                                thumbnail strip first; Quick Look is the
                                surface, not the source
```

---

## Recommended Build Order (suggested phases — roadmap will refine)

**Phase A — Trust foundation (table-stakes correctness)**
- Honest-unknown UI primitive (kills the "28%" bug class)
- Optimistic mutations (PROJECT.md Active item)
- Drive-connected status on project detail
- Last-scanned timestamps surfaced everywhere data is shown
- Em-dash for all unknown values

**Phase B — Daily-driver search loop**
- Fuzzy matching with highlighted characters
- Empty-search recents + pinned section
- Multi-token AND search
- Visible filter chips for Drive / Type / Connected
- ⌘F focus, ⌘1/⌘2 navigation, Esc clear

**Phase C — Project detail that earns its page**
- Full path + Reveal in Finder + Open in Terminal
- README rendering (Markdown)
- Tech badges from manifest detection
- Notes field + tags
- Quick Look (Spacebar) wired to a project-card preview

**Phase D — Speed polish**
- Incremental scan
- Background scan + native notification
- Vibrancy sidebar / native chrome polish
- Global hotkey

**Phase E — Cross-drive intelligence (only after A–D feel rock solid)**
- Duplicate detection across drives
- Find-by-file-present queries
- Drive health timeline

---

## Minimum Lovable v1

If only one phase ships: **Phase A + Phase B**. That delivers a tool the user trusts and can find anything in instantly. Everything else is upside.

---

## Sources

- [HoudahSpot 6 — advanced file search for macOS](https://www.houdahspot.com/powerful-mac-file-search.html)
- [HoudahSpot 5 review — MacStories](https://www.macstories.net/news/houdahspot-5-review-advanced-file-search-and-filtering-on-the-mac/)
- [HoudahSpot vs Alfred vs DEVONsphere vs Foxtrot — MPU Talk](https://talk.macpowerusers.com/t/houdahspot-vs-alfred-search-vs-devonsphere-vs-foxtrot/35344)
- [Spotlight alternatives curated list (GitHub)](https://github.com/thoddnn/spotlight-alternatives)
- [Best Mac file search apps 2026 — FileMinutes](https://www.fileminutes.com/blog/best-file-search-apps-for-macos/)
- [Forklift 4 — official feature list (BinaryNights)](https://binarynights.com/)
- [5 ways Forklift is the perfect Finder replacement (XDA)](https://www.xda-developers.com/ways-forklift-perfect-finder-replacement-mac/)
- [Forklift 4 review — OWC blog](https://eshop.macsales.com/blog/86687-forklift-4-does-it-fix-the-finder/)
- [Raycast file search extension](https://www.raycast.com/core-features/file-search)
- [Raycast v1.18 — improved file search changelog](https://www.raycast.com/changelog/1-18-0)
- [Raycast for Designers — Hack Design](https://www.hackdesign.org/toolkit/raycast/)
- [Mac Finder keyboard shortcuts — Apple Support](https://support.apple.com/en-us/102650)
- [Quick Look — Wikipedia](https://en.wikipedia.org/wiki/Quick_Look)
- [Use Quick Look instead of Preview — MacMost](https://macmost.com/use-quick-look-instead-of-preview-to-view-files.html)
- [In-app search UX that feels instant — Koder.ai](https://koder.ai/blog/instant-in-app-search-ux)
- [Search UX best practices — Pencil & Paper](https://www.pencilandpaper.io/articles/search-ux)
- [Empty State UX best practices — Pencil & Paper](https://www.pencilandpaper.io/articles/empty-states)
