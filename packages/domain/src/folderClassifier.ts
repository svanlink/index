/**
 * @module folderClassifier
 *
 * TypeScript port of `classify_folder_name` from
 * `apps/desktop/src-tauri/src/scan_engine.rs`.
 *
 * This exists so the reclassify-legacy action can rewalk existing catalog rows
 * without invoking Rust. The classifier is pure, has no I/O, and its behavior
 * is covered by parity tests against the Rust reference implementation.
 *
 * **Keep this in sync with `scan_engine.rs::classify_folder_name`.** If the
 * rules diverge, the reclassify action will silently disagree with the live
 * scan engine.
 *
 * ## Rules (evaluated in order)
 *
 * **New standard (preferred)**
 *   1. `YYYY-MM-DD_ClientName - ProjectName` → `client`
 *      Date must be exactly 10 chars in ISO format (e.g. `2024-03-12`).
 *
 * **Legacy (backward-compatible, not preferred)**
 *   2. `YYMMDD_ClientName_ProjectName` (client ≠ "Internal") → `client`
 *   3. `YYMMDD_Internal_ProjectName`                          → `personal_project`
 *
 * **Fallback**
 *   4. Anything else → `personal_folder`
 */
import type { FolderType } from "./enums";

/** Which naming convention the folder matched. */
export type NamingConvention = "new_standard" | "legacy" | null;

/**
 * Confidence in the classification.
 *
 * - `"high"`   — matched the preferred new-standard `YYYY-MM-DD` convention.
 * - `"medium"` — matched the legacy `YYMMDD` convention (valid but not preferred).
 * - `"low"`    — fell back to `personal_folder` (no structured pattern found).
 */
export type NamingConfidence = "high" | "medium" | "low";

/**
 * Human-readable naming status for the folder.
 *
 * - `"valid"`   — matches the official `YYYY-MM-DD_Client - Project` convention.
 * - `"legacy"`  — matches the old `YYMMDD_Client_Project` / `YYMMDD_Internal_Project` convention.
 * - `"invalid"` — does not match any structured convention (personal_folder fallback).
 * - `"unknown"` — status could not be determined (e.g. pre-migration DB row with NULL).
 */
export type NamingStatus = "valid" | "legacy" | "invalid" | "unknown";

export interface FolderClassification {
  folderType: FolderType;
  parsedDate: string | null;
  parsedClient: string | null;
  parsedProject: string | null;
  /**
   * The canonical form of the folder name in the new-standard convention.
   *
   * - New-standard folders: same as the input (already canonical).
   * - Legacy client folders: `YYYY-MM-DD_Client - Project` (proposed rename target,
   *   century assumed to be 20xx).
   * - Legacy personal_project: `null` — no client field to promote.
   * - personal_folder: `null`.
   */
  normalizedName: string | null;
  /** Which naming convention matched. `null` for personal_folder. */
  namingConvention: NamingConvention;
  /** Confidence in this classification. */
  namingConfidence: NamingConfidence;
  /**
   * Human-readable naming status.
   * The classifier always returns `"valid"`, `"legacy"`, or `"invalid"`.
   * `"unknown"` only appears when reading pre-migration rows from the database.
   */
  namingStatus: NamingStatus;
}

const PERSONAL_FOLDER: FolderClassification = {
  folderType: "personal_folder",
  parsedDate: null,
  parsedClient: null,
  parsedProject: null,
  normalizedName: null,
  namingConvention: null,
  namingConfidence: "low",
  namingStatus: "invalid"
};

const CLIENT_PROJECT_SEPARATOR = " - ";

/**
 * Returns true when `value` is exactly 10 characters matching `YYYY-MM-DD`:
 * four ASCII digits, a dash, two ASCII digits, a dash, two ASCII digits.
 */
function isTenCharIsoDate(value: string): boolean {
  if (value.length !== 10) return false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (i === 4 || i === 7) {
      if (code !== 45) return false; // '-' is ASCII 45
    } else {
      if (code < 48 || code > 57) return false; // must be ASCII digit 0-9
    }
  }
  return true;
}

/**
 * Returns true when `value` is exactly 6 ASCII digits (legacy `YYMMDD` date).
 */
function isSixAsciiDigits(value: string): boolean {
  if (value.length !== 6) return false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 48 || code > 57) return false;
  }
  return true;
}

/**
 * Converts a 6-digit legacy `YYMMDD` date to ISO `YYYY-MM-DD` format.
 * Assumes century 20xx — valid for years 2000–2099.
 */
function legacyDateToIso(yymmdd: string): string {
  return `20${yymmdd.slice(0, 2)}-${yymmdd.slice(2, 4)}-${yymmdd.slice(4, 6)}`;
}

/**
 * Classify a folder name into one of three `FolderType` values.
 * Never throws — every name produces a classification.
 */
export function classifyFolderName(name: string): FolderClassification {
  const firstUnderscore = name.indexOf("_");

  if (firstUnderscore > 0) {
    const date = name.slice(0, firstUnderscore);
    const rest = name.slice(firstUnderscore + 1);
    const separatorIndex = rest.indexOf(CLIENT_PROJECT_SEPARATOR);

    if (separatorIndex >= 0) {
      const client = rest.slice(0, separatorIndex);
      const project = rest.slice(separatorIndex + CLIENT_PROJECT_SEPARATOR.length);

      if (client.length === 0 || project.length === 0) {
        return PERSONAL_FOLDER;
      }

      if (isTenCharIsoDate(date)) {
        return {
          folderType: "client",
          parsedDate: date,
          parsedClient: client,
          parsedProject: project,
          normalizedName: name,
          namingConvention: "new_standard",
          namingConfidence: "high",
          namingStatus: "valid"
        };
      }
    }
  }

  const parts = name.split("_");

  // Legacy conventions are exactly 3 parts when split by underscore.
  if (parts.length === 3) {
    const date    = parts[0]!;
    const client  = parts[1]!;
    const project = parts[2]!;

    if (client.length === 0 || project.length === 0) {
      return PERSONAL_FOLDER;
    }

    // ── Legacy: YYMMDD_Client_Project or YYMMDD_Internal_Project ─────────
    if (isSixAsciiDigits(date)) {
      // Exact-case "Internal" — lowercase "internal" is a client name.
      if (client === "Internal") {
        return {
          folderType: "personal_project",
          parsedDate: date,
          parsedClient: null, // legacy: no location / no client
          parsedProject: project,
          normalizedName: null, // no client field to promote to new format
          namingConvention: "legacy",
          namingConfidence: "medium",
          namingStatus: "legacy"
        };
      }

      return {
        folderType: "client",
        parsedDate: date,
        parsedClient: client,
        parsedProject: project,
        // Proposed rename target in the canonical new-standard form.
        // Century 20xx assumed — purely informational for the rename engine.
        normalizedName: `${legacyDateToIso(date)}_${client}${CLIENT_PROJECT_SEPARATOR}${project}`,
        namingConvention: "legacy",
        namingConfidence: "medium",
        namingStatus: "legacy"
      };
    }
  }

  return PERSONAL_FOLDER;
}
