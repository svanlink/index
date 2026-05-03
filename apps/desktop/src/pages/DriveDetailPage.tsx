import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
import {
  CapacityBar,
  CapacityLegend,
  ConfirmModal,
  EmptyState,
  FeedbackNotice,
  LoadingState,
  MetaField,
  SectionCard,
  StatusBadge
} from "./pagePrimitives";
import { ProjectCollection } from "./drives/ProjectCollection";
import { ScanStatusPanel } from "./drives/ScanStatusPanel";
import { getDriveColor } from "./driveColor";
import { ProjectList } from "./ProjectList";

export function DriveDetailPage() {
  const { driveId = "" } = useParams();
  const navigate = useNavigate();
  const {
    isLoading, isMutating,
    getDriveDetailView, selectDrive, deleteDrive,
    importFoldersFromVolume, scanSessions,
    drives
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
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Import-from-volume state machine
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

  // Derived state
  const isScanning = Boolean(activeSession);
  const connectionLabel = isScanning ? "Mounting" : volumeInfo ? "Online" : "Offline";
  const driveColor = getDriveColor(drive.id);

  // Capacity legend values
  const driveUsedPct =
    drive.usedBytes !== null && drive.totalCapacityBytes && drive.totalCapacityBytes > 0
      ? Math.round((drive.usedBytes / drive.totalCapacityBytes) * 100)
      : null;
  const usedLegendLabel =
    driveUsedPct !== null
      ? `${driveUsedPct}% used · ${formatBytes(drive.usedBytes)}`
      : "Used";
  const freeLegendLabel =
    drive.freeBytes !== null ? `${formatBytes(drive.freeBytes)} free` : "Unknown free";
  const reservedLegendLabel =
    drive.reservedIncomingBytes > 0
      ? `${formatBytes(drive.reservedIncomingBytes)} reserved`
      : undefined;

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
    <div className="flex flex-col" style={{ gap: 24, paddingTop: 8 }}>
      {showDeleteConfirm ? (
        <ConfirmModal
          title="Delete drive?"
          description={`"${drive.displayName}" will be permanently removed from the catalog. Projects assigned to this drive will become unassigned.`}
          consequence="This cannot be undone."
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

      {/* ── B1/B2: Identity + action card ──────────────────────────────────── */}
      <section
        className="card"
        style={{ overflow: "hidden", "--drive-color": driveColor } as CSSProperties}
      >
        {/* B2: Action toolbar — breadcrumb | spacer | secondary actions | primary */}
        <div
          className="flex flex-wrap items-center"
          style={{ gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--hairline)" }}
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
            <Icon name="download" size={11} color="currentColor" />
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
            {isScanning ? "Scan running" : "Start scan"}
          </button>
        </div>

        {/* Scan path row — compact, below toolbar */}
        <div
          className="flex"
          style={{ gap: 8, padding: "8px 16px", borderBottom: "1px solid var(--hairline)" }}
        >
          <input
            value={draftRootPath}
            onChange={(e) => setDraftRootPath(e.target.value)}
            className="field-shell min-w-0 flex-1"
            style={{ fontSize: 12, padding: "6px 12px" }}
            placeholder={scanPlaceholder}
            disabled={isScanning}
            aria-label="Scan target path"
          />
          <button
            type="button"
            className="btn btn-sm shrink-0"
            onClick={() => void chooseDirectory()}
            disabled={!isScanAvailable || isPickingDirectory || isScanning}
          >
            {isPickingDirectory ? "Opening…" : "Browse"}
          </button>
        </div>

        {/* B1: Two-column identity — left: icon + name + badges; right: capacity */}
        <div className="drive-identity-grid">
          {/* Left — drive identity */}
          <div className="min-w-0">
            <div className="flex items-center" style={{ gap: 16 }}>
              {/* Icon tile — inset left shadow carries drive color accent */}
              <div
                className="flex shrink-0 items-center justify-center"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 12,
                  background: "var(--surface-inset)",
                  boxShadow: "inset 3px 0 0 var(--drive-color)"
                }}
              >
                <Icon name="hardDrive" size={24} color="var(--ink-2)" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
                  <h1 className="h-title" style={{ margin: 0 }}>
                    {drive.displayName}
                  </h1>
                  <StatusBadge label={connectionLabel} />
                </div>
                {drive.volumeName ? (
                  <p
                    className="mono"
                    style={{ color: "var(--ink-3)", margin: "4px 0 0", fontSize: 12, wordBreak: "break-all" }}
                  >
                    /Volumes/{drive.volumeName}
                  </p>
                ) : null}
                <p style={{ color: "var(--ink-4)", margin: "4px 0 0", fontSize: 12 }}>
                  {drive.createdManually ? "Manual drive" : "Connected volume"}
                  {volumeInfo?.filesystemType ? ` · ${volumeInfo.filesystemType}` : ""}
                </p>
              </div>
            </div>
          </div>

          {/* Right — capacity bar + legend + 2×2 stats */}
          <div>
            <CapacityBar
              usedBytes={drive.usedBytes}
              totalBytes={drive.totalCapacityBytes}
              reservedBytes={drive.reservedIncomingBytes}
            />
            <CapacityLegend
              usedLabel={usedLegendLabel}
              reservedLabel={reservedLegendLabel}
              freeLabel={freeLegendLabel}
            />
            <dl className="meta-grid-2" style={{ marginTop: 16, color: "var(--ink-3)" }}>
              <MetaField label="Capacity" value={formatBytes(drive.totalCapacityBytes)} />
              <MetaField label="Projects" value={String(projects.length)} />
              <MetaField
                label="Reserved"
                value={formatBytes(drive.reservedIncomingBytes)}
                tone={drive.reservedIncomingBytes > 0 ? "warn" : undefined}
              />
              <MetaField label="Last scan" value={formatDate(drive.lastScannedAt)} />
            </dl>
          </div>
        </div>

        {/* B4: Connection banner — mount path + Reveal in Finder, dismissible */}
        {volumeInfo && !bannerDismissed && driveRootPath ? (
          <div
            className="flex items-center"
            style={{
              gap: 12,
              borderTop: "1px solid var(--hairline)",
              padding: "10px 20px",
              background: "var(--surface-inset)"
            }}
          >
            <Icon name="hardDrive" size={12} color="var(--ink-3)" />
            <span
              className="mono min-w-0 flex-1 truncate"
              style={{ color: "var(--ink-3)", fontSize: 12 }}
            >
              {driveRootPath}
            </span>
            <button
              type="button"
              className="btn btn-sm shrink-0"
              onClick={() => void showPathInFinder(driveRootPath)}
            >
              Reveal in Finder
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm shrink-0"
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss"
            >
              <Icon name="close" size={10} color="currentColor" />
            </button>
          </div>
        ) : null}

        {/* Scan status panel */}
        {scanSummary ? (
          <div style={{ borderTop: "1px solid var(--hairline)", padding: "16px 20px" }}>
            <ScanStatusPanel scanSummary={scanSummary} isRunning={isScanning} />
          </div>
        ) : null}

        {/* Scan availability / error feedback */}
        {!isScanAvailable ? (
          <div style={{ borderTop: "1px solid var(--hairline)", padding: "16px 20px" }}>
            <FeedbackNotice
              tone="warning"
              title="Desktop scan only"
              messages={["Scans require the native desktop app. Persisted state is visible here, but starting a scan needs the Tauri shell."]}
            />
          </div>
        ) : null}
        {scanError ? (
          <div style={{ padding: "0 20px 16px" }}>
            <FeedbackNotice tone="error" title="Scan error" messages={[scanError]} />
          </div>
        ) : null}
      </section>

      {feedback ? (
        <FeedbackNotice tone={feedback.tone} title={feedback.title} messages={feedback.messages} />
      ) : null}

      {/* Storage detail */}
      <SectionCard title="Storage detail" description="Reservation and volume data stays local-first and updates as move plans change.">
        <dl className="fields-grid-3" style={{ columnGap: 32, color: "var(--ink-3)" }}>
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

      {/* B3: Main project list — full shared row format */}
      {projects.length > 0 ? (
        <section className="flex flex-col" style={{ gap: 8 }}>
          <h2 className="h-section" style={{ margin: 0 }}>Projects on this drive</h2>
          <ProjectList projects={projects} drives={drives} />
        </section>
      ) : (
        <section className="flex flex-col" style={{ gap: 8 }}>
          <h2 className="h-section" style={{ margin: 0 }}>Projects on this drive</h2>
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="flex flex-col items-center text-center" style={{ gap: 8, padding: "48px 16px" }}>
              <span
                className="inline-flex items-center justify-center"
                style={{ width: 44, height: 44, borderRadius: 10, background: "var(--surface-inset)", marginBottom: 4 }}
                aria-hidden="true"
              >
                <Icon name="folderOpen" size={20} color="var(--ink-3)" />
              </span>
              <p style={{ color: "var(--ink)", fontSize: 13, fontWeight: 600, margin: 0 }}>
                No projects yet
              </p>
              <p style={{ color: "var(--ink-3)", fontSize: 12, margin: 0 }}>
                Scan the drive or import folders to populate the catalog.
              </p>
              <div className="flex items-center" style={{ gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => void runImportPicker()}
                  disabled={!canImportFromVolume || isPickingImport || isImporting}
                >
                  <Icon name="download" size={11} color="currentColor" />
                  Import folders
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void startScan()}
                  disabled={!canStartScan}
                >
                  <Icon name="scan" size={11} color="currentColor" />
                  Start scan
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Incoming & missing — compact 2-col grid */}
      {(incomingProjects.length > 0 || missingProjects.length > 0) ? (
        <div className="dual-grid">
          {incomingProjects.length > 0 ? (
            <ProjectCollection
              title="Incoming move plans"
              description="Projects reserving incoming space on this drive."
              projects={incomingProjects}
              accentLabel="Incoming"
            />
          ) : null}
          {missingProjects.length > 0 ? (
            <ProjectCollection
              title="Missing projects"
              description="Projects last associated with this drive but absent from later scans."
              projects={missingProjects}
              accentLabel="Missing"
            />
          ) : null}
        </div>
      ) : null}

      {/* Danger zone */}
      <div
        className="flex flex-wrap items-center justify-between"
        style={{ gap: 12, borderTop: "1px solid var(--hairline)", padding: "16px 20px" }}
      >
        <div className="min-w-0">
          <p style={{ color: "var(--ink)", fontSize: 13, fontWeight: 500, margin: 0 }}>Delete drive</p>
          <p style={{ color: "var(--ink-3)", fontSize: 12, margin: "2px 0 0" }}>
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

function buildImportIssueParts(result: {
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
