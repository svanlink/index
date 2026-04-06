import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ScanSessionSnapshot, ScanStartRequest, ScanStartResponse } from "@drive-project-catalog/domain";

export function isDesktopScanAvailable() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function startDesktopScan(request: ScanStartRequest) {
  return invoke<ScanStartResponse>("start_scan", { request });
}

export async function cancelDesktopScan(scanId: string) {
  return invoke<ScanSessionSnapshot>("cancel_scan", { scanId });
}

export async function getDesktopScanSnapshot(scanId: string) {
  return invoke<ScanSessionSnapshot>("get_scan_snapshot", { scanId });
}

export async function listDesktopScanSnapshots() {
  return invoke<ScanSessionSnapshot[]>("list_scan_snapshots");
}

export async function pickDesktopScanDirectory(defaultPath?: string | null) {
  const selection = await open({
    directory: true,
    multiple: false,
    defaultPath: defaultPath ?? undefined,
    title: "Choose a drive or folder to scan"
  });

  return typeof selection === "string" ? selection : null;
}
