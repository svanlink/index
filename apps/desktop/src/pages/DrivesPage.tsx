import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  AlertTitle,
  Avatar,
  Box,
  Button,
  Chip,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { Icon } from "@drive-project-catalog/ui";
import type { Drive, ScanSessionSnapshot } from "@drive-project-catalog/domain";
import {
  buildStoragePlanningRows,
  getDriveHealthLabel,
  type DriveHealthState
} from "@drive-project-catalog/data";
import { getVolumeInfo, isDesktopScanAvailable, useVolumeInfo, type VolumeInfo } from "../app/scanCommands";
import {
  enumerateVolumeFolders,
  pickVolumeRoot,
  type VolumeFolderEntry
} from "../app/volumeImportCommands";
import {
  copyTextToClipboard,
  openPathInFinder,
  showNativeContextMenu,
  showPathInFinder
} from "../app/nativeContextMenu";
import { useShortcut } from "../app/useShortcut";
import { useCatalogStore } from "../app/providers";
import { formatBytes, formatDate } from "./dashboardHelpers";
import { useFeedbackDismiss, type FeedbackState } from "./feedbackHelpers";
import { ImportFoldersDialog } from "./ImportFoldersDialog";
import { getDriveColor } from "./driveColor";

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
  // → healthy). Previously these lived on a separate /storage route; folding
  // them here means the drives list doubles as the storage-planning surface.
  const planningRows = useMemo(() => buildStoragePlanningRows(drives, projects), [drives, projects]);

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
        if (result.cleanupReviewCount > 0) {
          parts.push(`${result.cleanupReviewCount} need cleanup and were sent to Rename Review.`);
        }
        const issueParts = buildImportCleanupIssueParts(result);
        if (issueParts.length > 0) {
          parts.push(`Detected: ${issueParts.join(", ")}.`);
        }
        if (result.skippedCount > 0) {
          parts.push(`${result.skippedCount} already in catalog were skipped.`);
        }
        setFeedback({
          tone: result.cleanupReviewCount > 0 ? "warning" : "success",
          title: result.cleanupReviewCount > 0
            ? matched ? "Folders imported with cleanup needed" : "Drive imported with cleanup needed"
            : matched ? "Folders imported" : "Drive imported",
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
    <Stack spacing={2}>
      {/* sr-only h1 for WCAG 2.4.6 and test identification. The top-nav
          breadcrumb names this section for sighted users; the h1 exists for
          screen readers and automated tests only. */}
      <h1 className="sr-only">Drives</h1>
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

      {/* DESIGN.md §7: no 56px hero on list pages, no 4-tile KPI grid.
          Breadcrumb in the top nav already names the section. Page opens
          directly into the actions + inventory. */}
      {!isLoading && drives.length > 0 ? (
        <Stack direction="row" sx={{ justifyContent: "flex-end", gap: 1, flexWrap: "wrap" }}>
          <Button variant="outlined" onClick={() => setIsCreateOpen((c) => !c)} startIcon={<Icon name="plus" size={16} color="currentColor" />}>
            {isCreateOpen ? "Discard" : "Add manually"}
          </Button>
          <Button
            onClick={() => void runImportFromVolume()}
            disabled={!canUseImport || isPickingImport || isImporting || isMutating}
            title={
              canUseImport
                ? undefined
                : "The native volume picker is only available in the desktop app."
            }
            startIcon={<Icon name="scan" size={16} color="currentColor" />}
          >
            {isPickingImport ? "Opening…" : "Scan connected drive"}
          </Button>
        </Stack>
      ) : null}

      {feedback ? (
        <FeedbackAlert tone={feedback.tone} title={feedback.title} messages={feedback.messages} />
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
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "repeat(2, 1fr)" } }} aria-busy="true" aria-label="Loading drives">
          {[0, 1, 2, 3].map((i) => (
            <Paper key={i} variant="outlined" sx={{ p: 2 }}>
              <Skeleton width="55%" />
              <Skeleton width="34%" />
              <Skeleton sx={{ mt: 2 }} height={8} />
              <Stack direction="row" sx={{ gap: 2, mt: 1 }}>
                <Skeleton width={80} />
                <Skeleton width={80} />
              </Stack>
            </Paper>
          ))}
        </Box>
      ) : planningRows.length === 0 && !isCreateOpen ? (
        <Paper variant="outlined" sx={{ p: 4, maxWidth: 620 }}>
          <Stack spacing={2.5}>
            <Avatar sx={{ bgcolor: "primary.main", width: 44, height: 44 }}>
              <Icon name="hardDrive" size={22} color="currentColor" />
            </Avatar>
            <Box>
              <Typography variant="h4" component="h2" gutterBottom>
              Add your first drive.
              </Typography>
              <Typography variant="body1" color="text.secondary">
              Scanning a connected drive creates the drive record and imports its top-level
              folders in one step. Add manually if the volume isn&rsquo;t mounted.
              </Typography>
            </Box>
            <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
              <Button
                onClick={() => void runImportFromVolume()}
                disabled={!canUseImport || isPickingImport || isImporting || isMutating}
                startIcon={<Icon name="scan" size={16} color="currentColor" />}
              >
                {isPickingImport ? "Opening…" : "Scan connected drive"}
              </Button>
              <Button variant="outlined" onClick={() => setIsCreateOpen(true)}>
                Add manually
              </Button>
            </Stack>
          </Stack>
        </Paper>
      ) : (
        <Box component="section">
          <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>
            Drive inventory
          </Typography>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "repeat(2, 1fr)" } }}>
            {planningRows.map((row) => (
              <DriveCard
                key={row.drive.id}
                drive={row.drive}
                projectCount={projectCounts[row.drive.id] ?? 0}
                scanSession={getDriveScanSession(row.drive, scanSessions)}
                health={row.health}
              />
            ))}
          </Box>
        </Box>
      )}
    </Stack>
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
  const navigate = useNavigate();
  const volumeInfo = useVolumeInfo(scanSession?.rootPath);
  const isScanning = scanSession?.status === "running";
  const scanFailed =
    scanSession?.status === "failed" || scanSession?.status === "interrupted";
  const driveColor = getDriveColor(drive.id);

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
    ? Math.min(100, Math.max(2, (effectiveUsedBytes! / effectiveTotalBytes!) * 100))
    : null;
  const usedPercentInt = hasCapacity
    ? Math.round((effectiveUsedBytes! / effectiveTotalBytes!) * 100)
    : null;
  const reservedPercent =
    hasCapacity && drive.reservedIncomingBytes > 0
      ? Math.min(100 - (usedPercent ?? 0), Math.max(1, (drive.reservedIncomingBytes / effectiveTotalBytes!) * 100))
      : null;

  const capacityFooter = hasCapacity
    ? `${formatBytes(effectiveUsedBytes!)} of ${formatBytes(effectiveTotalBytes!)}`
    : "Unknown capacity";

  const lastScan = scanSession?.finishedAt ?? drive.lastScannedAt;
  const lastScanLabel = isScanning
    ? "Scanning…"
    : lastScan
      ? formatDate(lastScan)
      : "Never";
  const openDrivePath = `/drives/${drive.id}`;
  const finderPath = drive.mountPath ?? scanSession?.rootPath ?? null;

  return (
    <Paper
      variant="outlined"
      onClick={() => navigate(openDrivePath)}
      onContextMenu={(event) => {
        void showNativeContextMenu(event, [
          { text: "Open Drive", action: () => navigate(openDrivePath) },
          {
            text: "Show in Finder",
            enabled: Boolean(finderPath),
            action: () => void showPathInFinder(finderPath)
          },
          {
            text: "Open in Finder",
            enabled: Boolean(finderPath),
            action: () => void openPathInFinder(finderPath)
          },
          { separator: true },
          { text: "Copy Drive Name", action: () => void copyTextToClipboard(drive.displayName) },
          { text: "Copy Volume Name", action: () => void copyTextToClipboard(drive.volumeName) },
          {
            text: "Copy Mount Path",
            enabled: Boolean(finderPath),
            action: () => void copyTextToClipboard(finderPath ?? "")
          }
        ]);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(openDrivePath);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${drive.displayName}`}
      sx={{
        p: 2.25,
        cursor: "pointer",
        transition: "border-color 120ms ease, box-shadow 120ms ease, background-color 120ms ease",
        "&:hover": {
          borderColor: "primary.light",
          bgcolor: "action.hover",
          boxShadow: 1
        },
        "&:focus-visible": {
          outline: "3px solid rgba(25, 118, 210, 0.22)",
          outlineOffset: 2
        }
      }}
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
          <Avatar
            variant="rounded"
            sx={{
              width: 42,
              height: 42,
              bgcolor: "action.selected",
              color: "text.secondary",
              position: "relative",
              "&::after": {
                content: '""',
                position: "absolute",
                right: 7,
                bottom: 7,
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: driveColor,
                border: "2px solid",
                borderColor: "background.paper"
              }
            }}
          >
            <Icon name="hardDrive" size={22} color="currentColor" />
          </Avatar>

          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Typography variant="h6" component="h3" noWrap sx={{ fontSize: 18, minWidth: 0, maxWidth: "100%" }}>
                {drive.displayName}
              </Typography>
            {health && health !== "healthy" ? (
                <Chip size="small" color="warning" variant="outlined" label={getDriveHealthLabel(health)} />
            ) : null}
              {isScanning ? <Chip size="small" color="info" variant="outlined" label="Running" /> : null}
              {scanFailed && !isScanning ? <Chip size="small" color="error" variant="outlined" label="Failed" /> : null}
            </Stack>

            <Typography variant="body2" color="text.secondary" noWrap>
              {[
                drive.volumeName !== drive.displayName ? drive.volumeName : null,
                drive.createdManually ? "Manual" : null,
                !drive.createdManually && volumeInfo?.filesystemType ? volumeInfo.filesystemType : null
              ].filter(Boolean).join(" · ")}
            </Typography>
          </Box>

          <Box sx={{ color: "text.disabled", pt: 0.5 }}>
            <Icon name="chevron" size={16} color="currentColor" />
          </Box>
        </Stack>

        <Box>
          <Box
            role="progressbar"
            aria-valuenow={usedPercentInt ?? undefined}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={usedPercentInt !== null ? `${usedPercentInt}% storage used` : "Storage usage unknown"}
            sx={{
              position: "relative",
              height: 10,
              overflow: "hidden",
              borderRadius: 999,
              bgcolor: "action.selected"
            }}
          >
            <Box
              sx={{
                position: "absolute",
                insetBlock: 0,
                left: 0,
                width: usedPercent !== null ? `${usedPercent}%` : "28%",
                bgcolor: usedPercent !== null ? driveColor : "action.disabled",
                opacity: usedPercent !== null ? 1 : 0.35
              }}
            />
            {reservedPercent !== null ? (
              <Box
                sx={{
                  position: "absolute",
                  insetBlock: 0,
                  left: `${usedPercent ?? 0}%`,
                  width: `${reservedPercent}%`,
                  bgcolor: "warning.main",
                  opacity: 0.8
                }}
              />
            ) : null}
          </Box>
          <Stack direction="row" sx={{ gap: 1.5, mt: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Typography variant="caption" color="text.primary" sx={{ fontWeight: 500 }}>
              {usedPercentInt !== null ? `${usedPercentInt}% used` : "Unknown"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {capacityFooter}
            </Typography>
          </Stack>
        </Box>

        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1.5,
            pt: 1.5,
            borderTop: 1,
            borderColor: "divider"
          }}
        >
          <MetaStat label={projectCount === 1 ? "project" : "projects"} value={projectCount.toString()} />
          <MetaStat label="free" value={effectiveFreeBytes !== null ? formatBytes(effectiveFreeBytes) : "Unknown"} />
          {drive.reservedIncomingBytes > 0 ? (
            <MetaStat label="reserved" value={formatBytes(drive.reservedIncomingBytes)} />
          ) : null}
          <MetaStat label="last scan" value={lastScanLabel} />
        </Box>
      </Stack>
    </Paper>
  );
}

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 96 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography variant="body2" color="text.primary" noWrap>
        {value}
      </Typography>
    </Box>
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
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6">Add manual drive</Typography>
          <Typography variant="body2" color="text.secondary">
            Use this when the volume is not mounted or you want to reserve a drive record.
          </Typography>
        </Box>

        <Box component="form" onSubmit={onSubmit}>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" } }}>
            <TextField
            required
            label="Drive name"
            value={form.volumeName}
            onChange={(e) => onChange({ ...form, volumeName: e.target.value })}
            placeholder="Archive Drive"
          />
            <TextField
            label="Display name"
            value={form.displayName}
            onChange={(e) => onChange({ ...form, displayName: e.target.value })}
            placeholder="Studio Archive (optional)"
          />
            <TextField
            label="Capacity (TB)"
            type="number"
            value={form.capacityTerabytes}
            onChange={(e) => onChange({ ...form, capacityTerabytes: e.target.value })}
            placeholder="4"
            slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
          />
          </Box>
          <Stack direction="row" sx={{ justifyContent: "flex-end", gap: 1, mt: 2.5 }}>
            <Button type="button" variant="outlined" onClick={onCancel}>
            Discard
            </Button>
            <Button type="submit" disabled={isMutating}>
            {isMutating ? "Saving…" : "Create drive"}
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
}

function FeedbackAlert({
  tone,
  title,
  messages
}: {
  tone: "success" | "warning" | "error" | "info";
  title: string;
  messages: string[];
}) {
  return (
    <Alert severity={tone}>
      <AlertTitle>{title}</AlertTitle>
      {messages.length === 1 ? (
        <Typography variant="body2">{messages[0]}</Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, pl: 2 }}>
          {messages.map((message) => (
            <li key={message}>
              <Typography variant="body2" component="span">{message}</Typography>
            </li>
          ))}
        </Box>
      )}
    </Alert>
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
        className="rounded-[7px] border px-3 py-2 text-[12px]"
        style={{
          borderColor: "var(--hairline)",
          background: "var(--surface-inset)",
          color: "var(--ink-2)"
        }}
      >
        Matches existing drive{" "}
        <span className="font-medium" style={{ color: "var(--ink)" }}>
          {matchedDrive.displayName}
        </span>
        . Folders will be added to it.
      </div>
    );
  }
  return (
    <div
      className="rounded-[7px] border px-3 py-2 text-[12px]"
      style={{
        borderColor: "var(--hairline)",
        background: "var(--surface-inset)",
        color: "var(--ink-2)"
      }}
    >
      A new drive{" "}
      <span className="font-medium" style={{ color: "var(--ink)" }}>
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
