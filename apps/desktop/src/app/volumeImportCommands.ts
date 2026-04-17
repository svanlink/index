import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { isDesktopScanAvailable } from "./scanCommands";

/**
 * One folder returned by the Rust `enumerate_volume_folders` command.
 *
 * The shape mirrors the Rust `VolumeFolderEntry` struct. `path` is the
 * absolute on-disk path — it becomes the stored `folderPath` on the imported
 * Project and is the stable key the repository dedups on.
 */
export interface VolumeFolderEntry {
  name: string;
  path: string;
}

/**
 * Open the native directory picker to select a volume (or any folder) whose
 * top-level children the user wants to import. Returns `null` if the user
 * cancels the dialog.
 *
 * The `defaultPath` seed spares the user from navigating to `/Volumes/<name>`
 * on a drive they've already scanned or imported from before. It is only a
 * starting hint — the user can navigate anywhere they can read.
 */
export async function pickVolumeRoot(defaultPath?: string | null): Promise<string | null> {
  if (!isDesktopScanAvailable()) {
    throw new Error("The native folder picker is only available inside the Tauri desktop app.");
  }

  const selection = await open({
    directory: true,
    multiple: false,
    defaultPath: defaultPath ?? undefined,
    title: "Choose a volume or folder to import folders from"
  });

  return typeof selection === "string" ? selection : null;
}

/**
 * Enumerate the immediate child directories of `path`. The backend filters
 * hidden files and well-known system folders (`.Spotlight-V100`, `.Trashes`,
 * `.fseventsd`, `DCIM`, etc.), sorts results alphabetically (case-insensitive),
 * and returns absolute paths.
 *
 * Errors from the backend (missing path, not a directory, read failure) are
 * propagated as `Error`s so the caller can surface them through the shared
 * `FeedbackNotice` path. The message text is already user-facing.
 */
export async function enumerateVolumeFolders(path: string): Promise<VolumeFolderEntry[]> {
  if (!isDesktopScanAvailable()) {
    throw new Error("Folder enumeration is only available inside the Tauri desktop app.");
  }

  try {
    return await invoke<VolumeFolderEntry[]>("enumerate_volume_folders", { path });
  } catch (error) {
    throw new Error(normalizeEnumerateError(error));
  }
}

function normalizeEnumerateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("not available") ||
    normalized.includes("no such file") ||
    normalized.includes("not found") ||
    normalized.includes("not a directory")
  ) {
    // The Rust layer already crafts a user-facing message for the
    // disconnected / wrong-type cases — pass it through unchanged so the
    // reconnection hint survives.
    return message;
  }

  if (normalized.includes("permission denied") || normalized.includes("operation not permitted")) {
    return "The selected folder is not readable by the app. Check macOS privacy settings (Full Disk Access) and try again.";
  }

  if (normalized.includes("channel closed") || normalized.includes("failed to fetch")) {
    return "The desktop command is unavailable right now. Reopen the desktop app and try again.";
  }

  return `Could not list folders in the selected location: ${message}`;
}
