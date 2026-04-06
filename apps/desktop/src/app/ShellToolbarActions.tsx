import { DesktopScanPanel } from "./DesktopScanPanel";
import { DesktopSyncPanel } from "./DesktopSyncPanel";

export function ShellToolbarActions() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DesktopSyncPanel />
      <DesktopScanPanel />
    </div>
  );
}
