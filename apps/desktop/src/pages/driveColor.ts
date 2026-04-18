/**
 * Picks a stable CSS variable from the 6-hue drive palette for a given drive
 * id. The palette lives in globals.css as --drive-a…--drive-f and is muted
 * enough to read quietly next to the UI accent. Hashing drive.id (instead of
 * e.g. array index) means the color survives re-ordering and filtering, so a
 * drive that's "sage" today stays "sage" after the user renames or removes
 * another drive.
 */
const PALETTE = [
  "var(--drive-a)",
  "var(--drive-b)",
  "var(--drive-c)",
  "var(--drive-d)",
  "var(--drive-e)",
  "var(--drive-f)"
] as const;

export function getDriveColor(driveId: string | null | undefined): string {
  if (!driveId) return "var(--ink-3)";
  // Deterministic, tiny hash — good enough for 6-bucket distribution.
  let hash = 0;
  for (let i = 0; i < driveId.length; i++) {
    hash = (hash * 31 + driveId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}
