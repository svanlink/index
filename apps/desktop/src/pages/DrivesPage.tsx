import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Drive, ScanSessionSnapshot } from "@drive-project-catalog/domain";
import {
  buildStoragePlanningRows,
  buildStoragePlanningSummary,
  getDriveHealthLabel,
  type DriveHealthState
} from "@drive-project-catalog/data";
import { getVolumeInfo, isDesktopScanAvailable, useVolumeInfo, type VolumeInfo } from "../app/scanCommands";
import {
  enumerateVolumeFolders,
  pickVolumeRoot,
  type VolumeFolderEntry
} from "../app/volumeImportCommands";
import { useShortcut } from "../app/useShortcut";
import { useCatalogStore } from "../app/providers";
import { formatBytes, formatDate } from "./dashboardHelpers";
import { useFeedbackDismiss, type FeedbackState } from "./feedbackHelpers";
import { ImportFoldersDialog } from "./ImportFoldersDialog";
import { DriveCardSkeleton, EmptyState, FeedbackNotice, StatusBadge } from "./pagePrimitives";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDriveScanSession(
  drive: Drive,
  scanSessions: ScanSessionSnapshot[]
): ScanSessionSnapshot | null {
  return (
    [...scanSessions]
      .filter(
        (s) =>
          s.requestedDriveId === drive.id ||
          s.driveName === drive.volumeName ||
          s.driveName === drive.displayName
      )
      .sort((a, b) =>
        (b.finishedAt ?? b.updatedAt ?? b.startedAt).localeCompare(
          a.finishedAt ?? a.updatedAt ?? a.startedAt
        )
      )[0] ?? null
  );
}

function useDriveMetrics(projects: { currentDriveId: string | null }[]) {
  return useMemo(() => {
    const counts: Record<string, number> = {};
    for (const project of projects) {
      if (project.currentDriveId) {
        counts[project.currentDriveId] = (counts[project.currentDriveId] ?? 0) + 1;
      }
    }
    return counts;
  }, [projects]);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface DriveFormState {
  volumeName: string;
  displayName: string;
  capacityTerabytes: string;
}

const initialDriveForm: DriveFormState = { volumeName: "", displayName: "", capacityTerabytes: "" };

export function DrivesPage() {
  const navigate = useNavigate();
  const { drives, projects, scanSessions, isLoading, isMutating, createDrive, importFoldersFromVolume } =
    useCatalogStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [driveForm, setDriveForm] = useState<DriveFormState>(initialDriveForm);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const projectCounts = useDriveMetrics(projects);

  // --- Import-from-mounted-volume flow ------------------------------------
  //
  // One-shot flow: pick a mounted volume → read its volume metadata + top-
  // level folders in parallel → preview → confirm. On confirm, if no existing
  // drive matches the picked volume (by OS volume name), we auto-create one
  // so the user doesn't have to do a separate "Add drive" step first. This
  // is the core shipping-it-in-one-click experience.
  //
  //   idle:        importSourcePath === null
  //   enumerating: isPickingImport === true
  //   preview:     importSourcePath && importFolders !== null
  //   importing:   isImporting === true
  const [importSourcePath, setImportSourcePath] = useState<string | null>(null);
  const [importFolders, setImportFolders] = useState<VolumeFolderEntry[] | null>(null);
  const [importVolumeInfo, setImportVolumeInfo] = useState<VolumeInfo | null>(null);
  const [isPickingImport, setIsPickingImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Planning rows give us health-ranked ordering (overcommitted → near-capacity
  // → healthy) and portfolio-level totals. Previously these lived on a separate
  // /storage route; folding them here means the drives list doubles as the
  // storage-planning surface.
  const planningRows = useMemo(() => buildStoragePlanningRows(drives, projects), [drives, projects]);
  const planningSummary = useMemo(() => buildStoragePlanningSummary(planningRows, projects), [planningRows, projects]);

  // Cmd+N — toggle create form
  useShortcut({ key: "n", meta: true, onTrigger: () => setIsCreateOpen((c) => !c), enabled: !isMutating });

  // S6/M7 — auto-dismiss feedback after 2.8s (shared hook; matches DriveDetailPage).
  useFeedbackDismiss(feedback, setFeedback);

  // S6/H11 — createDrive errors are surfaced via feedback instead of being
  // silently swallowed. Validation errors (e.g. empty volume name) now
  // produce a visible error notice so the user knows why the form failed.
  async function handleCreateDrive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const drive = await createDrive({
        volumeName: driveForm.volumeName.trim(),
        displayName: driveForm.displayName.trim() || null,
        totalCapacityBytes: driveForm.capacityTerabytes
          ? Math.round(Number(driveForm.capacityTerabytes) * 1_000_000_000_000)
          : null
      });
      setDriveForm(initialDriveForm);
      setIsCreateOpen(false);
      setFeedback({
        tone: "success",
        title: "Drive added",
        messages: [`"${drive.displayName}" is now in the catalog.`]
      });
      navigate(`/drives/${drive.id}`);
    } catch (error) {
      setIsCreateOpen(true);
      setFeedback({
        tone: "error",
        title: "Could not add drive",
        messages: [error instanceof Error ? error.message : "The drive could not be created."]
      });
    }
  }

  // Resolve which catalog drive a picked volume should land on. Match is
  // exact-by-volumeName — that's the OS-canonical identifier, not the
  // user-facing displayName, so two "Archive" drives on different
  // filesystems won't collide. Returns null if the import should create a
  // fresh drive record.
  function matchExistingDrive(volumeInfo: VolumeInfo | null): Drive | null {
    if (!volumeInfo) return null;
    return drives.find((drive) => drive.volumeName === volumeInfo.volumeName) ?? null;
  }

  // Build the set of folderPaths already on the matched drive so the preview
  // can grey out duplicates. Empty set when the import will create a new
  // drive — nothing to collide with yet.
  function pathsAlreadyOnDrive(matchedDrive: Drive | null): Set<string> {
    if (!matchedDrive) return new Set<string>();
    const set = new Set<string>();
    for (const project of projects) {
      if (project.currentDriveId === matchedDrive.id && project.folderPath) {
        set.add(project.folderPath);
      }
    }
    return set;
  }

  async function runImportFromVolume() {
    setIsPickingImport(true);
    try {
      const selection = await pickVolumeRoot(null);
      if (!selection) return; // User cancelled native picker.

      // Parallel: volume metadata is best-effort (null on failure) and the
      // folder list is authoritative. Doing them together keeps the modal
      // opening in one round-trip rather than two.
      const [volumeInfo, folders] = await Promise.all([
        getVolumeInfo(selection),
        enumerateVolumeFolders(selection)
      ]);

      setImportSourcePath(selection);
      setImportFolders(folders);
      setImportVolumeInfo(volumeInfo);
    } catch (error) {
      closeImportDialog();
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
    setImportVolumeInfo(null);
  }

  async function handleConfirmImportFromVolume() {
    if (!importSourcePath || !importFolders) return;
    setIsImporting(true);
    try {
      // 1. Resolve target drive: either the existing drive that matches this
      //    volume by OS name, or a freshly-created one named after the volume
      //    (or the path's basename as a last-resort fallback). The create-
      //    then-import sequence is two separate mutations — the sync queue
      //    and optimistic refresh handle them individually, so a partial
      //    failure leaves the drive intact and the user can retry the import
      //    from the drive detail page.
      const matched = matchExistingDrive(importVolumeInfo);
      const driveToUse =
        matched ??
        (await createDrive({
          volumeName: deriveVolumeName(importSourcePath, importVolumeInfo),
          displayName: null,
          totalCapacityBytes: importVolumeInfo?.totalBytes ?? null
        }));

      const result = await importFoldersFromVolume({
        driveId: driveToUse.id,
        sourcePath: importSourcePath,
        folders: importFolders
      });

      closeImportDialog();

      // Land the user on the drive detail page so they immediately see the
      // imported folders in context and can run a full scan next if they
      // want richer metadata.
      navigate(`/drives/${driveToUse.id}`);

      if (result.importedCount === 0) {
        setFeedback({
          tone: "info",
          title: matched ? "No new folders imported" : "Drive added (no folders imported)",
          messages: [
            result.skippedCount > 0
              ? `${result.skippedCount} folder${result.skippedCount === 1 ? " was" : "s were"} already in the catalog and skipped.`
              : "The selected location had no importable folders."
          ]
        });
      } else {
        const parts = [
          matched
            ? `${result.importedCount} folder${result.importedCount === 1 ? "" : "s"} added to "${driveToUse.displayName}".`
            : `Created "${driveToUse.displayName}" and imported ${result.importedCount} folder${result.importedCount === 1 ? "" : "s"}.`
        ];
        if (result.skippedCount > 0) {
          parts.push(`${result.skippedCount} already in catalog were skipped.`);
        }
        setFeedback({
          tone: "success",
          title: matched ? "Folders imported" : "Drive imported",
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

  const canUseImport = isDesktopScanAvailable();
  const matchedDriveForPreview = matchExistingDrive(importVolumeInfo);
  const previewExistingPaths = pathsAlreadyOnDrive(matchedDriveForPreview);
  const previewDriveName = importVolumeInfo
    ? importVolumeInfo.volumeName
    : importSourcePath
      ? deriveVolumeName(importSourcePath, null)
      : "";

  return (
    <div className="space-y-5">
      {importSourcePath && importFolders ? (
        <ImportFoldersDialog
          sourcePath={importSourcePath}
          folders={importFolders}
          existingPathsOnDrive={previewExistingPaths}
          isImporting={isImporting}
          onConfirm={() => void handleConfirmImportFromVolume()}
          onCancel={closeImportDialog}
          onPickAgain={() => void runImportFromVolume()}
          contextBanner={
            <ImportDriveBanner
              matchedDrive={matchedDriveForPreview}
              newDriveName={previewDriveName}
              volumeInfo={importVolumeInfo}
            />
          }
        />
      ) : null}

      <div className="flex items-center justify-between">
        <div />
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="button-primary"
            onClick={() => void runImportFromVolume()}
            disabled={!canUseImport || isPickingImport || isImporting || isMutating}
            title={canUseImport ? undefined : "The native volume picker is only available in the desktop app."}
          >
            {isPickingImport ? "Opening…" : "Import from mounted volume"}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => setIsCreateOpen((c) => !c)}
          >
            {isCreateOpen ? "Discard" : "Add drive"}
          </button>
        </div>
      </div>

      {feedback ? (
        <FeedbackNotice
          tone={feedback.tone}
          title={feedback.title}
          messages={feedback.messages}
        />
      ) : null}

      {!isLoading && drives.length > 0 ? (
        <div className="flex items-center gap-8 border-b pb-4" style={{ borderColor: "var(--color-border)" }}>
          <SummaryCard label="Drives" value={String(planningSummary.totalDrives)} />
          <SummaryCard label="Overcommitted" value={String(planningSummary.overcommittedCount)} />
          <SummaryCard label="Unknown impact" value={String(planningSummary.unknownImpactCount)} />
          <SummaryCard label="Reserved incoming" value={formatBytes(planningSummary.totalReservedIncomingBytes)} />
        </div>
      ) : null}

      {isCreateOpen ? (
        <CreateDriveForm
          form={driveForm}
          onChange={setDriveForm}
          onSubmit={handleCreateDrive}
          onCancel={() => setIsCreateOpen(false)}
          isMutating={isMutating}
        />
      ) : null}

      {isLoading ? (
        <div className="grid gap-5 lg:grid-cols-2" aria-busy="true" aria-label="Loading drives">
          {[0, 1, 2, 3].map((i) => <DriveCardSkeleton key={i} />)}
        </div>
      ) : planningRows.length === 0 ? (
        <EmptyState
          title="No drives in catalog"
          description="Point the app at a mounted volume to create a drive and pull in its top-level folders in one step — or add a drive manually."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="button-primary"
                onClick={() => void runImportFromVolume()}
                disabled={!canUseImport || isPickingImport || isImporting || isMutating}
              >
                {isPickingImport ? "Opening…" : "Import from mounted volume"}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setIsCreateOpen(true)}
              >
                Add drive manually
              </button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {planningRows.map((row) => (
            <DriveCard
              key={row.drive.id}
              drive={row.drive}
              projectCount={projectCounts[row.drive.id] ?? 0}
              scanSession={getDriveScanSession(row.drive, scanSessions)}
              health={row.health}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium" style={{ color: "var(--color-text-soft)" }}>{label}</p>
      <p className="mt-0.5 text-[18px] font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DriveCard
// ---------------------------------------------------------------------------

function DriveCard({
  drive,
  projectCount,
  scanSession,
  health
}: {
  drive: Drive;
  projectCount: number;
  scanSession: ScanSessionSnapshot | null;
  health?: DriveHealthState;
}) {
  const volumeInfo = useVolumeInfo(scanSession?.rootPath);
  const isScanning = scanSession?.status === "running";
  const scanFailed =
    scanSession?.status === "failed" || scanSession?.status === "interrupted";

  // Prefer stored drive values; fall back to live OS volume info when null.
  const effectiveTotalBytes = drive.totalCapacityBytes ?? volumeInfo?.totalBytes ?? null;
  const effectiveFreeBytes = drive.freeBytes ?? volumeInfo?.freeBytes ?? null;
  const effectiveUsedBytes =
    drive.usedBytes ??
    (effectiveTotalBytes !== null && volumeInfo?.freeBytes !== undefined
      ? effectiveTotalBytes - volumeInfo.freeBytes
      : null);

  const hasCapacity = effectiveTotalBytes !== null && effectiveUsedBytes !== null;
  const usedPercent = hasCapacity
    ? Math.max(4, (effectiveUsedBytes! / effectiveTotalBytes!) * 100)
    : null;
  const reservedPercent =
    hasCapacity && drive.reservedIncomingBytes > 0
      ? Math.max(3, (drive.reservedIncomingBytes / effectiveTotalBytes!) * 100)
      : null;

  return (
    <article
      className="app-panel flex flex-col overflow-hidden transition-transform duration-150 hover:-translate-y-px"
      style={{ padding: 0 }}
    >
      {isScanning ? (
        <div className="h-0.5 w-full shrink-0" style={{ background: "var(--color-accent)" }} />
      ) : null}

      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-[14px] font-semibold" style={{ color: "var(--color-text)" }}>
              {drive.displayName}
            </h4>
            {health && health !== "healthy" ? (
              <StatusBadge label={getDriveHealthLabel(health)} />
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-text-soft)" }}>
            {drive.volumeName !== drive.displayName ? <span>{drive.volumeName}</span> : null}
            {drive.createdManually ? <span>Manual</span> : null}
          </div>
          <ScanStatusLine drive={drive} scanSession={scanSession} />
        </div>
        {isScanning ? (
          <ScanStateIndicator state="scanning" />
        ) : scanFailed ? (
          <ScanStateIndicator state="failed" />
        ) : null}
      </div>

      <div className="px-4 pb-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "var(--color-text-soft)" }}>
            {hasCapacity ? `${formatBytes(effectiveUsedBytes!)} used` : "Unknown capacity"}
          </span>
          {usedPercent !== null ? (
            <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--color-text-muted)" }}>
              {Math.round((effectiveUsedBytes! / effectiveTotalBytes!) * 100)}%
            </span>
          ) : null}
        </div>
        <div
          className="overflow-hidden rounded-full"
          style={{ height: 6, background: "var(--color-surface-subtle)" }}
          role="progressbar"
          aria-valuenow={usedPercent !== null ? Math.round((effectiveUsedBytes! / effectiveTotalBytes!) * 100) : undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={hasCapacity ? `${Math.round((effectiveUsedBytes! / effectiveTotalBytes!) * 100)}% storage used` : "Storage usage unknown"}
        >
          {usedPercent !== null ? (
            <div
              className="capacity-bar-fill relative h-full rounded-full"
              style={{ width: `${usedPercent}%`, background: "var(--color-accent)" }}
            >
              {reservedPercent !== null ? (
                <div
                  className="absolute right-0 top-0 h-full rounded-full"
                  style={{ width: `${reservedPercent}%`, background: "var(--color-reserved)" }}
                />
              ) : null}
            </div>
          ) : (
            <div className="h-full w-1/3 rounded-full opacity-25" style={{ background: "var(--color-border-strong)" }} />
          )}
        </div>
        <div className="mt-1.5 flex gap-4 text-[11px]" style={{ color: "var(--color-text-soft)" }}>
          <span>{effectiveFreeBytes !== null ? `${formatBytes(effectiveFreeBytes)} free` : "Unknown free"}</span>
          <span>{projectCount} {projectCount === 1 ? "project" : "projects"}</span>
          {volumeInfo ? <span>{volumeInfo.filesystemType}</span> : null}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t px-4 py-2.5" style={{ borderColor: "var(--color-border)" }}>
        <Link to={`/drives/${drive.id}`} className="text-[13px] font-medium hover:underline" style={{ color: "var(--color-accent)" }}>
          Open
        </Link>
        <span style={{ color: "var(--color-border-strong)" }}>·</span>
        <Link to={`/projects?drive=${drive.id}`} className="text-[13px] font-medium hover:underline" style={{ color: "var(--color-accent)" }}>
          Projects
        </Link>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// DriveCard sub-components
// ---------------------------------------------------------------------------

function ScanStatusLine({
  drive,
  scanSession
}: {
  drive: Drive;
  scanSession: ScanSessionSnapshot | null;
}) {
  if (scanSession?.status === "running") {
    return (
      <p className="mt-1.5 text-[12px] font-medium" style={{ color: "var(--color-accent)" }}>
        Scanning in progress…
      </p>
    );
  }

  const lastScan = scanSession?.finishedAt ?? drive.lastScannedAt;

  return (
    <p className="mt-1.5 text-[12px]" style={{ color: "var(--color-text-soft)" }}>
      {lastScan ? `Last indexed ${formatDate(lastScan)}` : "Not yet scanned"}
    </p>
  );
}

function ScanStateIndicator({ state }: { state: "scanning" | "failed" }) {
  if (state === "scanning") {
    return (
      <span
        className="flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium"
        style={{ borderColor: "var(--color-accent-soft)", background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--color-accent)" }} />
        Scanning
      </span>
    );
  }

  return (
    <span
      className="rounded border px-1.5 py-0.5 text-[11px] font-medium"
      style={{ borderColor: "#dcc6c0", background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
    >
      Failed
    </span>
  );
}


// ---------------------------------------------------------------------------
// Create drive form
// ---------------------------------------------------------------------------

function CreateDriveForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  isMutating
}: {
  form: DriveFormState;
  onChange: (next: DriveFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  isMutating: boolean;
}) {
  return (
    <div className="app-panel px-4 py-4">
      <p className="mb-3 text-[13px] font-semibold" style={{ color: "var(--color-text)" }}>
        Add manual drive
      </p>

      <form className="grid gap-4 md:grid-cols-3" onSubmit={onSubmit}>
        <FormField label="Drive name" required>
          <input
            required
            value={form.volumeName}
            onChange={(e) => onChange({ ...form, volumeName: e.target.value })}
            className="field-shell w-full bg-transparent px-4 py-3 outline-none"
            placeholder="Archive Drive"
          />
        </FormField>
        <FormField label="Display name">
          <input
            value={form.displayName}
            onChange={(e) => onChange({ ...form, displayName: e.target.value })}
            className="field-shell w-full bg-transparent px-4 py-3 outline-none"
            placeholder="Studio Archive (optional)"
          />
        </FormField>
        <FormField label="Capacity (TB)">
          <input
            type="number"
            min="0"
            step="0.1"
            value={form.capacityTerabytes}
            onChange={(e) => onChange({ ...form, capacityTerabytes: e.target.value })}
            className="field-shell w-full bg-transparent px-4 py-3 outline-none"
            placeholder="4"
          />
        </FormField>

        <div className="flex items-center justify-end gap-3 pt-1 md:col-span-3">
          <button type="button" className="button-secondary" onClick={onCancel}>
            Discard
          </button>
          <button type="submit" className="button-success" disabled={isMutating}>
            {isMutating ? "Saving…" : "Create drive"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Volume-import helpers
// ---------------------------------------------------------------------------

/**
 * Derive a drive volumeName when the OS volume info lookup fails (non-
 * `/Volumes/...` paths on macOS, network mounts that don't expose StatFS
 * metadata, etc.). Falls back to the last segment of the picked path so a
 * user who picks `/Users/me/Archive Root` still ends up with a sensible
 * drive name of "Archive Root".
 */
function deriveVolumeName(sourcePath: string, volumeInfo: VolumeInfo | null): string {
  if (volumeInfo?.volumeName) return volumeInfo.volumeName;
  const cleaned = sourcePath.replace(/\/+$/, "");
  const lastSlash = cleaned.lastIndexOf("/");
  const basename = lastSlash >= 0 ? cleaned.slice(lastSlash + 1) : cleaned;
  return basename.trim() || "Imported volume";
}

// Slot content for the preview modal — tells the user whether their
// confirmation will attach to an existing drive or spin up a new one, plus
// the (best-effort) capacity pulled from the OS.
function ImportDriveBanner({
  matchedDrive,
  newDriveName,
  volumeInfo
}: {
  matchedDrive: Drive | null;
  newDriveName: string;
  volumeInfo: VolumeInfo | null;
}) {
  if (matchedDrive) {
    return (
      <div
        className="rounded-md border px-3 py-2 text-[12px]"
        style={{
          borderColor: "var(--color-border)",
          background: "var(--color-surface)",
          color: "var(--color-text-muted)"
        }}
      >
        Matches existing drive{" "}
        <span className="font-medium" style={{ color: "var(--color-text)" }}>
          {matchedDrive.displayName}
        </span>
        . Folders will be added to it.
      </div>
    );
  }
  return (
    <div
      className="rounded-md border px-3 py-2 text-[12px]"
      style={{
        borderColor: "var(--color-border)",
        background: "var(--color-surface)",
        color: "var(--color-text-muted)"
      }}
    >
      A new drive{" "}
      <span className="font-medium" style={{ color: "var(--color-text)" }}>
        {newDriveName}
      </span>{" "}
      will be created for this volume
      {volumeInfo?.totalBytes
        ? ` (${formatBytes(volumeInfo.totalBytes)} capacity)`
        : ""}
      .
    </div>
  );
}

function FormField({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span
        className="text-[11px] font-semibold uppercase tracking-[0.16em]"
        style={{ color: "var(--color-text-soft)" }}
      >
        {label}
        {required ? (
          <span className="ml-1" style={{ color: "var(--color-danger)" }}>
            *
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}
