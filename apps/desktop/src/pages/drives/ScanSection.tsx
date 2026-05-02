import type { ScanSessionSnapshot } from "@drive-project-catalog/domain";
import { FeedbackNotice, SectionCard } from "../pagePrimitives";
import { ScanStatusPanel } from "./ScanStatusPanel";

export interface ScanSectionProps {
  scanSummary: ScanSessionSnapshot | null;
  activeSession: ScanSessionSnapshot | null;
  draftRootPath: string;
  setDraftRootPath: (path: string) => void;
  isScanAvailable: boolean;
  isPickingDirectory: boolean;
  canStartScan: boolean;
  scanPlaceholder: string;
  scanError: string | null;
  chooseDirectory: () => Promise<void>;
  startScan: () => Promise<void>;
  cancelScan: () => Promise<void>;
}

export function ScanSection({
  scanSummary,
  activeSession,
  draftRootPath,
  setDraftRootPath,
  isScanAvailable,
  isPickingDirectory,
  canStartScan,
  scanPlaceholder,
  scanError,
  chooseDirectory,
  startScan,
  cancelScan,
}: ScanSectionProps) {
  return (
    <SectionCard
      title="Scan drive"
      description="Index this drive's folder structure into the catalog. Runs locally — nothing leaves your machine."
      action={
        <div className="flex gap-2">
          {activeSession ? (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => void cancelScan()}>
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => void startScan()}
            disabled={!canStartScan}
          >
            {activeSession ? "Scan running" : "Start scan"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            value={draftRootPath}
            onChange={(event) => setDraftRootPath(event.target.value)}
            className="field-shell min-w-0 flex-1 bg-transparent px-3 py-2.5 outline-none"
            placeholder={scanPlaceholder}
            disabled={Boolean(activeSession)}
            aria-label="Scan target path"
          />
          <button
            type="button"
            className="btn btn-sm shrink-0"
            onClick={() => void chooseDirectory()}
            disabled={!isScanAvailable || isPickingDirectory || Boolean(activeSession)}
          >
            {isPickingDirectory ? "Opening…" : "Browse"}
          </button>
        </div>

        {!isScanAvailable ? (
          <FeedbackNotice
            tone="warning"
            title="Desktop scan only"
            messages={["Scans require the native desktop app. Persisted state is visible here, but starting a scan needs the Tauri shell."]}
          />
        ) : null}
        {scanError ? (
          <FeedbackNotice tone="error" title="Scan error" messages={[scanError]} />
        ) : null}

        {scanSummary ? (
          <ScanStatusPanel scanSummary={scanSummary} isRunning={Boolean(activeSession)} />
        ) : null}
      </div>
    </SectionCard>
  );
}
