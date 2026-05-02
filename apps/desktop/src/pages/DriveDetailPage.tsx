import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Project } from "@drive-project-catalog/domain";
import { getScanStatusLabel, getScanStatusMessage } from "@drive-project-catalog/data";
import { Icon } from "@drive-project-catalog/ui";

import { isDesktopScanAvailable, useVolumeInfo } from "../app/scanCommands";
import {
  enumerateVolumeFolders,
  pickVolumeRoot,
  type VolumeFolderEntry
} from "../app/volumeImportCommands";
import { showPathInFinder } from "../app/nativeContextMenu";
import { useCatalogStore } from "../app/providers";
import { useScanWorkflow } from "../app/scanWorkflow";
import { formatBytes, formatDate, formatParsedDate, getProjectName, getProjectStatusBadges } from "./dashboardHelpers";
import { useFeedbackDismiss, type FeedbackState } from "./feedbackHelpers";
import { ImportFoldersDialog } from "./ImportFoldersDialog";
import { CapacityBar, CapacityLegend, ConfirmModal, EmptyState, FeedbackNotice, LoadingState, SectionCard, StatusBadge } from "./pagePrimitives";

// ---------------------------------------------------------------------------
// DriveDetailPage — 2026 refresh
//
// The previous layout stacked: (1) a big identity card with CapacityBar + 5
// beige MetricCards, (2) a near-identical "Storage detail" section with the
// same CapacityBar + 8+ more beige MetricCards, (3) a scan section whose
// summary rendered as a 6-8 tile metric grid, (4) an import section, (5)
// three project collection grids, (6) a separate danger-zone card. It was
// dashboard-by-numbers — massive beige tile grids with no hierarchy.
//
// This rewrite keeps all the data but presents it as a focused operations
// page: one identity card, one storage-state row, one scan section with an
// inline status line, one import section, three project collections, and a
// terminal danger zone.
// ---------------------------------------------------------------------------

export function DriveDetailPage() {
  const { driveId = "" } = useParams();
  const navigate = useNavigate();
  const {
    isLoading,
    isMutating,
    getDriveDetailView,
    selectDrive,
    deleteDrive,
    importFoldersFromVolume,
    scanSessions
  } = useCatalogStore();
  const {
    isDesktopScanAvailable: isScanAvailable,
    draftRootPath,
    isPickingDirectory,
    activeSession: workflowActiveSession,
    lastError: scanError,
    setDraftRootPath,
    setSelectedDriveId,
    chooseDirectory,
    startScan,
    cancelScan
  } = useScanWorkflow();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  // Import-from-volume flow state. The three fields form a small state machine:
  //   - idle:        importSourcePath === null
  //   - enumerating: isPickingImport === true
  //   - preview:     importSourcePath !== null && importFolders !== null
  //   - importing:   isImporting === true
  const [importSourcePath, setImportSourcePath] = useState<string | null>(null);
  const [importFolders, setImportFolders] = useState<VolumeFolderEntry[] | null>(null);
  const [isPickingImport, setIsPickingImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Most recent session for this drive — drives the volume info lookup and the
  // default target path we seed into the scan form below.
  const latestSessionForDrive = useMemo(
    () =>
      scanSessions
        .filter((s) => s.requestedDriveId === driveId)
        .sort((a, b) =>
          (b.finishedAt ?? b.updatedAt ?? b.startedAt).localeCompare(
            a.finishedAt ?? a.updatedAt ?? a.startedAt
          )
        )[0] ?? null,
    [driveId, scanSessions]
  );
  const driveRootPath = latestSessionForDrive?.rootPath ?? null;
  const volumeInfo = useVolumeInfo(driveRootPath);

  // Only treat the workflow's active session as "ours" if it targets this drive.
  const activeSession =
    workflowActiveSession?.requestedDriveId === driveId ? workflowActiveSession : null;
  const scanSummary = activeSession ?? latestSessionForDrive;

  useEffect(() => {
    selectDrive(driveId || null);
    return () => {
      selectDrive(null);
    };
  }, [driveId, selectDrive]);

  useEffect(() => {
    setSelectedDriveId(driveId);
    if (!draftRootPath && driveRootPath) {
      setDraftRootPath(driveRootPath);
    }
  }, [driveId, driveRootPath, draftRootPath, setSelectedDriveId, setDraftRootPath]);

  useFeedbackDismiss(feedback, setFeedback);

  const detail = getDriveDetailView(driveId);

  const existingProjectPathsOnDrive = useMemo(() => {
    const paths = new Set<string>();
    if (!detail) return paths;
    for (const project of detail.projects) {
      if (project.folderPath) paths.add(project.folderPath);
    }
    return paths;
  }, [detail]);

  if (isLoading) {
    return <LoadingState label="Loading drive detail" />;
  }

  if (!detail) {
    return (
      <EmptyState
        title="Drive not found"
        description="The requested drive is not available in the current local catalog."
      />
    );
  }

  const { drive, projects, incomingProjects, missingProjects } = detail;

  async function handleDeleteDrive() {
    try {
      await deleteDrive(driveId);
      navigate("/drives");
    } catch (error) {
      setShowDeleteConfirm(false);
      setFeedback({
        tone: "error",
        title: "Could not delete drive",
        messages: [error instanceof Error ? error.message : "The drive could not be deleted."]
      });
    }
  }

  const importPickerDefaultPath =
    driveRootPath ?? (drive.volumeName ? `/Volumes/${drive.volumeName}` : null);

  async function runImportPicker() {
    setIsPickingImport(true);
    try {
      const selection = await pickVolumeRoot(importPickerDefaultPath);
      if (!selection) return;
      const folders = await enumerateVolumeFolders(selection);
      setImportSourcePath(selection);
      setImportFolders(folders);
    } catch (error) {
      setImportSourcePath(null);
      setImportFolders(null);
      setFeedback({
        tone: "error",
        title: "Could not read folders",
        messages: [error instanceof Error ? error.message : "The selected location could not be read."]
      });
    } finally {
      setIsPickingImport(false);
    }
  }

  function closeImportDialog() {
    setImportSourcePath(null);
    setImportFolders(null);
  }

  async function handleConfirmImport() {
    if (!importSourcePath || !importFolders) return;
    setIsImporting(true);
    try {
      const result = await importFoldersFromVolume({
        driveId,
        sourcePath: importSourcePath,
        folders: importFolders
      });
      closeImportDialog();
      if (result.importedCount === 0) {
        setFeedback({
          tone: "info",
          title: "No new folders imported",
          messages: [
            result.skippedCount > 0
              ? `${result.skippedCount} folder${result.skippedCount === 1 ? " was" : "s were"} already in the catalog and skipped.`
              : "The selected location had no importable folders."
          ]
        });
      } else {
        const parts = [
          `${result.importedCount} folder${result.importedCount === 1 ? "" : "s"} added to "${drive.displayName}".`
        ];
        const issueParts = buildImportCleanupIssueParts(result);
        if (issueParts.length > 0) {
          parts.push(`Detected: ${issueParts.join(", ")}.`);
        }
        if (result.skippedCount > 0) {
          parts.push(`${result.skippedCount} already in catalog were skipped.`);
        }
        setFeedback({
          tone: "success",
          title: "Folders imported",
          messages: parts
        });
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Import failed",
        messages: [error instanceof Error ? error.message : "The folders could not be imported."]
      });
    } finally {
      setIsImporting(false);
    }
  }

  const canStartScan = isScanAvailable && !activeSession && Boolean(draftRootPath.trim());
  const canImportFromVolume = isDesktopScanAvailable();
  const scanPlaceholder = drive.volumeName ? `/Volumes/${drive.volumeName}` : "/Volumes/…";
  const finderPath = driveRootPath ?? (drive.volumeName ? `/Volumes/${drive.volumeName}` : null);

  const remainingAfterReserve =
    drive.freeBytes === null ? null : Math.max(drive.freeBytes - drive.reservedIncomingBytes, 0);

  return (
    <div className="space-y-6 pt-2">
      {showDeleteConfirm ? (
        <ConfirmModal
          title="Delete drive?"
          description={`"${drive.displayName}" will be permanently removed from the catalog. Projects assigned to this drive will become unassigned. This cannot be undone.`}
          confirmLabel="Delete drive"
          onConfirm={() => void handleDeleteDrive()}
          onCancel={() => setShowDeleteConfirm(false)}
          isLoading={isMutating}
        />
      ) : null}

      {importSourcePath && importFolders ? (
        <ImportFoldersDialog
          sourcePath={importSourcePath}
          folders={importFolders}
          existingPathsOnDrive={existingProjectPathsOnDrive}
          isImporting={isImporting}
          onConfirm={() => void handleConfirmImport()}
          onCancel={closeImportDialog}
          onPickAgain={() => void runImportPicker()}
        />
      ) : null}

      {/* ── Identity card — volume label, capacity bar, primary actions ── */}
      <section className="card overflow-hidden">
        {/* Toolbar: back link on the left, action group on the right. */}
        <div
          className="flex flex-wrap items-center gap-2 px-5 py-3"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <Link to="/drives" className="btn btn-ghost btn-sm">
            <Icon name="chevron" size={11} color="currentColor" className="rotate-180" />
            Drives
          </Link>
          <div className="flex-1" />
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void showPathInFinder(finderPath)}
            disabled={!finderPath}
          >
            <Icon name="folder" size={11} color="currentColor" />
            Show in Finder
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void runImportPicker()}
            disabled={!canImportFromVolume || isPickingImport || isImporting}
          >
            <Icon name="folder" size={11} color="currentColor" />
            {isPickingImport ? "Opening…" : "Import folders"}
          </button>
          {activeSession ? (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => void cancelScan()}>
              Cancel scan
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => void startScan()}
            disabled={!canStartScan}
          >
            <Icon name="scan" size={11} color="currentColor" />
            {activeSession ? "Scan running" : "Start scan"}
          </button>
        </div>

        {/* Identity block. No MetricCard grid below — capacity details live
            as an inline meta row beside the progress bar. */}
        <div className="px-6 pt-6 pb-5">
          <div className="flex flex-wrap items-start gap-4">
            <div
              className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[12px]"
              style={{ background: "var(--surface-inset)" }}
            >
              <Icon name="hardDrive" size={24} color="var(--ink-2)" />
              <span
                className="absolute bottom-2 right-2 h-2 w-2 rounded-full"
                style={{ background: "var(--accent)", border: "2px solid var(--surface)" }}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="eyebrow">
                {drive.createdManually ? "Manual drive" : "Connected volume"}
                {volumeInfo?.filesystemType ? ` · ${volumeInfo.filesystemType}` : ""}
              </div>
              <h1 className="h-title mt-1" style={{ margin: "4px 0 0" }}>{drive.displayName}</h1>
              {drive.volumeName ? (
                <p
                  className="mono mt-1 text-[12px] break-all"
                  style={{ color: "var(--ink-3)", margin: "4px 0 0" }}
                >
                  /Volumes/{drive.volumeName}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-5">
            <CapacityBar
              usedBytes={drive.usedBytes}
              totalBytes={drive.totalCapacityBytes}
              reservedBytes={drive.reservedIncomingBytes}
            />
            <CapacityLegend usedLabel="Used" reservedLabel="Reserved" freeLabel="Free" />
          </div>

          {/* Inline capacity meta — small and dense. Replaces the previous
              5-tile beige MetricCard grid. */}
          <dl
            className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-5"
            style={{ color: "var(--ink-3)" }}
          >
            <MetaField label="Capacity" value={formatBytes(drive.totalCapacityBytes)} />
            <MetaField label="Used" value={formatBytes(drive.usedBytes)} />
            <MetaField
              label="Reserved"
              value={formatBytes(drive.reservedIncomingBytes)}
              tone={drive.reservedIncomingBytes > 0 ? "warn" : undefined}
            />
            <MetaField label="Free" value={formatBytes(drive.freeBytes)} />
            <MetaField label="Projects" value={String(projects.length)} />
          </dl>
        </div>
      </section>

      {feedback ? (
        <FeedbackNotice tone={feedback.tone} title={feedback.title} messages={feedback.messages} />
      ) : null}

      {/* ── Scan drive — inline form, single action, compact status panel ── */}
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

          {scanSummary ? <ScanStatusPanel scanSummary={scanSummary} isRunning={Boolean(activeSession)} /> : null}
        </div>
      </SectionCard>

      {/* ── Storage detail — quiet definition list, no MetricCard grid ── */}
      <SectionCard
        title="Storage detail"
        description="Reservation and volume data stays local-first and updates as move plans change."
      >
        <dl
          className="grid gap-x-8 gap-y-3 md:grid-cols-3"
          style={{ color: "var(--ink-3)" }}
        >
          <MetaField label="Reserved incoming" value={formatBytes(drive.reservedIncomingBytes)} />
          <MetaField label="Remaining after reserve" value={formatBytes(remainingAfterReserve)} />
          <MetaField label="Last scan" value={formatDate(drive.lastScannedAt)} />
          <MetaField label="Incoming plans" value={String(incomingProjects.length)} />
          <MetaField label="Missing records" value={String(missingProjects.length)} />
          {volumeInfo ? (
            <>
              <MetaField label="Filesystem" value={volumeInfo.filesystemType} />
              <MetaField label="Volume total" value={formatBytes(volumeInfo.totalBytes)} />
              <MetaField label="Volume free" value={formatBytes(volumeInfo.freeBytes)} />
            </>
          ) : null}
        </dl>
      </SectionCard>

      {/* ── Import folders — single action, short rationale ── */}
      <SectionCard
        title="Import folders from volume"
        description="Browse a connected volume and add its top-level folders as projects without running a full scan. Hidden and system folders are filtered automatically; folders already on this drive are skipped."
        action={
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void runImportPicker()}
            disabled={!canImportFromVolume || isPickingImport || isImporting}
          >
            {isPickingImport ? "Opening…" : "Choose folder…"}
          </button>
        }
      >
        {!canImportFromVolume ? (
          <FeedbackNotice
            tone="warning"
            title="Desktop only"
            messages={["Importing folders requires the native desktop app. The native picker and filesystem read are not available in the browser."]}
          />
        ) : null}
      </SectionCard>

      {/* ── Project collections — three lists, hairline-bordered rows ── */}
      <section className="grid gap-6 xl:grid-cols-3">
        <ProjectCollection
          title="Projects on this drive"
          description="Current project assignments."
          projects={projects}
        />
        <ProjectCollection
          title="Incoming move plans"
          description="Projects reserving incoming space on this drive."
          projects={incomingProjects}
          accentLabel="Incoming"
        />
        <ProjectCollection
          title="Missing projects"
          description="Projects last associated with this drive but absent from later scans."
          projects={missingProjects}
          accentLabel="Missing"
        />
      </section>

      {/* ── Danger zone — inline row, not a standalone card ── */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
        style={{ borderTop: "1px solid var(--hairline)" }}
      >
        <div className="min-w-0">
          <p className="text-[13px] font-medium" style={{ color: "var(--ink)", margin: 0 }}>
            Delete drive
          </p>
          <p className="text-[12.5px]" style={{ color: "var(--ink-3)", margin: "2px 0 0" }}>
            Permanently removes this drive. Projects assigned to it will become unassigned.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-danger shrink-0"
          onClick={() => setShowDeleteConfirm(true)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function buildImportCleanupIssueParts(result: {
  duplicateCount: number;
  legacyNameCount: number;
  invalidNameCount: number;
  missingDateCount: number;
  missingClientCount: number;
  missingProjectCount: number;
}) {
  const parts: string[] = [];
  if (result.legacyNameCount > 0) parts.push(`${result.legacyNameCount} legacy name${result.legacyNameCount === 1 ? "" : "s"}`);
  if (result.invalidNameCount > 0) parts.push(`${result.invalidNameCount} invalid name${result.invalidNameCount === 1 ? "" : "s"}`);
  if (result.duplicateCount > 0) parts.push(`${result.duplicateCount} duplicate${result.duplicateCount === 1 ? "" : "s"}`);
  if (result.missingDateCount > 0) parts.push(`${result.missingDateCount} missing date${result.missingDateCount === 1 ? "" : "s"}`);
  if (result.missingClientCount > 0) parts.push(`${result.missingClientCount} missing client${result.missingClientCount === 1 ? "" : "s"}`);
  if (result.missingProjectCount > 0) parts.push(`${result.missingProjectCount} missing project${result.missingProjectCount === 1 ? "" : "s"}`);
  return parts;
}

// ---------------------------------------------------------------------------
// Helpers — local to this page
// ---------------------------------------------------------------------------

/**
 * Inline label/value pair used in the identity card and storage detail
 * section. Matches the MetaField in DrivesPage's DriveCard so the two pages
 * read with the same rhythm.
 */
function MetaField({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "warn";
}): ReactNode {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt
        className="text-[10.5px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--ink-4)" }}
      >
        {label}
      </dt>
      <dd
        className="tnum truncate text-[13.5px] font-medium"
        style={{
          color: tone === "warn" ? "var(--warn)" : "var(--ink)",
          margin: 0
        }}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Scan status panel — replaces the old 6-8 tile MetricCard grid with a
 * compact status line + inline meta row. Reads as a single paragraph of
 * state rather than a dashboard.
 */
function ScanStatusPanel({
  scanSummary,
  isRunning
}: {
  scanSummary: NonNullable<ReturnType<typeof useScanWorkflow>["activeSession"]>;
  isRunning: boolean;
}) {
  const statusTone =
    scanSummary.status === "failed" || scanSummary.status === "interrupted"
      ? "danger"
      : scanSummary.status === "cancelled"
        ? "warn"
        : isRunning
          ? "accent"
          : "neutral";

  return (
    <div
      className="rounded-[12px] px-4 py-3.5"
      style={{ background: "var(--surface-inset)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{
            background:
              statusTone === "danger"
                ? "var(--danger)"
                : statusTone === "warn"
                  ? "var(--warn)"
                  : statusTone === "accent"
                    ? "var(--accent)"
                    : "var(--ok)"
          }}
          aria-hidden="true"
        />
        <span className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
          {isRunning ? "Running" : "Last scan"}
        </span>
        <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          {getScanStatusLabel(scanSummary)}
        </span>
      </div>
      <p
        className="mono mt-1.5 text-[11.5px] break-all"
        style={{ color: "var(--ink-3)", margin: "6px 0 0" }}
      >
        {scanSummary.rootPath}
      </p>

      <dl
        className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4"
        style={{ color: "var(--ink-3)" }}
      >
        <MetaField label="Folders" value={String(scanSummary.foldersScanned)} />
        <MetaField label="Matches" value={String(scanSummary.matchesFound)} />
        {scanSummary.summary ? (
          <>
            <MetaField label="New" value={String(scanSummary.summary.newProjectsCount)} />
            <MetaField label="Updated" value={String(scanSummary.summary.updatedProjectsCount)} />
            <MetaField label="Missing" value={String(scanSummary.summary.missingProjectsCount)} />
            <MetaField label="Duplicates" value={String(scanSummary.summary.duplicatesFlaggedCount)} />
          </>
        ) : null}
        <MetaField label="Started" value={formatDate(scanSummary.startedAt)} />
        <MetaField label="Ended" value={formatDate(scanSummary.finishedAt)} />
      </dl>

      {(scanSummary.status === "failed" ||
        scanSummary.status === "interrupted" ||
        scanSummary.status === "cancelled") ? (
        <p
          className="mt-3 text-[12.5px]"
          style={{
            color: scanSummary.status === "cancelled" ? "var(--warn)" : "var(--danger)",
            margin: "12px 0 0"
          }}
        >
          {getScanStatusMessage(scanSummary)}
        </p>
      ) : null}
    </div>
  );
}

function ProjectCollection({
  title,
  description,
  projects,
  accentLabel
}: {
  title: string;
  description: string;
  projects: Project[];
  accentLabel?: string;
}) {
  return (
    <SectionCard title={title} description={description}>
      {projects.length === 0 ? (
        <p className="text-[12.5px]" style={{ color: "var(--ink-3)", margin: 0 }}>
          Nothing here yet.
        </p>
      ) : (
        <div className="flex flex-col gap-px">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="link-card flex items-center justify-between gap-3 rounded-[8px] px-2.5 py-2 transition-colors hover:bg-[color:var(--surface-inset)]"
            >
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[13px] font-medium"
                  style={{ color: "var(--ink)", margin: 0 }}
                >
                  {getProjectName(project)}
                </p>
                <p
                  className="mt-0.5 text-[11.5px]"
                  style={{ color: "var(--ink-3)", margin: "2px 0 0" }}
                >
                  {formatParsedDate(project.parsedDate)} · {formatBytes(project.sizeBytes)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {accentLabel ? <StatusBadge label={accentLabel} /> : null}
                {getProjectStatusBadges(project).map((badge) => (
                  <StatusBadge key={badge} label={badge} />
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
