import { useMemo, useState } from "react";
import { PageHeader } from "@drive-project-catalog/ui";
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
import { getRuntimeEnvironmentDiagnostics, getSupabaseSyncDiagnostics } from "../app/syncConfig";

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
  const configDiagnostics = useMemo(() => getSupabaseSyncDiagnostics(), []);
  const runtimeDiagnostics = useMemo(() => getRuntimeEnvironmentDiagnostics(), []);

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
      <PageHeader
        eyebrow="Settings"
        title="Sync and local environment"
        description="Review whether cloud transport is enabled, inspect queue health, and manually run or retry sync without changing the current offline-first workflow."
      />

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

      <SectionCard
        title="Release diagnostics"
        description="Lightweight environment and packaging checks for first-run confidence, local support triage, and desktop shipping sanity."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <InfoRow label="Runtime" value={runtimeDiagnostics.message} />
          <InfoRow label="Sync config" value={configDiagnostics.message} />
        </div>
        <div className="mt-4 space-y-4">
          <FeedbackNotice
            tone={configDiagnostics.enabled ? "success" : configDiagnostics.code === "missing" ? "info" : "warning"}
            title="Configuration details"
            messages={configDiagnostics.details}
          />
          <FeedbackNotice
            tone="info"
            title="Packaging notes"
            messages={[
              "The Tauri bundle is configured for desktop packaging with a product name, identifier, and icon asset.",
              "Use the README release checklist before shipping a build to confirm environment variables, app packaging, and desktop runtime behavior."
            ]}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Persistence foundation"
        description="The catalog remains fully local-first even when sync is enabled. Local SQLite stays authoritative for daily work, and manual sync only exchanges queued changes with the configured remote transport."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <InfoRow
            label="Offline behavior"
            value="All project, drive, scan, and planning workflows continue to work locally when cloud sync is unavailable."
          />
          <InfoRow
            label="Retry behavior"
            value="Failed sync items remain queued with error metadata so they can be retried safely on the next manual sync."
          />
        </div>
      </SectionCard>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border px-4 py-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-subtle)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>
        {label}
      </p>
      <p className="mt-2 text-base font-semibold" style={{ color: "var(--color-text)" }}>
        {value}
      </p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border px-4 py-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>
        {label}
      </p>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
        {value}
      </p>
    </div>
  );
}
