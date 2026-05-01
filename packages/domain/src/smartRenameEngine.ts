/**
 * @module smartRenameEngine
 *
 * Pure functions that generate rename suggestions for project folders that
 * do not match the official YYYY-MM-DD_Client - Project naming convention.
 *
 * This module has no I/O. It takes a Project and returns a candidate or null.
 * Persistence and deduplication are handled by the caller.
 *
 * ## Detection order
 *
 * 1. Project already canonical (namingStatus === "valid") → skip.
 * 2. Project has a normalizedName from the Phase 2 classifier
 *    (legacy YYMMDD pattern already decoded) → use it directly.
 * 3. Try smart date detection on the folder name for formats the base
 *    classifier does not handle: YYYYMMDD, YYYY_MM_DD, YYYY-MM (partial).
 * 4. Nothing actionable → return null.
 *
 * No physical rename is ever performed here.
 */

import type { Project } from "./project";

const CLIENT_PROJECT_SEPARATOR = " - ";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RenameCandidate {
  projectId: string;
  currentName: string;
  suggestedName: string;
  reason: string;
  confidence: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 2000 || year > 2099) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

interface DateExtraction {
  isoDate: string;
  confidence: "high" | "medium" | "low";
  patternLabel: string;
}

/**
 * Attempt to extract an ISO date from a single underscore-split token.
 * Handles formats beyond what the base folderClassifier recognises.
 */
function tryExtractDateToken(token: string): DateExtraction | null {
  // YYYYMMDD — 8 unambiguous digits.
  if (/^\d{8}$/.test(token)) {
    const y = Number(token.slice(0, 4));
    const m = Number(token.slice(4, 6));
    const d = Number(token.slice(6, 8));
    if (isValidCalendarDate(y, m, d)) {
      return {
        isoDate: `${token.slice(0, 4)}-${token.slice(4, 6)}-${token.slice(6, 8)}`,
        confidence: "high",
        patternLabel: "YYYYMMDD"
      };
    }
    return null;
  }

  // YYMMDD — 6 digits, legacy; century assumed 20xx.
  // The base classifier already handles this pattern, but the smart engine
  // re-detects it so folders with namingStatus === "invalid" (e.g. because
  // the client segment was empty) still get a chance at a suggestion.
  if (/^\d{6}$/.test(token)) {
    const y = 2000 + Number(token.slice(0, 2));
    const m = Number(token.slice(2, 4));
    const d = Number(token.slice(4, 6));
    if (isValidCalendarDate(y, m, d)) {
      return {
        isoDate: `20${token.slice(0, 2)}-${token.slice(2, 4)}-${token.slice(4, 6)}`,
        confidence: "medium",
        patternLabel: "YYMMDD"
      };
    }
    return null;
  }

  // YYYY-MM-DD — already canonical; only appears here if the folder somehow
  // got classified as invalid despite a good date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
    const [yearStr, monthStr, dayStr] = token.split("-");
    const y = Number(yearStr);
    const m = Number(monthStr);
    const d = Number(dayStr);
    if (isValidCalendarDate(y, m, d)) {
      return {
        isoDate: token,
        confidence: "high",
        patternLabel: "YYYY-MM-DD"
      };
    }
    return null;
  }

  // YYYY-MM — partial date, no day; default to first of month.
  if (/^\d{4}-\d{2}$/.test(token)) {
    const [yearStr, monthStr] = token.split("-");
    const y = Number(yearStr);
    const m = Number(monthStr);
    if (y >= 2000 && y <= 2099 && m >= 1 && m <= 12) {
      return {
        isoDate: `${yearStr}-${monthStr}-01`,
        confidence: "low",
        patternLabel: "YYYY-MM (partial, day assumed 01)"
      };
    }
    return null;
  }

  return null;
}

/**
 * Try to detect a YYYY_MM_DD date spread across three consecutive
 * underscore-separated tokens starting at index `offset` in `parts`.
 */
function tryExtractThreeTokenDate(
  parts: string[],
  offset: number
): DateExtraction | null {
  const y = parts[offset];
  const m = parts[offset + 1];
  const d = parts[offset + 2];
  if (!y || !m || !d) return null;
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) return null;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (isValidCalendarDate(year, month, day)) {
    return {
      isoDate: `${y}-${pad2(month)}-${pad2(day)}`,
      confidence: "high",
      patternLabel: "YYYY_MM_DD (underscore-delimited)"
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a rename candidate for `project`, or return `null` if the folder
 * already uses the canonical convention or no structured pattern can be
 * detected.
 *
 * This function never throws.
 */
export function generateRenameCandidate(project: Project): RenameCandidate | null {
  try {
    return _generateRenameCandidate(project);
  } catch {
    return null;
  }
}

function _generateRenameCandidate(project: Project): RenameCandidate | null {
  // Already canonical — nothing to suggest.
  if (project.namingStatus === "valid") return null;

  const folderName = project.folderName;
  if (!folderName) return null;

  // ── Fast path: classifier already produced a normalizedName ──────────────
  //
  // This covers all YYMMDD_Client_Project cases detected by Phase 2. Reuse
  // the classifier's output directly rather than re-parsing.
  if (project.normalizedName && project.normalizedName !== folderName) {
    const parsedDate = project.parsedDate ?? "?";
    return {
      projectId: project.id,
      currentName: folderName,
      suggestedName: project.normalizedName,
      reason: `Legacy date format "${parsedDate}" can be rewritten as ${project.normalizedName.split("_")[0] ?? parsedDate} in the canonical YYYY-MM-DD form.`,
      confidence: (project.namingConfidence as "high" | "medium" | "low") ?? "medium"
    };
  }

  // ── Smart detection: formats the base classifier doesn't handle ───────────

  const parts = folderName.split("_");

  // Standard 3-part: Date_Client_Project with an unusual date token.
  if (parts.length === 3) {
    const [datePart, client, projectPart] = parts;
    if (datePart && client && projectPart) {
      const extraction = tryExtractDateToken(datePart);
      if (extraction) {
        const suggestedName = `${extraction.isoDate}_${client}${CLIENT_PROJECT_SEPARATOR}${projectPart}`;
        if (suggestedName !== folderName) {
          return {
            projectId: project.id,
            currentName: folderName,
            suggestedName,
            reason: `Date token "${datePart}" (${extraction.patternLabel}) normalizes to ${extraction.isoDate}.`,
            confidence: extraction.confidence
          };
        }
      }
    }
  }

  // 5-part: YYYY_MM_DD_Client_Project (date spread across three tokens).
  if (parts.length === 5) {
    const extraction = tryExtractThreeTokenDate(parts, 0);
    if (extraction) {
      const client = parts[3];
      const projectPart = parts[4];
      if (client && projectPart) {
        const suggestedName = `${extraction.isoDate}_${client}${CLIENT_PROJECT_SEPARATOR}${projectPart}`;
        if (suggestedName !== folderName) {
          return {
            projectId: project.id,
            currentName: folderName,
            suggestedName,
            reason: `Underscore-delimited date "${parts[0]}_${parts[1]}_${parts[2]}" (${extraction.patternLabel}) normalizes to ${extraction.isoDate}.`,
            confidence: extraction.confidence
          };
        }
      }
    }
  }

  return null;
}

/**
 * Generate rename candidates for a list of projects, filtering out nulls.
 * Deduplication (e.g. by projectId) is the caller's responsibility.
 */
export function generateRenameCandidates(projects: Project[]): RenameCandidate[] {
  const results: RenameCandidate[] = [];
  for (const project of projects) {
    const candidate = generateRenameCandidate(project);
    if (candidate !== null) {
      results.push(candidate);
    }
  }
  return results;
}
