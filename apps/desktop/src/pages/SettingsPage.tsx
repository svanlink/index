import { useMemo, useState } from "react";

import { FeedbackNotice, SectionCard } from "./pagePrimitives";
import { useCatalogStore } from "../app/providers";
import {
  formatSyncTimestamp,
  getStartupSyncMessage,
  getStartupSyncTone,
  getSyncStatusLabel,
  getSyncStatusTone,
  getSyncSummaryMessages,
  isSyncEnabled
} from "../app/syncHelpers";

// ---------------------------------------------------------------------------
// SettingsPage
// ---------------------------------------------------------------------------
//
// Scope trimmed to a single responsibility: show sync state and let the user
// trigger a manual sync. Previous sections ("Legacy folder type recovery",
// "Release diagnostics", "Persistence foundation") were developer/migration
// surfaces that didn't belong in a shipped single-user product:
//   - Legacy folder recovery: one-shot migration → belongs in a dev script.
//   - Release diagnostics: env + config inspection → belongs in dev tools.
//   - Persistence foundation: pure marketing copy, no action.
// Removing them keeps Settings focused on what the user can actually do.
// ---------------------------------------------------------------------------

export function SettingsPage() {
  const { syncState, syncNow, isSyncing, startupSyncResult } = useCatalogStore();
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error" | "info";
    title: string;
    messages: string[];
  } | null>(null);

  const enabled = isSyncEnabled(syncState);
  const summaryMessages = useMemo(() => getSyncSummaryMessages(syncState), [syncState]);
  const startupMessage = useMemo(() => getStartupSyncMessage(startupSyncResult), [startupSyncResult]);
  const startupTone = useMemo(() => getStartupSyncTone(startupSyncResult), [startupSyncResult]);

  async function handleSync() {
    setFeedback(null);

    try {
      const result = await syncNow();
      const hasError = Boolean(result.state.lastSyncError);
      setFeedback({
        tone: hasError ? "warning" : "success",
        title: hasError ? "Manual sync completed with issues" : "Manual sync completed",
        messages: hasError
          ? [result.state.lastSyncError ?? "Some queue items still need retry."]
          : [
              `${result.pushed} queued change${result.pushed === 1 ? "" : "s"} pushed successfully.`,
              `${result.pulled} remote record${result.pulled === 1 ? "" : "s"} merged into the local catalog.`
            ]
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Manual sync failed",
        messages: [error instanceof Error ? error.message : "The sync cycle did not complete."]
      });
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Sync status"
        description="This surface reflects the current Supabase transport state from the local repository and queue."
        action={
          <button
            type="button"
            className={syncState.failedCount > 0 ? "button-danger" : "button-success"}
            disabled={!enabled || isSyncing}
            onClick={() => void handleSync()}
          >
            {isSyncing ? "Syncing..." : syncState.failedCount > 0 ? "Retry sync" : "Sync now"}
          </button>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Metric label="Sync enabled" value={enabled ? "Yes" : "No"} />
          <Metric label="Current state" value={getSyncStatusLabel(syncState)} />
          <Metric label="Queue pending" value={String(syncState.pendingCount)} />
          <Metric label="Queue failed" value={String(syncState.failedCount)} />
          <Metric label="Last push" value={formatSyncTimestamp(syncState.lastPushAt)} />
          <Metric label="Last pull" value={formatSyncTimestamp(syncState.lastPullAt)} />
        </div>

        <div className="mt-6 space-y-4">
          <FeedbackNotice
            tone={getSyncStatusTone(syncState)}
            title={enabled ? "Transport summary" : "Transport disabled"}
            messages={summaryMessages}
          />

          {startupMessage ? (
            <FeedbackNotice
              tone={startupTone}
              title="Startup sync"
              messages={[startupMessage]}
            />
          ) : null}

          {feedback ? <FeedbackNotice tone={feedback.tone} title={feedback.title} messages={feedback.messages} /> : null}
        </div>
      </SectionCard>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium" style={{ color: "var(--color-text-soft)" }}>{label}</p>
      <p className="mt-0.5 text-[14px] font-semibold" style={{ color: "var(--color-text)" }}>{value}</p>
    </div>
  );
}
