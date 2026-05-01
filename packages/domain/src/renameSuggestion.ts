/**
 * @module renameSuggestion
 *
 * Domain type for a folder rename suggestion produced by the Smart Rename
 * Engine (Phase 3). A suggestion represents a proposed change from the
 * current folder name to the canonical YYYY-MM-DD_Client - Project form.
 *
 * Suggestions are stored in the rename_suggestions table and reviewed by the
 * user. Approving a suggestion records intent in the catalog — no folder on
 * disk is ever renamed as part of Phase 3.
 */

/**
 * Lifecycle of a rename suggestion.
 *
 * - `"pending"`  — awaiting user review.
 * - `"approved"` — user accepted the proposed name. Catalog records this
 *                  intent; the on-disk folder is unchanged in Phase 3.
 * - `"dismissed"` — user rejected the suggestion; it will not resurface.
 */
export type RenameSuggestionStatus = "pending" | "approved" | "dismissed";

export interface RenameSuggestion {
  id: string;
  projectId: string;
  /** Folder name currently on disk (and in the catalog). */
  currentName: string;
  /** Proposed canonical YYYY-MM-DD_Client - Project name. */
  suggestedName: string;
  /** Human-readable explanation of what was detected and why this rename is proposed. */
  reason: string;
  /**
   * Confidence in the suggestion.
   *
   * - `"high"`   — unambiguous date format (YYYYMMDD or YYYY-MM-DD detected in
   *                a non-canonical position).
   * - `"medium"` — legacy YYMMDD format; century assumed to be 20xx.
   * - `"low"`    — partial date or indirect inference; review recommended.
   */
  confidence: "high" | "medium" | "low";
  status: RenameSuggestionStatus;
  createdAt: string;
  updatedAt: string;
}
