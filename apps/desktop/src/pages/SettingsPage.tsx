import { useMemo, useState } from "react";

import { FeedbackNotice } from "./pagePrimitives";
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
// SettingsPage — DESIGN.md §7
//
// Settings is a focused operations surface, not a dashboard. Three things the
// user actually needs:
//   1. Current sync status (one line, state dot + label + mode).
//   2. The four meta values (pending, failed, last push, last pull).
//   3. One primary action (Sync now / Retry).
//
// Anything else stacks as a single prioritised FeedbackNotice so the page
// does not fan out into three overlapping messages.
// ---------------------------------------------------------------------------

type NoticeTone = "success" | "warning" | "error" | "info";

export function SettingsPage() {
  const { syncState, syncNow, isSyncing, startupSyncResult } = useCatalogStore();
  const [feedback, setFeedback] = useState<{
    tone: NoticeTone;
    title: string;
    messages: string[];
  } | null>(null);

  const enabled = isSyncEnabled(syncState);
  const summaryMessages = useMemo(() => getSyncSummaryMessages(syncState), [syncState]);
  const startupMessage = useMemo(
    () => getStartupSyncMessage(startupSyncResult),
    [startupSyncResult]
  );
  const startupTone = useMemo(() => getStartupSyncTone(startupSyncResult), [startupSyncResult]);
  const summaryTone = getSyncStatusTone(syncState);
  const syncStatusLabel = enabled ? getSyncStatusLabel(syncState) : "Sync disabled";

  const activeNotice = resolveActiveNotice({
    feedback,
    startupMessage,
    startupTone,
    enabled,
    summaryMessages,
    summaryTone
  });

  async function handleSync() {
    setFeedback(null);
    try {
      const result = await syncNow();
      const hasError = Boolean(result.state.lastSyncError);
      setFeedback({
        tone: hasError ? "warning" : "success",
        title: hasError ? "Sync completed with issues" : "Sync completed",
        messages: hasError
          ? [result.state.lastSyncError ?? "Some queue items still need retry."]
          : [
              `${result.pushed} queued change${result.pushed === 1 ? "" : "s"} pushed.`,
              `${result.pulled} remote record${result.pulled === 1 ? "" : "s"} merged.`
            ]
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Sync failed",
        messages: [
          error instanceof Error ? error.message : "The sync cycle did not complete."
        ]
      });
    }
  }

  const stateDotColor = !enabled
    ? "var(--ink-4)"
    : syncState.failedCount > 0
      ? "var(--danger)"
      : syncState.pendingCount > 0
        ? "var(--warn)"
        : "var(--ok)";

  const primaryActionClass =
    !enabled
      ? "btn"
      : syncState.failedCount > 0
        ? "btn btn-danger"
        : "btn btn-primary";

  return (
    <div className="space-y-8 pt-1">
      {/* Sync status line — the single clearest answer to "is sync OK?".
          State dot + label + mode, no tile, no pill, no uppercase chip. */}
      <section className="flex items-center gap-3 pb-6" style={{ borderBottom: "1px solid var(--hairline)" }}>
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: stateDotColor }}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-medium" style={{ color: "var(--ink)" }}>
            {syncStatusLabel}
          </div>
          <div className="mt-0.5 text-[14px]" style={{ color: "var(--ink-3)" }}>
            {enabled ? "Remote sync enabled" : "Local-only mode"}
          </div>
        </div>
        <button
          type="button"
          className={primaryActionClass}
          disabled={!enabled || isSyncing}
          onClick={() => void handleSync()}
        >
          {isSyncing ? "Syncing…" : syncState.failedCount > 0 ? "Retry sync" : "Sync now"}
        </button>
      </section>

      {/* Detail — four meta values as label/value rows. No grid of tiles. */}
      <section>
        <h2 className="h-section" style={{ marginBottom: 12 }}>
          Detail
        </h2>
        <dl className="grid gap-y-2" style={{ gridTemplateColumns: "minmax(160px, max-content) 1fr" }}>
          <MetaField label="Queue pending" value={String(syncState.pendingCount)} />
          <MetaField
            label="Queue failed"
            value={String(syncState.failedCount)}
            tone={syncState.failedCount > 0 ? "danger" : undefined}
          />
          <MetaField label="Last push" value={formatSyncTimestamp(syncState.lastPushAt)} />
          <MetaField label="Last pull" value={formatSyncTimestamp(syncState.lastPullAt)} />
        </dl>
      </section>

      {activeNotice ? (
        <section>
          <FeedbackNotice
            tone={activeNotice.tone}
            title={activeNotice.title}
            messages={activeNotice.messages}
          />
        </section>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetaField — label on the left, value on the right. 14/500 label in ink-3,
// 14/400 value in ink (or danger when flagged). No uppercase tracking.
// ---------------------------------------------------------------------------

function MetaField({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "danger";
}) {
  return (
    <>
      <dt className="text-[14px]" style={{ color: "var(--ink-3)" }}>
        {label}
      </dt>
      <dd
        className="tnum text-[14px]"
        style={{
          color: tone === "danger" ? "var(--danger)" : "var(--ink)",
          margin: 0
        }}
      >
        {value}
      </dd>
    </>
  );
}

// ---------------------------------------------------------------------------
// Notice resolution — one notice at most, prioritised.
// ---------------------------------------------------------------------------

interface NoticeSource {
  feedback: { tone: NoticeTone; title: string; messages: string[] } | null;
  startupMessage: string | null;
  startupTone: NoticeTone;
  enabled: boolean;
  summaryMessages: string[];
  summaryTone: NoticeTone;
}

function resolveActiveNotice(
  source: NoticeSource
): { tone: NoticeTone; title: string; messages: string[] } | null {
  if (source.feedback) return source.feedback;

  if (source.startupMessage && source.startupTone !== "success") {
    return {
      tone: source.startupTone,
      title: "Startup sync",
      messages: [source.startupMessage]
    };
  }

  // Only surface a summary when disabled or when there is something non-trivial
  // to report — the "everything is fine" summary would just be noise.
  if (!source.enabled) {
    return {
      tone: source.summaryTone,
      title: "Transport disabled",
      messages: source.summaryMessages
    };
  }

  if (source.summaryMessages.length > 0 && source.summaryTone !== "success") {
    return {
      tone: source.summaryTone,
      title: "Transport summary",
      messages: source.summaryMessages
    };
  }

  return null;
}
