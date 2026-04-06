import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ScanSessionSnapshot, ScanStartRequest, ScanStartResponse } from "@drive-project-catalog/domain";

export function isDesktopScanAvailable() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function startDesktopScan(request: ScanStartRequest) {
  if (!isDesktopScanAvailable()) {
    throw new Error("Desktop scan commands are only available in the Tauri desktop app.");
  }

  try {
    return await invoke<ScanStartResponse>("start_scan", { request });
  } catch (error) {
    throw new Error(normalizeScanCommandError("start", error));
  }
}

export async function cancelDesktopScan(scanId: string) {
  if (!isDesktopScanAvailable()) {
    throw new Error("Desktop scan cancellation is only available in the Tauri desktop app.");
  }

  try {
    return await invoke<ScanSessionSnapshot>("cancel_scan", { scanId });
  } catch (error) {
    throw new Error(normalizeScanCommandError("cancel", error));
  }
}

export async function getDesktopScanSnapshot(scanId: string) {
  if (!isDesktopScanAvailable()) {
    throw new Error("Desktop scan state is only available in the Tauri desktop app.");
  }

  try {
    return await invoke<ScanSessionSnapshot>("get_scan_snapshot", { scanId });
  } catch (error) {
    throw new Error(normalizeScanCommandError("snapshot", error));
  }
}

export async function listDesktopScanSnapshots() {
  if (!isDesktopScanAvailable()) {
    throw new Error("Desktop scan state is only available in the Tauri desktop app.");
  }

  try {
    return await invoke<ScanSessionSnapshot[]>("list_scan_snapshots");
  } catch (error) {
    throw new Error(normalizeScanCommandError("list", error));
  }
}

export async function pickDesktopScanDirectory(defaultPath?: string | null) {
  if (!isDesktopScanAvailable()) {
    throw new Error("The native folder picker is only available inside the Tauri desktop app.");
  }

  const selection = await open({
    directory: true,
    multiple: false,
    defaultPath: defaultPath ?? undefined,
    title: "Choose a drive or folder to scan"
  });

  return typeof selection === "string" ? selection : null;
}

function normalizeScanCommandError(action: "start" | "cancel" | "snapshot" | "list", error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("desktop scan commands are only available")) {
    return message;
  }
  if (
    normalized.includes("no such file") ||
    normalized.includes("not found") ||
    normalized.includes("invalid path") ||
    normalized.includes("not a directory") ||
    normalized.includes("permission denied") ||
    normalized.includes("operation not permitted")
  ) {
    return "The selected scan path could not be opened. Check that the drive or folder exists, is mounted, and is readable by the app.";
  }
  if (normalized.includes("channel closed") || normalized.includes("failed to fetch") || normalized.includes("not available")) {
    return "The desktop scan command is unavailable right now. Reopen the desktop app and try again.";
  }

  if (action === "cancel") {
    return `The desktop scan could not be cancelled: ${message}`;
  }
  if (action === "start") {
    return `The desktop scan could not start: ${message}`;
  }
  if (action === "snapshot") {
    return `The desktop scan progress could not be loaded: ${message}`;
  }

  return `Desktop scan sessions could not be loaded: ${message}`;
}
