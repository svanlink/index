import type { StartupSyncResult, SyncState } from "@drive-project-catalog/data";

export function isSyncEnabled(syncState: SyncState) {
  return syncState.mode !== "local-only";
}

export function getSyncStatusLabel(syncState: SyncState) {
  if (!isSyncEnabled(syncState)) {
    return "Sync disabled";
  }
  if (syncState.syncInProgress) {
    return "Sync in progress";
  }
  if (syncState.failedCount > 0) {
    return "Retry needed";
  }
  if (syncState.lastSyncError) {
    return "Sync issue";
  }
  if (syncState.lastPushAt || syncState.lastPullAt) {
    return "Synced";
  }

  return "Ready to sync";
}

export function getSyncStatusTone(syncState: SyncState): "success" | "warning" | "error" | "info" {
  if (!isSyncEnabled(syncState)) {
    return "info";
  }
  if (syncState.failedCount > 0 || syncState.lastSyncError) {
    return "error";
  }
  if (syncState.pendingCount > 0) {
    return "warning";
  }

  return "success";
}

export function getSyncSummaryMessages(syncState: SyncState) {
  const messages: string[] = [];

  if (!isSyncEnabled(syncState)) {
    messages.push("Supabase sync is disabled because no sync configuration is available in this app build.");
    return messages;
  }

  if (syncState.syncInProgress) {
    messages.push("A sync cycle is currently running. Additional manual triggers are disabled until it completes.");
  }

  if (syncState.failedCount > 0) {
    messages.push(`${syncState.failedCount} queued change${syncState.failedCount === 1 ? "" : "s"} failed to push and can be retried safely.`);
  }

  if (syncState.pendingCount > 0) {
    messages.push(`${syncState.pendingCount} local change${syncState.pendingCount === 1 ? "" : "s"} are waiting to be pushed.`);
  }

  if (syncState.lastSyncError) {
    messages.push(syncState.lastSyncError);
  }

  if (messages.length === 0) {
    messages.push("Local data is ready for manual sync and no failed queue items are currently blocking transport.");
  }

  return messages;
}

export function getStartupSyncMessage(startupSyncResult: StartupSyncResult | null) {
  if (!startupSyncResult) {
    return null;
  }

  return startupSyncResult.message;
}

export function formatSyncTimestamp(value: string | null) {
  if (!value) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
