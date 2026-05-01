import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Payload emitted by the Rust `volume_watcher` module when a new drive
 * appears in `/Volumes`. The Rust side serialises camelCase via
 * `#[serde(rename_all = "camelCase")]`.
 */
interface VolumeMountEvent {
  volumeName: string;
  volumePath: string;
  folderCount: number;
  detectedAt: string;
}

function isTauriRuntimeAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Listens for `volume-mounted` events from the Rust volume watcher and
 * navigates to the import flow with the drive's volume path pre-filled.
 *
 * The watcher also fires a native macOS notification — clicking that
 * notification raises the app, at which point this listener can route
 * the user to the right page via the URL query string.
 *
 * Mount this hook ONCE in `RootLayout`. Re-mounting would create
 * duplicate listeners and double-fire on every event.
 */
export function useVolumeMountedListener(): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) {
      return;
    }

    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    void (async () => {
      try {
        unlisten = await listen<VolumeMountEvent>("volume-mounted", (event) => {
          const { volumeName, volumePath, folderCount } = event.payload;
          // eslint-disable-next-line no-console
          console.info(
            `[volume-mounted] ${volumeName} at ${volumePath} (${folderCount} folders)`
          );

          // Route to the Drives page with the new volume path so the
          // import workflow can take over. The query params are advisory —
          // the page can choose to auto-open the import drawer or show a
          // contextual notice.
          const params = new URLSearchParams({
            mountedVolume: volumeName,
            mountedPath: volumePath,
            folderCount: String(folderCount)
          });
          navigate(`/drives?${params.toString()}`);
        });
        if (cancelled) {
          unlisten();
          unlisten = null;
        }
      } catch (e) {
        // Swallow registration failures so the app can still boot if the
        // native event bridge is temporarily unavailable.
        // eslint-disable-next-line no-console
        console.warn("[volume-mounted] listener registration skipped", e);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [navigate]);
}
