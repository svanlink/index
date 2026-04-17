export const folderTypeValues = ["client", "personal_project", "personal_folder"] as const;
export type FolderType = (typeof folderTypeValues)[number];

export const categoryValues = ["photo", "video", "design", "personal"] as const;
export type Category = (typeof categoryValues)[number];

export const sizeStatusValues = ["unknown", "pending", "ready", "failed"] as const;
export type SizeStatus = (typeof sizeStatusValues)[number];

export const moveStatusValues = ["none", "pending"] as const;
export type MoveStatus = (typeof moveStatusValues)[number];

export const missingStatusValues = ["normal", "missing"] as const;
export type MissingStatus = (typeof missingStatusValues)[number];

export const duplicateStatusValues = ["normal", "duplicate"] as const;
export type DuplicateStatus = (typeof duplicateStatusValues)[number];

/**
 * Lifecycle states for a scan session.
 *
 *  - `running`     — scan is currently executing (non-terminal).
 *  - `completed`   — scan finished normally (terminal, priority 3).
 *  - `cancelled`   — user or system requested stop before completion (terminal, priority 1).
 *  - `failed`      — engine reported a hard error (terminal, priority 4, highest).
 *  - `interrupted` — session was persisted as `running` but no live scan exists
 *                    anymore (terminal, priority 2). This is assigned
 *                    **exclusively** by `reconcilePersistedScanSessions` on
 *                    startup, when the app crashed / quit / lost the Tauri
 *                    process while a scan was in flight. It is never emitted
 *                    by the scan engine itself — the engine writes `running`,
 *                    `completed`, `cancelled`, or `failed` only.
 *
 * Terminal-status priority (see `TERMINAL_STATUS_PRIORITY` in
 * `scanIngestionService.ts`) governs which status may overwrite which:
 *
 *   failed (4) > completed (3) > interrupted (2) > cancelled (1)
 *
 * A higher-priority terminal replaces a lower one; a lower one cannot
 * overwrite a higher one. This means `interrupted` can be superseded by a
 * later `completed` or `failed` event (e.g. when live sessions are ingested
 * in the second reconciliation phase and the real terminal state arrives),
 * but it cannot be downgraded to `cancelled` by a stale late-arriving event.
 */
export const scanStatusValues = ["running", "completed", "cancelled", "failed", "interrupted"] as const;
export type ScanStatus = (typeof scanStatusValues)[number];
