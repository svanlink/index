# Web Release Guide

This document describes the recommended free public release path for Drive Project Catalog.

## Current release strategy

- Desktop app: local or personal use in the Tauri app
- Public release: web deployment
- Signed and notarized macOS distribution: postponed for a future release stage

## What the web app is good for

The web app is the recommended free path when you want to:

- share the product publicly
- demo the catalog UI
- review projects, drives, scan history, and storage planning
- use optional Supabase-backed sync transport in a browser build

## What stays desktop-only

The following features remain desktop-only because they depend on Tauri or local desktop runtime behavior:

- native folder picker
- Rust-powered manual scan commands
- local SQLite persistence in the Tauri app
- packaged macOS desktop workflow

In web mode, these features should degrade gracefully and explain that the desktop app is required for them.

## Free public deployment options

Recommended free deployment targets:

- [Vercel](https://vercel.com/)
- [Netlify](https://www.netlify.com/)

Both are suitable for hosting the built frontend as a static web app.

## Build command

From the repo root:

```bash
corepack pnpm install
corepack pnpm build:web
```

The build output is written to:

- `apps/desktop/dist`

## Environment expectations

Optional cloud sync in the web build requires:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional:

- `VITE_SUPABASE_SCHEMA`

If these values are missing or invalid, the web app still works in local-first mode with sync disabled messaging.

## Vercel example

Typical Vercel settings:

- Framework preset: `Vite`
- Root directory: `apps/desktop`
- Build command: `corepack pnpm build:web`
- Output directory: `dist`

Set any optional sync environment variables in the Vercel project settings.

## Netlify example

Typical Netlify settings:

- Base directory: `apps/desktop`
- Build command: `corepack pnpm build:web`
- Publish directory: `dist`

Set any optional sync environment variables in the Netlify site settings.

## Release sanity check

Before publishing a public web build:

1. Run `corepack pnpm test`
2. Run `corepack pnpm typecheck`
3. Run `corepack pnpm build:web`
4. Open the built app in browser mode
5. Confirm desktop-only controls explain their limitations clearly
6. Confirm sync messaging is understandable with and without Supabase config
