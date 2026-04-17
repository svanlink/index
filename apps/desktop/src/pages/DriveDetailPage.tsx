import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Project } from "@drive-project-catalog/domain";
import { getScanStatusLabel, getScanStatusMessage } from "@drive-project-catalog/data";

import { isDesktopScanAvailable, useVolumeInfo } from "../app/scanCommands";
import {
  enumerateVolumeFolders,
  pickVolumeRoot,
  type VolumeFolderEntry
} from "../app/volumeImportCommands";
import { useCatalogStore } from "../app/providers";
import { useScanWorkflow } from "../app/scanWorkflow";
import { formatBytes, formatDate, formatParsedDate, getProjectName, getProjectStatusBadges } from "./dashboardHelpers";
import { useFeedbackDismiss, type FeedbackState } from "./feedbackHelpers";
import { ImportFoldersDialog } from "./ImportFoldersDialog";
import { CapacityBar, CapacityLegend, ConfirmModal, EmptyState, FeedbackNotice, LoadingState, MetricCard, SectionCard, StatusBadge } from "./pagePrimitives";

// ---------------------------------------------------------------------------
// DriveDetailPage
// ---------------------------------------------------------------------------
//
// Scans are inherently per-drive, so the scan workflow lives inline here
// rather than as a global toolbar modal. The previous DesktopScanPanel /
// ShellToolbarActions layer was removed — all its state is sourced directly
// from the ScanWorkflowProvider context and rendered as a first-class section
// on this page.
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
  //   - enumerating: isPickingImport === true  (native picker open, or Rust
  //                  call in flight — same UX because both block the same
  //                  section of the UI)
  //   - preview:     importSourcePath !== null && importFolders !== null
  //   - importing:   isImporting === true       (repository call in flight)
  const [importSourcePath, setImportSourcePath] = useState<string | null>(null);
  const [importFolders, setImportFolders] = useState<VolumeFolderEntry[] | null>(null);
  const [isPickingImport, setIsPickingImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Most recent session for this drive drives two things: the volume info
  // lookup (which needs a valid rootPath) and the default target path we seed
  // into the scan form below.
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

  // Only treat the workflow's active session as "ours" if it targets this
  // drive — otherwise we'd show a running scan from another drive under this
  // drive's header.
  const activeSession =
    workflowActiveSession?.requestedDriveId === driveId ? workflowActiveSession : null;
  const scanSummary = activeSession ?? latestSessionForDrive;

  useEffect(() => {
    selectDrive(driveId || null);
    return () => {
      selectDrive(null);
    };
  }, [driveId, selectDrive]);

  // Bind the scan workflow to this drive while the page is mounted. Seeding
  // `draftRootPath` from the last known scan spares the user from retyping the
  // /Volumes/... path every time they revisit an existing drive.
  useEffect(() => {
    setSelectedDriveId(driveId);
    if (!draftRootPath && driveRootPath) {
      setDraftRootPath(driveRootPath);
    }
  }, [driveId, driveRootPath, draftRootPath, setSelectedDriveId, setDraftRootPath]);

  // Auto-dismiss feedback after 2.8s (shared hook; matches DrivesPage).
  useFeedbackDismiss(feedback, setFeedback);

  // Compute detail *before* the early returns so all hooks below run on every
  // render. Moving this out of the "post-return" zone is what lets us keep
  // `existingProjectPathsOnDrive` as a `useMemo` without tripping Rules of
  // Hooks on the initial `isLoading` render.
  const detail = getDriveDetailView(driveId);

  // Stable set of folderPaths already associated with this drive. Pass this
  // into the preview modal so it can mark duplicates — the repository's dedup
  // keys on exactly this same (driveId, folderPath) pair, so the UI's
  // "already in catalog" labels can never drift from what actually gets
  // persisted.
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
    return <EmptyState title="Drive not found" description="The requested drive is not available in the current local catalog." />;
  }

  const { drive, projects, incomingProjects, missingProjects } = detail;

  // S6/H11 — deleteDrive errors must surface to the user. Previously the
  // catch silently closed the modal, which read as "deleted successfully"
  // even when the delete failed. Now we close the modal and raise a visible
  // error notice so the user knows to retry or investigate.
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

  // Default the native picker to the drive's known root path (last scanned
  // path, falling back to the conventional `/Volumes/<volumeName>`). Users
  // almost always want to pick the same volume this page represents, so
  // starting there saves clicks — they can still navigate elsewhere.
  const importPickerDefaultPath =
    driveRootPath ?? (drive.volumeName ? `/Volumes/${drive.volumeName}` : null);

  // Plain async function — no memoization needed since its only consumers
  // are inline event handlers that re-create every render anyway. Declaring
  // this via `useCallback` after the early-return block above would violate
  // Rules of Hooks on the initial `isLoading` render.
  async function runImportPicker() {
    setIsPickingImport(true);
    try {
      const selection = await pickVolumeRoot(importPickerDefaultPath);
      if (!selection) {
        // User cancelled the native dialog — leave any prior preview state
        // intact so "Pick different folder" → cancel → back to original
        // preview works without re-enumerating.
        return;
      }
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
  const scanPlaceholder = drive.volumeName ? `/Volumes/${drive.volumeName}` : "/Volumes/…";

  return (
    <div className="space-y-6">
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

      <div className="flex items-center justify-between">
        <div />
        <Link to="/drives" className="button-secondary">Back</Link>
      </div>

      {feedback ? (
        <FeedbackNotice
          tone={feedback.tone}
          title={feedback.title}
          messages={feedback.messages}
        />
      ) : null}

      <SectionCard title="Drive summary" description="Capacity and reservation data stays local-first and updates as move plans change.">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <CapacityBar
              usedBytes={drive.usedBytes}
              totalBytes={drive.totalCapacityBytes}
              reservedBytes={drive.reservedIncomingBytes}
            />
            <CapacityLegend usedLabel="Used" reservedLabel="Reserved" freeLabel="Free" />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <MetricCard label="Used" value={formatBytes(drive.usedBytes)} />
              <MetricCard label="Reserved incoming" value={formatBytes(drive.reservedIncomingBytes)} />
              <MetricCard label="Remaining after reserve" value={formatBytes(drive.freeBytes === null ? null : Math.max(drive.freeBytes - drive.reservedIncomingBytes, 0))} />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard label="Capacity" value={formatBytes(drive.totalCapacityBytes)} />
            <MetricCard label="Free" value={formatBytes(drive.freeBytes)} />
            <MetricCard label="Projects" value={String(projects.length)} />
            <MetricCard label="Incoming plans" value={String(incomingProjects.length)} />
            <MetricCard label="Missing records" value={String(missingProjects.length)} />
            <MetricCard label="Last scan" value={formatDate(drive.lastScannedAt)} />
            {volumeInfo ? (
              <>
                <MetricCard label="Filesystem" value={volumeInfo.filesystemType} />
                <MetricCard label="Volume total" value={formatBytes(volumeInfo.totalBytes)} />
                <MetricCard label="Volume free" value={formatBytes(volumeInfo.freeBytes)} />
              </>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Scan drive"
        description="Index this drive's folder structure into the catalog. Runs locally — nothing leaves your machine."
        action={
          <div className="flex gap-2">
            {activeSession ? (
              <button type="button" className="button-danger" onClick={() => void cancelScan()}>
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              className="button-success"
              onClick={() => void startScan()}
              disabled={!canStartScan}
            >
              {activeSession ? "Scan running" : "Start scan"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-text-soft)" }}>
              Scan target path
            </span>
            <div className="flex gap-2">
              <input
                value={draftRootPath}
                onChange={(event) => setDraftRootPath(event.target.value)}
                className="field-shell min-w-0 flex-1 bg-transparent px-4 py-3 outline-none"
                placeholder={scanPlaceholder}
                disabled={Boolean(activeSession)}
              />
              <button
                type="button"
                className="button-secondary shrink-0"
                onClick={() => void chooseDirectory()}
                disabled={!isScanAvailable || isPickingDirectory || Boolean(activeSession)}
              >
                {isPickingDirectory ? "Opening..." : "Browse"}
              </button>
            </div>
          </label>

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
            <div className="rounded-md border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-text-soft)" }}>
                  {activeSession ? "Running" : "Last scan"}
                </p>
                <p className="mt-1 text-[14px] font-semibold" style={{ color: "var(--color-text)" }}>
                  {getScanStatusLabel(scanSummary)}
                </p>
                <p className="mt-0.5 text-[12px] break-all" style={{ color: "var(--color-text-muted)" }}>
                  {scanSummary.rootPath}
                </p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Folders" value={String(scanSummary.foldersScanned)} />
                <MetricCard label="Matches" value={String(scanSummary.matchesFound)} />
                {scanSummary.summary ? (
                  <>
                    <MetricCard label="New" value={String(scanSummary.summary.newProjectsCount)} />
                    <MetricCard label="Updated" value={String(scanSummary.summary.updatedProjectsCount)} />
                    <MetricCard label="Missing" value={String(scanSummary.summary.missingProjectsCount)} />
                    <MetricCard label="Duplicates" value={String(scanSummary.summary.duplicatesFlaggedCount)} />
                  </>
                ) : null}
                <MetricCard label="Started" value={formatDate(scanSummary.startedAt)} />
                <MetricCard label="Ended" value={formatDate(scanSummary.finishedAt)} />
              </div>
              {(scanSummary.status === "failed" ||
                scanSummary.status === "interrupted" ||
                scanSummary.status === "cancelled") ? (
                <p
                  className="mt-3 text-[12px]"
                  style={{
                    color: scanSummary.status === "cancelled" ? "var(--color-warning)" : "var(--color-danger)"
                  }}
                >
                  {getScanStatusMessage(scanSummary)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Import folders from volume"
        description="Browse a connected volume and add its top-level folders as projects on this drive without running a full scan. Names are classified automatically; nothing on disk is changed."
        action={
          <button
            type="button"
            className="button-secondary"
            onClick={() => void runImportPicker()}
            disabled={!isDesktopScanAvailable() || isPickingImport || isImporting}
          >
            {isPickingImport ? "Opening…" : "Choose folder…"}
          </button>
        }
      >
        {!isDesktopScanAvailable() ? (
          <FeedbackNotice
            tone="warning"
            title="Desktop only"
            messages={["Importing folders requires the native desktop app. The native picker and filesystem read are not available in the browser."]}
          />
        ) : (
          <p className="text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            Pick a volume or subfolder — you'll get a preview of its top-level
            folder names before anything is added to the catalog. Hidden files
            and system folders are filtered automatically, and folders that
            already exist on this drive are skipped.
          </p>
        )}
      </SectionCard>

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

      {/* Danger zone — separated from primary actions */}
      <div className="rounded-lg border px-4 py-4" style={{ borderColor: "var(--color-border)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-text-soft)" }}>Danger zone</p>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>Delete drive</p>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              Permanently removes this drive from the catalog. Projects assigned to it will become unassigned.
            </p>
          </div>
          <button type="button" className="button-danger shrink-0" onClick={() => setShowDeleteConfirm(true)}>
            Delete
          </button>
        </div>
      </div>
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
        <EmptyState title="No projects" description="Nothing in this section yet." />
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="link-card flex items-center justify-between border-b py-2.5 last:border-b-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div>
                <p className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>{getProjectName(project)}</p>
                <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                  {formatParsedDate(project.parsedDate)} · {formatBytes(project.sizeBytes)}
                </p>
              </div>
              <div className="flex gap-1">
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
