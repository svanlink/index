---
name: Drive Project Catalog
description: >-
  Desktop catalog for locating projects across drives. Primary user job —
  "Where is project X? Which drive is it on?" Dense, transaction-mode UI.
  No telemetry, no system-health dashboards, no cinematic heroes.
colors:
  canvas: "#f9f9f9"
  surface: "#ffffff"
  surface-container-low: "#f3f3f3"
  surface-container: "#eeeeee"
  surface-container-high: "#e8e8e8"
  surface-container-highest: "#e2e2e2"
  hairline: "#e2e2e2"
  border-soft: "#d2d2d7"
  border-mid: "#86868b"
  ink: "#1d1d1f"
  ink-2: "#424245"
  ink-3: "#6e6e73"
  ink-4: "#86868b"
  action: "#0071e3"
  action-hover: "#0066cc"
  action-soft: "#2997ff"
  danger: "#ba1a1a"
  danger-container: "#ffdad6"
  success: "#1d7a4a"
  warn: "#8a5a00"
  graphite: "#1d1d1f"
typography:
  family: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  mono: "'JetBrains Mono', 'SF Mono', Menlo, monospace"
  scale:
    hero-display: "56/600/1.1/-0.28"
    product-heading: "40/600/1.1/-0.2"
    card-title: "28/600/1.2/-0.1"
    body-primary: "17/400/1.47/0"
    control-label: "14/500/1.3/0"
    utility-micro: "12/400/1.3/0.04"
rounded:
  DEFAULT: "4px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  unit: "4px"
  gutter: "20px"
  container-max: "980px"
  sidebar: "256px"
  top-nav: "56px"
  section-gap-sm: "60px"
  section-gap-lg: "120px"
components:
  - btn-primary
  - btn-secondary
  - btn-ghost
  - btn-danger
  - btn-sm
  - MetaField
  - CapacityBar
  - ActivityTimelineRow
  - BentoFolderCard
  - MetadataBentoTile
  - StatusBadge
  - SectionCard
  - GlassTopNav
  - ConfirmModal
  - FeedbackNotice
---

# Drive Project Catalog — Design System

This is the single source of truth for visual and interaction design. Every
page, primitive, and token must map back to a rule in this file. If it is not
in this file, it does not ship.

The current direction is a hard fork from the previous warm-canvas /
terracotta look. Do not port old tokens. Do not preserve old components for
"consistency." The warm look is dead.

---

## 1. Overview

### Primary user job

**"Where is project X? Which drive is it on?"**

Every surface must make that question faster to answer. If a component does
not help a user locate, identify, or move a project, it does not belong.

### Core principles

1. **Dense transaction mode, not dashboard flex.** The app is a filing
   cabinet. Rows beat cards when the user is scanning. Cards only when the
   user is choosing.
2. **One accent color.** Apple blue `#0071e3` is reserved for genuine
   action, selection, and focus. Never decorative. A screen with blue
   everywhere has blue nowhere.
3. **Near-black on near-white.** `#1d1d1f` ink on `#f9f9f9` canvas.
   Grayscale carries hierarchy; blue carries intent.
4. **Hairlines, not shadows.** `#e2e2e2` dividers do the work of borders
   and elevation. Shadows only on floating elements (modals, popovers).
5. **Information density is a feature.** A scanner wants to see 20 items,
   not 6. Tune padding down before tuning it up.
6. **No cosplay.** No "Rust Core Engine," no fake CPU graphs, no log
   streams, no uptime counters. The app indexes drives — it does not need
   to look like mission control to prove it.

### What this app is not

- Not a dashboard. There is no landing screen with KPIs.
- Not a system monitor. No health, no telemetry, no logs surface.
- Not a marketing site. No hero display, no stock imagery, no gradient
  washes, no "cinematic" dark panels.
- Not a mobile app. No bottom nav, no floating action button.

---

## 2. Colors

### Palette

| Role | Token | Hex | Use |
|------|-------|-----|-----|
| Canvas | `--canvas` | `#f9f9f9` | App background behind everything |
| Surface | `--surface` | `#ffffff` | Cards, modals, input fields |
| Surface L1 | `--surface-container-low` | `#f3f3f3` | Inset rows, hover fills |
| Surface L2 | `--surface-container` | `#eeeeee` | Selected rows, empty states |
| Surface L3 | `--surface-container-high` | `#e8e8e8` | Pressed / active rows |
| Surface L4 | `--surface-container-highest` | `#e2e2e2` | Rare — very inset panels |
| Hairline | `--hairline` | `#e2e2e2` | All 1px dividers |
| Soft border | `--border-soft` | `#d2d2d7` | Input borders, card outlines |
| Mid border | `--border-mid` | `#86868b` | Focus or "stronger than default" borders |
| Ink | `--ink` | `#1d1d1f` | Primary text, icons |
| Ink 2 | `--ink-2` | `#424245` | Secondary text, metadata values |
| Ink 3 | `--ink-3` | `#6e6e73` | Labels, muted text |
| Ink 4 | `--ink-4` | `#86868b` | Disabled text, placeholder |
| Action | `--action` | `#0071e3` | Primary buttons, selected state, focus ring |
| Action hover | `--action-hover` | `#0066cc` | Hover state of action |
| Action soft | `--action-soft` | `#2997ff` | Keyboard focus ring (over dark) |
| Danger | `--danger` | `#ba1a1a` | Destructive button, error text |
| Danger container | `--danger-container` | `#ffdad6` | Error banner background |
| Success | `--success` | `#1d7a4a` | Success badge text |
| Warn | `--warn` | `#8a5a00` | Warning badge text |
| Graphite | `--graphite` | `#1d1d1f` | Confirm-modal background — only place dark lives |

### When to use blue

Blue is the app's only hue. Use it **only** for:

- Primary action buttons (`.btn-primary`)
- The currently-selected sidebar item
- The currently-selected row or card
- Keyboard focus ring (2px outline with 2px offset)
- Active-link text (one word, not whole sentences)

Do not use blue for:

- Section headings
- Decorative accents, rules, or dividers
- Icons (unless the icon *is* the action)
- Badge backgrounds for neutral status
- Hover states (use surface-container-low instead)

### Contrast rules

- Body text must be `--ink` or `--ink-2` on any surface L0–L2. Never `--ink-3` for primary prose.
- `--ink-3` is for labels and secondary metadata only.
- `--ink-4` is for disabled and placeholder only.
- Any colored background (action, danger, graphite) pairs with `#ffffff` text. No exceptions.

---

## 3. Typography

Family: **Inter** (loaded from `@fontsource/inter`). System fallback is
`-apple-system, BlinkMacSystemFont, 'Segoe UI'`. Mono is JetBrains Mono for
drive paths, sizes, and IDs.

### Type scale

| Name | Size | Weight | Line | Tracking | Use |
|------|------|--------|------|----------|-----|
| `hero-display` | 56 | 600 | 1.1 | -0.28 | **Reserved.** Only the confirm modal. Never on list pages. |
| `product-heading` | 40 | 600 | 1.1 | -0.2 | Page title on detail pages only (ProjectDetail, DriveDetail). |
| `card-title` | 28 | 600 | 1.2 | -0.1 | Section headings inside cards; list-page page titles. |
| `body-primary` | 17 | 400 | 1.47 | 0 | Default prose, row primary text. |
| `control-label` | 14 | 500 | 1.3 | 0 | Form labels, button text, sidebar items, table headers. |
| `utility-micro` | 12 | 400 | 1.3 | 0.04 | Timestamps, byte counts, status chips, tooltips. |

### Weight discipline

- 400 for body prose.
- 500 for controls and labels — never 400.
- 600 for headings — never 700.
- 700 is banned. Bold looks like shouting in this palette.

### Rules

- Max one `product-heading` per page.
- Max one `hero-display` per app session (confirm modal).
- Never letter-space uppercase text beyond a single `utility-micro` chip
  per screen. The old "uppercase-tracked badge everywhere" pattern is
  banned.
- Body text is 17px, not 16. We are a desktop app; we have the room.
- Numbers in columns (size, date, count) use `font-variant-numeric: tabular-nums`.

---

## 4. Layout

### Shell

```
┌──────────────────────────────────────────────────────────┐
│  GlassTopNav  (56px, sticky, hairline under)             │
├────────────┬─────────────────────────────────────────────┤
│            │                                             │
│  Sidebar   │   <main>                                    │
│  256px     │   max-w-[980px], px-20, py-24               │
│            │                                             │
│            │                                             │
└────────────┴─────────────────────────────────────────────┘
```

- Shell is **sidebar + top-nav only**. No footer.
- There is no status bar unless a live job is running. When a scan or
  move is active, a single 32px bar pins to the bottom with progress +
  cancel. It disappears the moment the job ends.
- Main content width caps at 980px. Long lists can be wider (up to
  1200px) but forms and detail pages stop at 980.

### Grid unit

- Base unit: **4px**.
- Standard gutter: **20px** (5 units).
- Section gap small: **60px** (inside a page).
- Section gap large: **120px** (between major regions — rare).
- Card internal padding: **20px** on all sides, `28px` on top for cards with a title.
- Row height (list mode): **44px**. Dense mode: **36px**.

### Sidebar

- 256px wide.
- Background: `--surface`.
- Right edge: 1px `--hairline`.
- Items: 14px / 500 / `--ink-2`, 8px radius hover fill `--surface-container-low`, selected state is `--action` text with no fill.
- Section labels (e.g., "Drives", "Projects"): 12px / 500 / `--ink-3`, uppercase, 0.06em tracking, 24px top padding.

### Top nav

- 56px tall, glass effect (`backdrop-filter: blur(20px)`, `background: rgba(255,255,255,0.72)`).
- Contains: global search (cmd+K), drive switcher, import button.
- Bottom edge: 1px `--hairline`.

### List vs bento

- Use **list rows** when the user is scanning > 8 items.
- Use **bento cards** when the user is choosing between < 8 projects or viewing a single project's metadata.
- Never mix in the same section.

---

## 5. Shapes

| Tier | Token | Radius | Use |
|------|-------|--------|-----|
| Default | `--radius` | 4px | Inputs, small controls, checkboxes |
| Large | `--radius-lg` | 8px | Buttons, list rows, sidebar items |
| XL | `--radius-xl` | 12px | Cards, modals, bento tiles |
| Full | `--radius-full` | 9999px | Avatars, status dots, toggle thumbs |

Never use radius > 12px on any surface. Pills are for dots and avatars
only, not buttons.

---

## 6. Components

### Buttons

Five variants. No more.

```
.btn           → base (height 36, padding 0 16, radius 8, weight 500)
.btn-primary   → --action bg, white text, --action-hover on hover
.btn-secondary → --surface bg, --border-soft border, --ink text
.btn-ghost     → transparent, --ink-2 text, --surface-container-low hover
.btn-danger    → --danger bg, white text
.btn-sm        → height 28, padding 0 12, utility-micro text
```

- Focus: 2px `--action-soft` ring, 2px offset from button edge.
- Disabled: opacity 0.4, cursor not-allowed, no hover.
- Never stack two `.btn-primary` in the same region. There is one primary
  action per screen.

### MetaField

Label + value pair used in all detail panels.

```
┌─────────────────────────┐
│ LABEL (ink-3, 14/500)   │
│ Value (ink, 17/400)     │
└─────────────────────────┘
```

Gap between label and value: 4px. Between fields: 16px.

### CapacityBar

Horizontal bar for drive capacity.

- Height: 6px
- Track: `--surface-container`
- Fill: `--ink` (< 80%), `--warn` (80–95%), `--danger` (> 95%)
- Radius: full
- Label above: `{used} / {total}` in `utility-micro`, `--ink-3`

Never fill with action blue. Capacity is not an action.

### ActivityTimelineRow

Single row in the Inbox. Left: 28px icon square with `--surface-container-low` fill and 8px radius. Middle: primary text (17/400) + secondary text (14/400, `--ink-3`). Right: relative timestamp (`utility-micro`, `--ink-3`), right-aligned.

Hover: row fills to `--surface-container-low`. Selected: `--surface-container`.

### BentoFolderCard

Project card on the Projects page.

- 240px min-width, aspect-ratio free.
- Card: `--surface`, `--radius-xl`, 1px `--hairline` border, no shadow.
- Top region (120px): `--surface-container-low` background with a single Phosphor folder icon at 48px, centered, `--ink-3`.
- Below: card-title (28/600) project name, one line `utility-micro` drive + size, one line `utility-micro` last-touched.
- Hover: border becomes `--border-soft`. No lift, no scale, no shadow.
- Selected: border becomes `--action`, 2px instead of 1px.

### MetadataBentoTile

The 4-tile grid on ProjectDetail (size, files, last modified, drive).

- 2×2 grid, 20px gap.
- Each tile: `--surface`, `--radius-xl`, 1px `--hairline`, 20px padding.
- Label top (control-label, `--ink-3`), value bottom (card-title, `--ink`).
- Tabular-nums for anything numeric.

### StatusBadge

Small inline pill. 6 states: `idle`, `indexing`, `synced`, `stale`, `missing`, `error`.

- Height 20, padding 0 8, radius full.
- Background: transparent for `idle`/`synced`, tinted for others.
- Text: `utility-micro`, 500 weight.
- Dot (6px) left of text, color matches semantic role.

| State | Dot | Text color | Background |
|-------|-----|-----------|-----------|
| idle | `--ink-4` | `--ink-3` | transparent |
| indexing | `--action` | `--action` | transparent |
| synced | `--success` | `--success` | transparent |
| stale | `--warn` | `--warn` | transparent |
| missing | `--ink-4` | `--ink-3` | `--surface-container` |
| error | `--danger` | `--danger` | `--danger-container` |

### SectionCard

Container with a heading and hairline divider.

```
┌─────────────────────────────────────┐
│ Section title (card-title)          │
├─────────────────────────────────────┤  ← 1px hairline
│ children                            │
└─────────────────────────────────────┘
```

- Card: `--surface`, `--radius-xl`, 1px `--hairline`.
- Title row padding: 20px horizontal, 16px vertical.
- Body padding: 20px.

### GlassTopNav

Sticky top bar, already specified in Layout. Contents are left-to-right:
app mark (small wordmark, `card-title` weight 600, no icon), global
search, drive switcher, primary action slot.

The primary action slot holds **at most one** `.btn-primary` per page.

### ConfirmModal

The only dark surface in the app. Used exclusively for destructive
confirmations (delete, wipe, remove).

- Background: `--graphite` (`#1d1d1f`).
- Text: white, 17/400.
- Title: `hero-display` (56/600), white. This is the *only* place
  `hero-display` lives.
- Action: `.btn-danger`. Cancel: `.btn-ghost` with white text on graphite.
- Width: 480px, padding: 40px, radius: 12px.

Do not reuse graphite anywhere else. If a destructive confirm is not the
intent, use a light `SectionCard` modal instead.

### FeedbackNotice

Inline banner for drive errors, scan failures, permission prompts.

- `--danger-container` background for errors, `--surface-container` for info.
- Left: 16px icon, `--danger` or `--ink-2`.
- Body: 14/400, `--ink`.
- Right: dismiss button (`.btn-ghost .btn-sm`).
- 12px padding, 8px radius.

---

## 7. Do's and Don'ts

### Do

- Start every page with: "What is the primary thing the user is trying to find here?"
- Strip a row before adding a card.
- Reserve blue for genuine action.
- Use `utility-micro` tabular-nums for every size, date, and count.
- Right-align numbers in tables.
- Show "last transfer" and "last projects" on Inbox — nothing else.
- Use hairlines instead of shadows unless the element literally floats.
- Commit to Inter. No secondary display font.
- Ship density. A 44px row is the default, 36px is fine, 64px is wrong.
- Use Phosphor icons at a single stroke weight throughout the app.

### Don't

- No 56px marketing heroes on list pages. Hero sizing is reserved for the destructive confirm modal.
- No stock imagery, no illustrations, no gradients, no glow.
- No cinematic dark panels. Graphite lives in one modal, not in cards.
- No telemetry widgets. No CPU meter, no RAM bar, no thread count, no queue depth.
- No "Rust Core Engine" branding, no runtime boasts, no engine cosplay.
- No log stream surface. Errors belong in a `FeedbackNotice`, not a live tail.
- No system-health dashboard. The Inbox shows last transfer + last projects + their info. Period.
- No uppercase-tracked pills beyond one `utility-micro` chip per screen.
- No bottom floating action button. Primary action sits in the top nav slot.
- No mobile bottom nav. This is a desktop app.
- No three layers of chrome. Sidebar + top nav + page is the limit. No secondary toolbar under the top nav.
- No footer unless a live job is running.
- No decorative color. If a color is on screen and you cannot name its job, delete it.
- No mixing list rows and bento cards inside the same section.
- No radius > 12px on any surface.
- No boxes around single icons "for balance." If it does not have content, it does not get a border.

---

## Migration contract

This file governs the migration. The order is:

1. **Layer 1a — Token retune.** Rewrite token *values* in `apps/desktop/src/styles/globals.css` to match this file's palette. Preserve token *names* and keep all existing class definitions so pages keep compiling and rendering. Delete the `data-accent` variants (DESIGN.md mandates a single action color). Every page instantly flips from warm-terracotta to cold-neutral+Apple-blue without touching page code. One commit.
2. **Layer 1b — Alias + banned-class removal.** *After* Layer 3 finishes. Delete the `--color-*` legacy alias block and every class flagged "deprecated: banned by DESIGN.md" (hero-panel, hero-*, toolbar-surface, subtle-section-label, card-raised, card-inset, and any duplicate button families). One commit, CSS-only.
3. **Layer 2 — Primitives.** Update `packages/ui` button classes, `Icon`, and typography primitives to use Layer 1 tokens directly. One commit.
4. **Layer 3 — Pages.** One page per commit, in this order: Inbox → DrivesPage → DriveDetailPage → ProjectsPage → ProjectDetailPage → SettingsPage → ImportFoldersDialog. Each commit replaces banned patterns (hero panels, telemetry tiles, stock imagery, uppercase-tracked chips, three-chrome shells) with components defined above.

No page work starts until Layer 1a and Layer 2 are merged. No deviation
from the token table, type scale, or banned-patterns list without
updating this file in the same commit.
