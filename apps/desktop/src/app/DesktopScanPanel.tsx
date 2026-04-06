import { getScanStatusLabel, getScanStatusMessage } from "@drive-project-catalog/data";
import { formatDate } from "../pages/dashboardHelpers";
import { useCatalogStore } from "./providers";
import { useScanWorkflow } from "./scanWorkflow";

function formatDuration(durationMs: number | null | undefined) {
  if (!durationMs || durationMs < 0) {
    return "In progress";
  }

  return `${Math.round(durationMs / 1000)} sec`;
}

export function DesktopScanPanel() {
  const { drives } = useCatalogStore();
  const {
    isDesktopScanAvailable,
    isPanelOpen,
    draftRootPath,
    selectedDriveId,
    isPickingDirectory,
    activeSession,
    latestCompletedSession,
    latestTerminalSession,
    lastError,
    closePanel,
    openPanel,
    setDraftRootPath,
    setSelectedDriveId,
    chooseDirectory,
    startScan,
    cancelScan
  } = useScanWorkflow();

  const summarySession = activeSession ?? latestTerminalSession ?? latestCompletedSession;

  return (
    <>
      <button type="button" className="button-secondary min-w-[116px]" onClick={openPanel}>
        {activeSession ? "Scan running" : "Scan drive"}
      </button>

      {isPanelOpen ? (
        <div className="fixed inset-0 z-40 flex items-start justify-end bg-[rgba(22,22,20,0.16)] px-4 py-4">
          <aside className="w-full max-w-[440px] rounded-[24px] border p-6 shadow-xl" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-elevated)" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>
                  Desktop scan
                </p>
                <h3 className="mt-2 text-[24px] font-semibold" style={{ color: "var(--color-text)" }}>
                  Manual scan workflow
                </h3>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
                  Start a manual scan against a drive path, track progress live, and ingest results into the local catalog.
                </p>
              </div>
              <button type="button" className="button-secondary" onClick={closePanel}>
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-text-soft)" }}>
                  Existing drive
                </span>
                <select
                  value={selectedDriveId}
                  onChange={(event) => setSelectedDriveId(event.target.value)}
                  className="field-shell w-full bg-transparent px-4 py-3 outline-none"
                >
                  <option value="">Auto-match by scanned drive name</option>
                  {drives.map((drive) => (
                    <option key={drive.id} value={drive.id}>
                      {drive.displayName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-text-soft)" }}>
                  Scan target path
                </span>
                <div className="flex gap-2">
                  <input
                    value={draftRootPath}
                    onChange={(event) => setDraftRootPath(event.target.value)}
                    className="field-shell min-w-0 flex-1 bg-transparent px-4 py-3 outline-none"
                    placeholder="/Volumes/Drive A"
                  />
                  <button type="button" className="button-secondary shrink-0" onClick={() => void chooseDirectory()} disabled={!isDesktopScanAvailable || isPickingDirectory}>
                    {isPickingDirectory ? "Opening..." : "Browse"}
                  </button>
                </div>
              </label>

              {!isDesktopScanAvailable ? (
                <p className="rounded-[18px] border px-4 py-3 text-sm" style={{ borderColor: "#ddcfb8", background: "var(--color-warning-soft)", color: "var(--color-warning)" }}>
                  Desktop scan commands are only available in the Tauri app. Browser mode can still show persisted scan state.
                </p>
              ) : null}
              {lastError ? (
                <p className="rounded-[18px] border px-4 py-3 text-sm" style={{ borderColor: "#dcc6c0", background: "var(--color-danger-soft)", color: "var(--color-danger)" }}>
                  {lastError}
                </p>
              ) : null}
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button type="button" className="button-success" onClick={() => void startScan()} disabled={Boolean(activeSession)}>
                Start scan
              </button>
              <button type="button" className="button-danger" onClick={() => void cancelScan()} disabled={!activeSession}>
                Cancel scan
              </button>
            </div>

            {summarySession ? (
              <div className="mt-6 space-y-4 rounded-[20px] border p-5" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-text-soft)" }}>
                      Session status
                    </p>
                    <p className="mt-2 text-base font-semibold capitalize" style={{ color: "var(--color-text)" }}>
                      {getScanStatusLabel(summarySession)}
                    </p>
                  </div>
                  <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                    {summarySession.requestedDriveName ?? summarySession.driveName}
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Metric label="Folders scanned" value={String(summarySession.foldersScanned)} />
                  <Metric label="Matches found" value={String(summarySession.matchesFound)} />
                  <Metric label="Size jobs pending" value={String(summarySession.sizeJobsPending)} />
                  <Metric label="Completed" value={formatDate(summarySession.finishedAt)} />
                </div>

                {summarySession.summary ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Metric label="New projects" value={String(summarySession.summary.newProjectsCount)} />
                    <Metric label="Updated projects" value={String(summarySession.summary.updatedProjectsCount)} />
                    <Metric label="Missing detected" value={String(summarySession.summary.missingProjectsCount)} />
                    <Metric label="Duplicates flagged" value={String(summarySession.summary.duplicatesFlaggedCount)} />
                    <Metric label="Duration" value={formatDuration(summarySession.summary.durationMs)} />
                  </div>
                ) : null}

                {summarySession.error ? (
                  <p className="text-sm" style={{ color: "var(--color-danger)" }}>
                    {getScanStatusMessage(summarySession)}
                  </p>
                ) : summarySession.status === "failed" || summarySession.status === "interrupted" || summarySession.status === "cancelled" ? (
                  <p className="text-sm" style={{ color: summarySession.status === "cancelled" ? "var(--color-warning)" : "var(--color-danger)" }}>
                    {getScanStatusMessage(summarySession)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border bg-white px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>{label}</p>
      <p className="mt-2 text-base font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>{value}</p>
    </div>
  );
}
