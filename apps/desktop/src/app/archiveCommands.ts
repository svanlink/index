import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

/**
 * Result returned by the Rust `archive_project` command. Mirrors
 * `archive_engine::ArchiveResult` — keep the two type definitions in sync.
 */
export interface ArchiveResult {
  originalPath: string;
  archivedPath: string;
  manifestPath: string;
  totalFiles: number;
  totalBytes: number;
  locked: boolean;
}

export interface ArchiveProjectInput {
  folderPath: string;
  archiveRoot: string;
  /** Default true — sets `chflags uchg` on the destination tree. */
  lockAfterArchive?: boolean;
}

/**
 * Hashes every file in `folderPath`, writes a `.archive-manifest.json`,
 * moves the folder to `archiveRoot`, and (by default) marks the result
 * immutable via `chflags -R uchg`. Long-running for large folders —
 * surface a progress UI and disable navigation while it runs.
 */
export async function archiveProject(input: ArchiveProjectInput): Promise<ArchiveResult> {
  return invoke<ArchiveResult>("archive_project", {
    folderPath: input.folderPath,
    archiveRoot: input.archiveRoot,
    lockAfterArchive: input.lockAfterArchive ?? true
  });
}

/** Clears the immutable flag on a previously archived folder. */
export async function unlockArchive(folderPath: string): Promise<void> {
  await invoke<void>("unlock_archive", { folderPath });
}

/**
 * Native folder picker for selecting the archive root drive.
 * Returns `null` when the user cancels.
 */
export async function pickArchiveRoot(defaultPath?: string): Promise<string | null> {
  const result = await open({
    directory: true,
    multiple: false,
    title: "Choose archive destination",
    defaultPath
  });
  if (result == null) return null;
  return Array.isArray(result) ? (result[0] ?? null) : result;
}
