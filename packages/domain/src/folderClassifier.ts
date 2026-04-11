/**
 * @module folderClassifier
 *
 * TypeScript port of `classify_folder_name` from
 * `apps/desktop/src-tauri/src/scan_engine.rs`.
 *
 * This exists so the reclassify-legacy action (S9) can rewalk existing
 * catalog rows without invoking Rust. The classifier is pure, has no I/O,
 * and its behavior is covered by parity tests against the Rust reference
 * implementation.
 *
 * **Keep this in sync with `scan_engine.rs::classify_folder_name`.** If the
 * rules diverge, the reclassify action will silently disagree with the
 * live scan engine — the exact class of bug that motivated M6.
 *
 * Rules (evaluated in order):
 *   1. `YYMMDD_ClientName_ProjectName` (exactly 3 parts, 6-digit date,
 *      client ≠ "Internal") → `client`
 *   2. `YYMMDD_Internal_ProjectName` (client is literally "Internal") →
 *      `personal_project`
 *   3. Anything else → `personal_folder`
 */
import type { FolderType } from "./enums";

export interface FolderClassification {
  folderType: FolderType;
  parsedDate: string | null;
  parsedClient: string | null;
  parsedProject: string | null;
}

const PERSONAL_FOLDER: FolderClassification = {
  folderType: "personal_folder",
  parsedDate: null,
  parsedClient: null,
  parsedProject: null
};

function isSixAsciiDigits(value: string): boolean {
  if (value.length !== 6) return false;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    // ASCII '0' (48) – '9' (57)
    if (code < 48 || code > 57) return false;
  }
  return true;
}

/**
 * Classify a folder name into one of three `FolderType` values.
 * Never throws — every name produces a classification.
 */
export function classifyFolderName(name: string): FolderClassification {
  const parts = name.split("_");

  // Must have exactly 3 underscore-delimited parts
  if (parts.length !== 3) {
    return PERSONAL_FOLDER;
  }

  const date = parts[0]!;
  const client = parts[1]!;
  const project = parts[2]!;

  // Date segment must be exactly 6 ASCII digits
  if (!isSixAsciiDigits(date)) {
    return PERSONAL_FOLDER;
  }

  // Client and project segments must be non-empty
  if (client.length === 0 || project.length === 0) {
    return PERSONAL_FOLDER;
  }

  // Exact-case "Internal" — lowercase "internal" is a client name.
  if (client === "Internal") {
    return {
      folderType: "personal_project",
      parsedDate: date,
      parsedClient: null,
      parsedProject: project
    };
  }

  return {
    folderType: "client",
    parsedDate: date,
    parsedClient: client,
    parsedProject: project
  };
}
