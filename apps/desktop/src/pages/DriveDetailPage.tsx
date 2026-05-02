import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { formatBytes, formatDate } from "./dashboardHelpers";
import { useFeedbackDismiss, type FeedbackState } from "./feedbackHelpers";
import { ImportFoldersDialog } from "./ImportFoldersDialog";
import { CapacityBar, CapacityLegend, ConfirmModal, EmptyState, FeedbackNotice, LoadingState, SectionCard } from "./pagePrimitives";
import { ScanSection } from "./drives/ScanSection";
import { ImportSection } from "./drives/ImportSection";
import { ProjectCollection } from "./drives/ProjectCollection";

export function DriveDetailPage() {
  const { driveId = "" } = useParams();
  const navigate = useNavigate();
  const { isLoading, isMutating, getDriveDetailView, selectDrive, deleteDrive, importFoldersFromVolume, scanSessions } = useCatalogStore();
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

  // Import-from-volume state machine:
  //   idle → enumerating (isPickingImport) → preview (importSourcePath set) → importing
  const [importSourcePath, setImportSourcePath] = useState<string | null>(null);
  const [importFolders, setImportFolders] = useState<VolumeFolderEntry[] | null>(null);
  const [isPickingImport, setIsPickingImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

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
  const activeSession = workflowActiveSession?.requestedDriveId === driveId ? workflowActiveSession : null;
  const scanSummary = activeSession ?? latestSessionForDrive;

  useEffect(() => {
    selectDrive(driveId || null);
    return () => { selectDrive(null); };
  }, [driveId, selectDrive]);

  useEffect(() => {
    setSelectedDriveId(driveId);
    if (!draftRootPath && driveRootPath) setDraftRootPath(driveRootPath);
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

  if (isLoading) return <LoadingState label="Loading drive detail" />;
  if (!detail) return <EmptyState title="Drive not found" description="The requested drive is not available in the current local catalog." />;

  const { drive, projects, incomingProjects, missingProjects } = detail;

  async function handleDeleteDrive() {
    try {
      await deleteDrive(driveId);
      navigate("/drives");
    } catch (error) {
      setShowDeleteConfirm(false);
      setFeedback({ tone: "error", title: "Could not delete drive", messages: [error instanceof Error ? error.message : "The drive could not be deleted."] });
    }
  }

  const importPickerDefaultPath = driveRootPath ?? (drive.volumeName ? `/Volumes/${drive.volumeName}` : null);

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
      setFeedback({ tone: "error", title: "Could not read folders", messages: [error instanceof Error ? error.message : "The selected location could not be read."] });
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
      const result = await importFoldersFromVolume({ driveId, sourcePath: importSourcePath, folders: importFolders });
      closeImportDialog();
      if (result.importedCount === 0) {
        setFeedback({
          tone: "info",
          title: "No new folders imported",
          messages: [result.skippedCount > 0 ? `${result.skippedCount} folder${result.skippedCount === 1 ? " was" : "s were"} already in the catalog and skipped.` : "The selected location had no importable folders."]
        });
      } else {
        const parts = [`${result.importedCount} folder${result.importedCount === 1 ? "" : "s"} added to "${drive.displayName}".`];
        const issues = buildImportIssueParts(result);
        if (issues.length > 0) parts.push(`Detected: ${issues.join(", ")}.`);
        if (result.skippedCount > 0) parts.push(`${result.skippedCount} already in catalog were skipped.`);
        setFeedback({ tone: "success", title: "Folders imported", messages: parts });
      }
    } catch (error) {
      setFeedback({ tone: "error", title: "Import failed", messages: [error instanceof Error ? error.message : "The folders could not be imported."] });
    } finally {
      setIsImporting(false);
    }
  }

  const canStartScan = isScanAvailable && !activeSession && Boolean(draftRootPath.trim());
  const canImportFromVolume = isDesktopScanAvailable();
  const scanPlaceholder = drive.volumeName ? `/Volumes/${drive.volumeName}` : "/Volumes/…";
  const finderPath = driveRootPath ?? (drive.volumeName ? `/Volumes/${drive.volumeName}` : null);
  const remainingAfterReserve = drive.freeBytes === null ? null : Math.max(drive.freeBytes - drive.reservedIncomingBytes, 0);

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

      {/* Identity card */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-5 py-3" style={{ borderBottom: "1px solid var(--hairline)" }}>
          <Link to="/drives" className="btn btn-ghost btn-sm">
            <Icon name="chevron" size={11} color="currentColor" className="rotate-180" />
            Drives
          </Link>
          <div className="flex-1" />
          <button type="button" className="btn btn-sm" onClick={() => void showPathInFinder(finderPath)} disabled={!finderPath}>
            <Icon name="folder" size={11} color="currentColor" />Show in Finder
          </button>
          <button type="button" className="btn btn-sm" onClick={() => void runImportPicker()} disabled={!canImportFromVolume || isPickingImport || isImporting}>
            <Icon name="folder" size={11} color="currentColor" />
            {isPickingImport ? "Opening…" : "Import folders"}
          </button>
          {activeSession ? (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => void cancelScan()}>Cancel scan</button>
          ) : null}
          <button type="button" className="btn btn-sm btn-primary" onClick={() => void startScan()} disabled={!canStartScan}>
            <Icon name="scan" size={11} color="currentColor" />
            {activeSession ? "Scan running" : "Start scan"}
          </button>
        </div>

        <div className="px-6 pt-6 pb-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[12px]" style={{ background: "var(--surface-inset)" }}>
              <Icon name="hardDrive" size={24} color="var(--ink-2)" />
              <span className="absolute bottom-2 right-2 h-2 w-2 rounded-full" style={{ background: "var(--accent)", border: "2px solid var(--surface)" }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="eyebrow">
                {drive.createdManually ? "Manual drive" : "Connected volume"}
                {volumeInfo?.filesystemType ? ` · ${volumeInfo.filesystemType}` : ""}
              </div>
              <h1 className="h-title mt-1" style={{ margin: "4px 0 0" }}>{drive.displayName}</h1>
              {drive.volumeName ? (
                <p className="mono mt-1 text-[12px] break-all" style={{ color: "var(--ink-3)", margin: "4px 0 0" }}>
                  /Volumes/{drive.volumeName}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-5">
            <CapacityBar usedBytes={drive.usedBytes} totalBytes={drive.totalCapacityBytes} reservedBytes={drive.reservedIncomingBytes} />
            <CapacityLegend usedLabel="Used" reservedLabel="Reserved" freeLabel="Free" />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 md:grid-cols-5" style={{ color: "var(--ink-3)" }}>
            <MetaField label="Capacity" value={formatBytes(drive.totalCapacityBytes)} />
            <MetaField label="Used" value={formatBytes(drive.usedBytes)} />
            <MetaField label="Reserved" value={formatBytes(drive.reservedIncomingBytes)} tone={drive.reservedIncomingBytes > 0 ? "warn" : undefined} />
            <MetaField label="Free" value={formatBytes(drive.freeBytes)} />
            <MetaField label="Projects" value={String(projects.length)} />
          </dl>
        </div>
      </section>

      {feedback ? <FeedbackNotice tone={feedback.tone} title={feedback.title} messages={feedback.messages} /> : null}

      <ScanSection
        scanSummary={scanSummary}
        activeSession={activeSession}
        draftRootPath={draftRootPath}
        setDraftRootPath={setDraftRootPath}
        isScanAvailable={isScanAvailable}
        isPickingDirectory={isPickingDirectory}
        canStartScan={canStartScan}
        scanPlaceholder={scanPlaceholder}
        scanError={scanError}
        chooseDirectory={chooseDirectory}
        startScan={startScan}
        cancelScan={cancelScan}
      />

      <SectionCard title="Storage detail" description="Reservation and volume data stays local-first and updates as move plans change.">
        <dl className="grid gap-x-8 gap-y-3 md:grid-cols-3" style={{ color: "var(--ink-3)" }}>
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

      <ImportSection canImportFromVolume={canImportFromVolume} isPickingImport={isPickingImport} isImporting={isImporting} runImportPicker={runImportPicker} />

      <section className="grid gap-6 xl:grid-cols-3">
        <ProjectCollection title="Projects on this drive" description="Current project assignments." projects={projects} />
        <ProjectCollection title="Incoming move plans" description="Projects reserving incoming space on this drive." projects={incomingProjects} accentLabel="Incoming" />
        <ProjectCollection title="Missing projects" description="Projects last associated with this drive but absent from later scans." projects={missingProjects} accentLabel="Missing" />
      </section>

      {/* Danger zone */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" style={{ borderTop: "1px solid var(--hairline)" }}>
        <div className="min-w-0">
          <p className="text-[13px] font-medium" style={{ color: "var(--ink)", margin: 0 }}>Delete drive</p>
          <p className="text-[12.5px]" style={{ color: "var(--ink-3)", margin: "2px 0 0" }}>Permanently removes this drive. Projects assigned to it will become unassigned.</p>
        </div>
        <button type="button" className="btn btn-sm btn-danger shrink-0" onClick={() => setShowDeleteConfirm(true)}>Delete</button>
      </div>
    </div>
  );
}

function buildImportIssueParts(result: { duplicateCount: number; legacyNameCount: number; invalidNameCount: number; missingDateCount: number; missingClientCount: number; missingProjectCount: number }) {
  const parts: string[] = [];
  if (result.legacyNameCount > 0) parts.push(`${result.legacyNameCount} legacy name${result.legacyNameCount === 1 ? "" : "s"}`);
  if (result.invalidNameCount > 0) parts.push(`${result.invalidNameCount} invalid name${result.invalidNameCount === 1 ? "" : "s"}`);
  if (result.duplicateCount > 0) parts.push(`${result.duplicateCount} duplicate${result.duplicateCount === 1 ? "" : "s"}`);
  if (result.missingDateCount > 0) parts.push(`${result.missingDateCount} missing date${result.missingDateCount === 1 ? "" : "s"}`);
  if (result.missingClientCount > 0) parts.push(`${result.missingClientCount} missing client${result.missingClientCount === 1 ? "" : "s"}`);
  if (result.missingProjectCount > 0) parts.push(`${result.missingProjectCount} missing project${result.missingProjectCount === 1 ? "" : "s"}`);
  return parts;
}

function MetaField({ label, value, tone }: { label: string; value: string; tone?: "warn" }): ReactNode {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[10.5px] font-medium uppercase tracking-[0.08em]" style={{ color: "var(--ink-4)" }}>{label}</dt>
      <dd className="tnum truncate text-[13.5px] font-medium" style={{ color: tone === "warn" ? "var(--warn)" : "var(--ink)", margin: 0 }}>{value}</dd>
    </div>
  );
}
