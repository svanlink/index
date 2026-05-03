---
id: CSS-001
title: Replace Tailwind with vanilla CSS — app looks and behaves like a real macOS app
type: AFK
status: open
blocked_by: []
blocks: []
estimate: L
---

## Goal

Every Tailwind utility class is replaced with vanilla CSS rules. The `tailwindcss` dependency is removed. The app's visual design is controlled by a single CSS system: `globals.css` + component CSS classes, no arbitrary values, no inline style conflicts.

## Why this slice first

The current three-system situation (Tailwind + CSS custom properties + inline style) creates friction on every design change. Removing Tailwind lets the token system in `globals.css` take full control. Every visual improvement from here — macOS materials, precise density, native animations — becomes a single-file CSS change instead of a negotiation across three layers.

## Layers

- **React** (`apps/desktop/src/pages/`): All `.tsx` files — remove `className` Tailwind utilities, replace with semantic CSS classes
- **CSS** (`apps/desktop/src/styles/globals.css`): Add utility layer + semantic typography classes, remove `@tailwind` directives
- **Config** (`apps/desktop/`): Remove `tailwindcss` from `package.json`, delete or gut `tailwind.config.*`

## Implementation notes

### What exists today

`globals.css` already has a strong token system and many custom classes:
- Tokens: `--ink`, `--canvas`, `--act`, `--hairline`, `--surface-inset`, etc.
- Component classes: `.btn`, `.btn-sm`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.field-shell`, `.sheet`, `.skeleton`, `.mono`, `.tnum`, `.scroll`, `.pulse-ring`, `.pulse-dot`, `.scale-in`, `.table-head-glass`

These stay. Tailwind is removed from around them.

### Utility layer to add to globals.css

Replace the most-used Tailwind utilities with explicit CSS classes. Group into logical sections:

**Layout**
```css
.flex         { display: flex; }
.flex-col     { flex-direction: column; }
.flex-wrap    { flex-wrap: wrap; }
.flex-1       { flex: 1; }
.shrink-0     { flex-shrink: 0; }
.grid         { display: grid; }
.inline-flex  { display: inline-flex; }
.items-center { align-items: center; }
.items-start  { align-items: flex-start; }
.items-baseline { align-items: baseline; }
.justify-center  { justify-content: center; }
.justify-between { justify-content: space-between; }
.justify-end     { justify-content: flex-end; }
.min-w-0      { min-width: 0; }
.w-full       { width: 100%; }
.overflow-hidden { overflow: hidden; }
.overflow-y-auto { overflow-y: auto; }
.relative     { position: relative; }
.absolute     { position: absolute; }
.fixed        { position: fixed; }
.inset-0      { inset: 0; }
.z-50         { z-index: 50; }
.hidden       { display: none; }
```

**Typography — semantic, macOS-tuned**
```css
.text-large-title { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
.text-title       { font-size: 17px; font-weight: 600; letter-spacing: -0.015em; }
.text-headline    { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
.text-body        { font-size: 13px; }
.text-callout     { font-size: 12px; }
.text-caption     { font-size: 11px; }
.text-eyebrow     { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; }
.font-medium      { font-weight: 500; }
.font-semibold    { font-weight: 600; }
.font-bold        { font-weight: 700; }
.truncate         { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.text-center      { text-align: center; }
.leading-snug     { line-height: 1.35; }
```

**Misc**
```css
.outline-none    { outline: none; }
.bg-transparent  { background: transparent; }
.border-none     { border: none; }
.cursor-default  { cursor: default; }
.select-none     { user-select: none; }
.pointer-events-none { pointer-events: none; }
.list-none       { list-style: none; }
.p-0             { padding: 0; }
.m-0             { margin: 0; }
```

**Gap / spacing — keep only the exact values actually used**
```css
.gap-1 { gap: 4px; }   /* 4 = Tailwind gap-1 */
.gap-2 { gap: 8px; }
.gap-3 { gap: 12px; }
.gap-4 { gap: 16px; }
.gap-6 { gap: 24px; }
```

> Note: Do NOT recreate Tailwind's full spacing scale. Only add what the codebase actually uses. Anything more specific goes in a component-level CSS class.

### Migration order (by className count, largest first)

1. `pagePrimitives.tsx` — 62 lines (shared primitives, ConfirmModal — touch this, fix everything that uses it)
2. `ProjectDetailPage.tsx` — 65 lines
3. `DriveDetailPage.tsx` — 49 lines
4. `ProjectsPage.tsx` — 42 lines
5. `ImportFoldersDialog.tsx` — estimate ~35 lines
6. Remaining components (CommandPalette, DriveCard, ScanStatusPanel, etc.)

### Per-component process

For each file:
1. Read the file
2. For each `className`, identify which utilities are Tailwind vs already custom
3. Where a Tailwind utility maps 1:1 to the new utility layer → replace class name (or it's already the same)
4. Where it's a one-off layout/spacing value → create a semantic class in `globals.css` or inline into the component via a descriptive class name
5. Where it's an inline `style={{}}` that conflicts with a Tailwind class → consolidate into CSS
6. Run `corepack pnpm -r typecheck` — no type errors expected (className changes don't affect types)
7. Visual check in the running app

### Removing Tailwind after all components are migrated

```bash
# In apps/desktop/
pnpm remove tailwindcss
# Remove from globals.css:
#   @tailwind base;
#   @tailwind components;
#   @tailwind utilities;
# Delete or empty tailwind.config.ts
# Verify: pnpm build
```

PostCSS and Autoprefixer stay (they're useful independently).

### Patterns to watch for

**`style={{ color: "var(--ink)" }}`** — these were inline because Tailwind can't use CSS custom properties directly. After migration, move them to CSS class definitions. Only truly dynamic values (computed at runtime) should remain as inline styles.

**Arbitrary values** — `text-[13px]`, `px-[5px]` etc. — these are Tailwind escapes that should become semantic CSS classes: `.text-body`, `.px-field`, etc.

**`bg-transparent`** — shows up 55 times. Maps directly to `.bg-transparent { background: transparent; }` in the utility layer.

## Definition of done

- [ ] Zero Tailwind utility classes remain in any `.tsx` file
- [ ] Zero arbitrary value classes (`[...]` syntax) remain
- [ ] `tailwindcss` removed from `package.json` and `pnpm-lock.yaml`
- [ ] `@tailwind` directives removed from `globals.css`
- [ ] `corepack pnpm -r typecheck` passes clean
- [ ] `corepack pnpm -r test` passes (no regressions)
- [ ] App builds: `corepack pnpm --filter @drive-project-catalog/desktop build`
- [ ] Visual review: every page matches pre-migration appearance or improves
- [ ] No `console.log` in modified files

## Out of scope

- Redesigning any component visually (that's separate work — this is a like-for-like migration first)
- Adding new CSS animations or design patterns (do that after Tailwind is gone)
- Migrating to CSS Modules or scoped styles (vanilla global CSS is fine for this app size)
- Changing the Rust backend or any TypeScript types
