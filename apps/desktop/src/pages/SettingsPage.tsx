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
import { getRuntimeEnvironmentDiagnostics, getSupabaseSyncDiagnostics } from "../app/syncConfig";

export function SettingsPage() {
  const {
    syncState,
    syncNow,
    isSyncing,
    startupSyncResult,
    reclassifyLegacyFolderTypes,
    isMutating
  } = useCatalogStore();
  const [feedback, setFeedback] = useState<{
    tone: "success" | "warning" | "error" | "info";
    title: string;
    messages: string[];
  } | null>(null);
  const [reclassifyFeedback, setReclassifyFeedback] = useState<{
    tone: "success" | "warning" | "error" | "info";
    title: string;
    messages: string[];
  } | null>(null);
  const [isReclassifying, setIsReclassifying] = useState(false);

  const enabled = isSyncEnabled(syncState);
  const summaryMessages = useMemo(() => getSyncSummaryMessages(syncState), [syncState]);
  const startupMessage = useMemo(() => getStartupSyncMessage(startupSyncResult), [startupSyncResult]);
  const startupTone = useMemo(() => getStartupSyncTone(startupSyncResult), [startupSyncResult]);
  const configDiagnostics = useMemo(() => getSupabaseSyncDiagnostics(), []);
  const runtimeDiagnostics = useMemo(() => getRuntimeEnvironmentDiagnostics(), []);

  async function handleReclassify() {
    setReclassifyFeedback(null);
    setIsReclassifying(true);
    try {
      const result = await reclassifyLegacyFolderTypes();
      const upgraded = result.clientReclassifiedCount + result.personalProjectReclassifiedCount;
      if (result.examinedCount === 0) {
        setReclassifyFeedback({
          tone: "info",
          title: "No legacy folder types to reclassify",
          messages: [
            "All non-manual projects are already classified as client or personal_project.",
            "This action only examines rows currently stored as personal_folder."
          ]
        });
      } else if (upgraded === 0) {
        setReclassifyFeedback({
          tone: "info",
          title: "Reclassify complete — no upgrades",
          messages: [
            `Examined ${result.examinedCount} personal_folder row${result.examinedCount === 1 ? "" : "s"}.`,
            "The classifier agreed all of them should remain personal_folder."
          ]
        });
      } else {
        setReclassifyFeedback({
          tone: "success",
          title: "Reclassify complete",
          messages: [
            `Examined ${result.examinedCount} personal_folder row${result.examinedCount === 1 ? "" : "s"}.`,
            `Upgraded ${result.clientReclassifiedCount} to client and ${result.personalProjectReclassifiedCount} to personal_project.`,
            `${result.unchangedCount} row${result.unchangedCount === 1 ? "" : "s"} left unchanged.`
          ]
        });
      }
    } catch (error) {
      setReclassifyFeedback({
        tone: "error",
        title: "Reclassify failed",
        messages: [error instanceof Error ? error.message : "The reclassify action did not complete."]
      });
    } finally {
      setIsReclassifying(false);
    }
  }

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

      <SectionCard
        title="Legacy folder type recovery"
        description="One-shot maintenance action that re-runs the folder classifier against existing projects still stored as personal_folder. Useful for projects imported before the classifier was refined — for example, rows left over from the early blanket-assignment migration. The action never downgrades structured projects and never touches manually created entries."
        action={
          <button
            type="button"
            className="button-success"
            disabled={isReclassifying || isMutating}
            onClick={() => void handleReclassify()}
          >
            {isReclassifying ? "Reclassifying..." : "Reclassify legacy folder types"}
          </button>
        }
      >
        <div className="space-y-4">
          <FeedbackNotice
            tone="info"
            title="What this does"
            messages={[
              "Examines every non-manual project currently stored as personal_folder.",
              "Upgrades rows whose folder name matches the YYMMDD_Client_Project pattern to client or personal_project.",
              "Skips manually created projects and never changes structured rows that are already client or personal_project."
            ]}
          />
          {reclassifyFeedback ? (
            <FeedbackNotice
              tone={reclassifyFeedback.tone}
              title={reclassifyFeedback.title}
              messages={reclassifyFeedback.messages}
            />
          ) : null}
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
              "Current release strategy: unsigned desktop for local/personal use, web deployment for the free public release path.",
              "Use the README and WEB_RELEASE guides to confirm environment variables, deployment expectations, and desktop-only runtime behavior."
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
    <div>
      <p className="text-[11px] font-medium" style={{ color: "var(--color-text-soft)" }}>{label}</p>
      <p className="mt-0.5 text-[14px] font-semibold" style={{ color: "var(--color-text)" }}>{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium" style={{ color: "var(--color-text-soft)" }}>{label}</p>
      <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-muted)" }}>{value}</p>
    </div>
  );
}
