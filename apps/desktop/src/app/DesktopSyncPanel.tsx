import { useMemo, useState } from "react";
import { FeedbackNotice } from "../pages/pagePrimitives";
import { useCatalogStore } from "./providers";
import {
  formatSyncTimestamp,
  getStartupSyncMessage,
  getStartupSyncTone,
  getSyncStatusLabel,
  getSyncStatusTone,
  getSyncSummaryMessages,
  isSyncEnabled
} from "./syncHelpers";
import { getRuntimeEnvironmentDiagnostics, getSupabaseSyncDiagnostics } from "./syncConfig";

export function DesktopSyncPanel() {
  const { syncState, syncNow, isSyncing, startupSyncResult } = useCatalogStore();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error" | "info";
    title: string;
    messages: string[];
  } | null>(null);

  const enabled = isSyncEnabled(syncState);
  const hasFailures = syncState.failedCount > 0;
  const actionLabel = isSyncing ? "Syncing..." : hasFailures ? "Retry sync" : "Sync now";
  const summaryMessages = useMemo(() => getSyncSummaryMessages(syncState), [syncState]);
  const startupMessage = useMemo(() => getStartupSyncMessage(startupSyncResult), [startupSyncResult]);
  const startupTone = useMemo(() => getStartupSyncTone(startupSyncResult), [startupSyncResult]);
  const configDiagnostics = useMemo(() => getSupabaseSyncDiagnostics(), []);
  const runtimeDiagnostics = useMemo(() => getRuntimeEnvironmentDiagnostics(), []);

  async function handleSync() {
    setFeedback(null);

    try {
      const result = await syncNow();
      const hasError = Boolean(result.state.lastSyncError);
      setFeedback({
        tone: hasError ? "warning" : "success",
        title: hasError ? "Sync completed with issues" : "Sync complete",
        messages: hasError
          ? [result.state.lastSyncError ?? "Some sync items still need attention."]
          : [
              `${result.pushed} change${result.pushed === 1 ? "" : "s"} pushed to Supabase.`,
              `${result.pulled} remote change${result.pulled === 1 ? "" : "s"} merged locally.`
            ]
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Sync failed",
        messages: [error instanceof Error ? error.message : "The manual sync cycle failed."]
      });
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" className="button-secondary min-w-[104px]" onClick={() => setIsPanelOpen(true)}>
          {getSyncStatusLabel(syncState)}
        </button>
      </div>

      {isPanelOpen ? (
        <div className="fixed inset-0 z-40 flex items-start justify-end bg-[rgba(22,22,20,0.16)] px-4 py-4">
          <aside className="w-full max-w-[420px] rounded-lg border p-6 " style={{ borderColor: "var(--color-border)", background: "var(--color-surface-elevated)" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>
                  Cloud sync
                </p>
                <h3 className="mt-2 text-[24px] font-semibold" style={{ color: "var(--color-text)" }}>
                  Manual sync status
                </h3>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
                  Review queue health, recent cloud activity, and retry failed sync work without leaving the app.
                </p>
              </div>
              <button type="button" className="button-secondary" onClick={() => setIsPanelOpen(false)}>
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <Metric label="Sync mode" value={enabled ? "Enabled" : "Disabled"} />
              <Metric label="Current state" value={getSyncStatusLabel(syncState)} />
              <Metric label="Pending queue" value={String(syncState.pendingCount)} />
              <Metric label="Failed queue" value={String(syncState.failedCount)} />
              <Metric label="Last push" value={formatSyncTimestamp(syncState.lastPushAt)} />
              <Metric label="Last pull" value={formatSyncTimestamp(syncState.lastPullAt)} />
            </div>

            <div className="mt-5">
              <FeedbackNotice
                tone={getSyncStatusTone(syncState)}
                title={enabled ? "Sync health" : "Sync unavailable"}
                messages={summaryMessages}
              />
            </div>

            {!enabled ? (
              <div className="mt-4">
                <FeedbackNotice tone="info" title="Sync configuration" messages={[configDiagnostics.message, ...configDiagnostics.details]} />
              </div>
            ) : null}

            {startupMessage ? (
              <div className="mt-4">
                <FeedbackNotice
                  tone={startupTone}
                  title="Startup sync"
                  messages={[startupMessage]}
                />
              </div>
            ) : null}

            {feedback ? (
              <div className="mt-4">
                <FeedbackNotice tone={feedback.tone} title={feedback.title} messages={feedback.messages} />
              </div>
            ) : null}

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                className={hasFailures ? "button-danger" : "button-success"}
                onClick={() => void handleSync()}
                disabled={!enabled || isSyncing}
              >
                {actionLabel}
              </button>
              {syncState.lastSyncError ? (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  Last issue saved for retry visibility.
                </p>
              ) : null}
            </div>

            <div className="mt-4">
              <p className="text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
                {runtimeDiagnostics.message}
              </p>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>
        {label}
      </p>
      <p className="mt-2 text-base font-semibold" style={{ color: "var(--color-text)" }}>
        {value}
      </p>
    </div>
  );
}
