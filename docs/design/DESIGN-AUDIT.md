# Design audit — Drive Project Catalog

Date: 2026-04-19
Scope: desktop app (`apps/desktop`) after the "Things-3 2026 refresh" pass.
Verdict: the tokens are fine, the shell is wrong, and every page pays the price.

## Primary user job

> "Where is project X? Which drive is it on?"

This app is a **creator's archive index**, not a to-do app. Modelling the landing on Things-3's "Inbox" is a fundamental mismatch: nothing *flows in*. The user wants to *find*.

Everything below is graded against that job.

---

## Shell-level issues (appear on every page)

### 1. Brand identity is wrong
`packages/ui/src/SidebarNav.tsx:30-45` — the sidebar literally says **"Index"** under a red square logo. The app is called **Drive Project Catalog**. There is no "Index" brand anywhere else in the product. The logo doubles as the favicon, so the mistake propagates.

**Fix:** replace with `Drive Catalog` (two-word, compact). Keep the monogram but drop the red fill — the whole app is already drowning in red accent (see #6).

### 2. Duplicated search
- `SidebarNav.tsx:55-105` — sidebar has a full-width search field with a "⌘K" hint.
- `pagePrimitives.tsx:SearchField` — every data page (Projects, Drives) also renders an inline page-level search with its own `/` shortcut.

Two searches = one user, two mental models, one uncertainty about which one is authoritative. Also eats ~70 px of horizontal space on every page.

**Fix:** one global omnibox in the top bar. Remove the sidebar search and the page-level SearchField. The page still exposes *filters*, not another search.

### 3. Fake macOS traffic lights
`packages/ui/src/TopUtilityBar.tsx:15-25` — three decorative divs coloured `#ff5f57 / #febc2e / #28c840`. They don't close/minimize/zoom. They just sit there.

Tauri already draws the real native controls in its own title bar. These are cargo-culted visual noise.

**Fix:** delete. Keep the drag region but nothing else purely decorative.

### 4. Duplicated page title
`TopUtilityBar.tsx:28-35` renders an absolutely-centered uppercase tracked-out `<h2>` ("SETTINGS", "INBOX"…). Every page then renders its own `<h1>` below. Two titles, same word, zero new information.

**Fix:** the top bar shows **breadcrumb + context** (route path → current section), not a mirror of the H1. For detail routes (`/projects/:id`) it can hold the project name as a small, truncatable label.

### 5. Broken active state on /settings
`apps/desktop/src/app/RootLayout.tsx:navItems` — Settings lives in `footerNavItems` but on `/settings` the **Drives** item in the main nav stays highlighted (see screenshot: Drives is pink/underlined while we're on Settings).

The NavLink `to` matching logic is fine; the issue is that Drives was the last-clicked and its hover/active treatment is sticky somewhere.

**Fix:** verify NavLink `end` matching, and make sure no `aria-current`/class carryover from route to route. Also: give the Settings footer item proper `NavLink` treatment identical to the main items.

### 6. Red-accent overload
Every primary CTA (`+ New project`, `Scan connected drive`, `Sync now`), the brand monogram, and the active-nav highlight are all the same tomato red `#d1453b`. There's no way to tell the eye where to go, and red reads as *warning* — then we use a separate warning color for actual warnings, which is only ever-so-slightly different. Result: red everywhere + everything screams at the same volume.

**Fix:**
- Brand mark: ink (near-black), not accent.
- Active nav: ink + left 2px rail, not full fill.
- Primary CTA: keep accent, but there should only ever be **one** primary per viewport.
- Warnings: move to amber, separate from red.

### 7. Scan is everywhere and nowhere
Scan is a sidebar nav item, but clicking it just `navigate("/drives")` — it's not a route, it's a verb. On `/drives` it's also the header CTA, and in the empty state it's a second primary button. So: one action, three different presentations.

**Fix:** Scan is an **action**, not a destination. Remove the sidebar Scan item. Keep a single primary on `/drives`. Promote it to a global keyboard shortcut (⌘⇧S).

---

## Inbox (`/`, `DashboardPage.tsx`)

### Visual

- `apps/desktop/src/pages/DashboardPage.tsx:~48` — page wraps everything in `<div className="mx-auto max-w-[820px] px-10 pt-12 pb-16">`, stacked inside `AppShell`'s already-centred `max-w-[1160px]`. Result: **double-padding**, content sits in a 820-px column on a 1440-px canvas, the bottom two-thirds of the viewport are dead space.
- "Inbox" H1 + "SUNDAY 19 APRIL" eyebrow + empty "Recent scans" card = the page is 80 % nothing on first launch.
- "Everything is in order." is the kind of copy Things-3 can afford because it's the user's todo list; here it's meaningless optimism over an empty archive.

### Behavioural

- Clicking `/` from a sub-route does nothing visible in the sidebar because there *is no Inbox nav item*. The user can't navigate back to the landing except via the brand monogram, which is undiscoverable.
- The page has no answer to "where is project X?"

### Target direction

Rename the concept. Drop "Inbox". This is **Overview**. It answers, in one glance:

1. **What's connected?** Tiny drive-dot row, one line. Click → drive detail.
2. **What's fresh?** "Recently indexed projects" — 5 rows max, with drive badge + last-seen.
3. **What needs my attention?** Issues surface: missing drives, duplicates, capacity >85 %. Hidden entirely when the list is empty — no "everything is in order" filler.
4. **Find anything** — large search affordance above the fold that mirrors the top-bar omnibox, so discovery on a cold launch is obvious.

No inner 820-px wrapper. Use AppShell's container. Grid the overview into a 2-column bento on ≥1280, single column below.

---

## Projects (`/projects`, `ProjectsPage.tsx`)

- Duplicate search (see shell #2).
- `status tab bar` renders the "All" tab alone when no projects exist. A tab with a count of 0 and nothing to toggle to is pure visual overhead. File: `ProjectsPage.tsx:~filter((tab) => tab.id === "all" || tab.count > 0)`.
- Filter row (`All types` / `All categories` / `All drives` + 4 status chips) is always present even when the list is empty — nothing to filter.
- Header says "0 projects across 0 drives" while a large `+ New project` primary and the page-level search sit beside it. When the list is empty, **none of this chrome earns its place**; a single empty state should stand in for the whole page.
- Row layout (when populated) is strong: avatar + primary/secondary + drive dot + size + chips + chevron. Keep. The issue is the surrounding chrome, not the rows.

### Target direction

- When `total === 0`: collapse all filter chrome, show an actionable empty state with one primary CTA ("Scan a drive").
- When populated: hide the tab bar if only "All" would render. Keep filters, but right-align them so the left side holds the title + primary. Remove the inline page-search.

---

## Drives (`/drives`, `DrivesPage.tsx`)

- Two "Scan connected drive" buttons on the empty state (header + card).
- "Add drive" and "Add drive manually" — same action, two labels. Confusing.
- Empty state card is centred in an otherwise empty page — looks like a dialog that forgot to close.

### Target direction

- Empty state: one primary ("Scan a drive") and one secondary text link ("Add drive manually"). Remove the top-right CTA bar entirely in the empty case.
- Populated: keep DriveCard layout; it's fine. The issue is only the empty state.

---

## Settings (`/settings`, `SettingsPage.tsx`)

- One section ("Sync status") for the whole page. Everything else — theme, density, accent, shortcuts, about — is missing, even though the tokens already exist in `globals.css` for `[data-density]` and accent variants.
- Two redundant FeedbackNotices at the bottom both say "sync is disabled, no config". Pick one.
- "Sync now" is a red primary sitting inside a mostly-empty card — maximum accent weight for a probably-nothing action.

### Target direction

- Split into sub-sections accessible via a left-hand sub-nav column (inside the main canvas, not the global sidebar): **Sync**, **Appearance**, **Shortcuts**, **About**.
- Appearance: accent chips (tomato / slate / ember / forest / plum / graphite), density toggle (compact / regular / spacious), theme (light / dark / system).
- Shortcuts: list the real shortcuts (⌘R refresh, ⌘, settings, `/` focus search, ⌘⇧S scan) so users can discover them.
- Drop the duplicate FeedbackNotice — keep the single most-specific one.

---

## Cross-cutting: information scent

Across pages the eye keeps landing on the same dim objects:

- Eyebrows are all the same 10 px uppercase tracked-out gray.
- Section titles are all the same 13 px semibold.
- Metric labels are all the same 10 px uppercase gray.

Things-3 gets away with one tier because there *is* one tier of content. Here we have **drives → projects → files**, three tiers, but we're using one visual weight for all supporting text. Needs more contrast — eyebrows can go, labels should drop the uppercase tracking, and section titles should have a second tier below them for sub-sections.

---

## Execution order

Shell first (propagates to every page), then Inbox → Projects → Drives → Settings.

1. `TopUtilityBar.tsx`: drop fake traffic lights, drop centered title, host the omnibox + breadcrumb.
2. `SidebarNav.tsx`: rename brand, drop internal search, drop Scan item, fix active state for all NavLinks.
3. `RootLayout.tsx`: add Overview route under root, add Settings as proper NavLink (not ad-hoc footer item), wire ⌘⇧S shortcut.
4. `DashboardPage.tsx` → rename to `OverviewPage.tsx`, remove 820-wrapper, grid into 2-col bento.
5. `ProjectsPage.tsx`: collapse filter chrome on empty, remove page-level SearchField.
6. `DrivesPage.tsx`: single CTA in empty state, remove top-right CTA row in empty case.
7. `SettingsPage.tsx`: add sub-nav + Appearance/Shortcuts/About sections.
