import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@drive-project-catalog/ui";
import type { Drive, ScanSessionSnapshot } from "@drive-project-catalog/domain";
import { buildStoragePlanningRows } from "@drive-project-catalog/data";
import { useShortcut } from "../app/useShortcut";
import { useCatalogStore } from "../app/providers";
import { useImportFromVolume } from "../app/useImportFromVolume";
import { formatBytes } from "./dashboardHelpers";
import { useFeedbackDismiss, type FeedbackState } from "./feedbackHelpers";
import { ImportFoldersDialog } from "./ImportFoldersDialog";
import { DriveCardSkeleton, FeedbackNotice } from "./pagePrimitives";
import { DriveCreateForm, type DriveFormState, initialDriveForm } from "./drives/DriveCreateForm";
import { DriveCard } from "./drives/DriveCard";

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

export function DrivesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { drives, projects, scanSessions, isLoading, isMutating, createDrive, importFoldersFromVolume } =
    useCatalogStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [driveForm, setDriveForm] = useState<DriveFormState>(initialDriveForm);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const projectCounts = useDriveMetrics(projects);

  const {
    importSourcePath,
    importFolders,
    importVolumeInfo,
    isPickingImport,
    isImporting,
    matchedDrive: matchedDriveForPreview,
    previewExistingPaths,
    previewDriveName,
    canUseImport,
    runImportFromVolume,
    closeImportDialog,
    handleConfirmImportFromVolume,
  } = useImportFromVolume({
    drives,
    projects,
    createDrive,
    importFoldersFromVolume,
    navigate,
    setFeedback: (f) => setFeedback(f),
  });

  const planningRows = useMemo(() => buildStoragePlanningRows(drives, projects), [drives, projects]);

  // Handle location state from command palette actions (Register Drive / Import Folders)
  const handledLocationKey = useRef<string | undefined>(undefined);
  useEffect(() => {
    const state = location.state as { openCreate?: boolean; openImport?: boolean } | null;
    if (!state || handledLocationKey.current === location.key) return;
    handledLocationKey.current = location.key;
    if (state.openCreate) {
      setIsCreateOpen(true);
    } else if (state.openImport && canUseImport) {
      void runImportFromVolume();
    }
  }, [location, canUseImport, runImportFromVolume]);

  useShortcut({ key: "n", meta: true, onTrigger: () => setIsCreateOpen((c) => !c), enabled: !isMutating });
  useFeedbackDismiss(feedback, setFeedback);

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

  return (
    <div className="space-y-6 pt-2">
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

      {!isLoading && drives.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setIsCreateOpen((c) => !c)}
          >
            <Icon name="plus" size={12} color="currentColor" />
            {isCreateOpen ? "Discard" : "Add manually"}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => void runImportFromVolume()}
            disabled={!canUseImport || isPickingImport || isImporting || isMutating}
            title={canUseImport ? undefined : "The native volume picker is only available in the desktop app."}
          >
            <Icon name="scan" size={12} color="currentColor" />
            {isPickingImport ? "Opening…" : "Scan connected drive"}
          </button>
        </div>
      ) : null}

      {feedback ? (
        <FeedbackNotice tone={feedback.tone} title={feedback.title} messages={feedback.messages} />
      ) : null}

      {isCreateOpen ? (
        <DriveCreateForm
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
      ) : drives.length === 0 && projects.length === 0 && !isCreateOpen ? (
        <div className="flex items-start pt-6">
          <div style={{ maxWidth: 520 }}>
            <span
              className="mb-5 inline-flex h-9 w-9 items-center justify-center rounded-[10px]"
              style={{ background: "var(--surface-container-low)" }}
              aria-hidden="true"
            >
              <Icon name="hardDrive" size={18} color="var(--ink-2)" />
            </span>
            <h2
              className="text-[22px] font-semibold leading-tight"
              style={{ color: "var(--ink)", letterSpacing: "-0.01em", margin: 0 }}
            >
              Add your first drive.
            </h2>
            <p
              className="mt-3 text-[14px] leading-relaxed"
              style={{ color: "var(--ink-2)", margin: 0 }}
            >
              Scanning a connected drive creates the drive record and imports its top-level
              folders in one step. Add manually if the volume isn&rsquo;t mounted.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void runImportFromVolume()}
                disabled={!canUseImport || isPickingImport || isImporting || isMutating}
              >
                <Icon name="scan" size={13} color="currentColor" />
                {isPickingImport ? "Opening…" : "Scan connected drive"}
              </button>
              <button type="button" className="btn" onClick={() => setIsCreateOpen(true)}>
                Add manually
              </button>
            </div>
          </div>
        </div>
      ) : (
        <section className="space-y-3">
          <h2 className="h-section" style={{ margin: 0 }}>Drive inventory</h2>
          <div className="grid gap-4 lg:grid-cols-2">
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
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Volume-import preview banner
// ---------------------------------------------------------------------------

function ImportDriveBanner({
  matchedDrive,
  newDriveName,
  volumeInfo
}: {
  matchedDrive: Drive | null;
  newDriveName: string;
  volumeInfo: { totalBytes?: number } | null;
}) {
  if (matchedDrive) {
    return (
      <div
        className="rounded-[7px] border px-3 py-2 text-[12px]"
        style={{ borderColor: "var(--hairline)", background: "var(--surface-inset)", color: "var(--ink-2)" }}
      >
        Matches existing drive{" "}
        <span className="font-medium" style={{ color: "var(--ink)" }}>{matchedDrive.displayName}</span>
        . Folders will be added to it.
      </div>
    );
  }
  return (
    <div
      className="rounded-[7px] border px-3 py-2 text-[12px]"
      style={{ borderColor: "var(--hairline)", background: "var(--surface-inset)", color: "var(--ink-2)" }}
    >
      A new drive{" "}
      <span className="font-medium" style={{ color: "var(--ink)" }}>{newDriveName}</span>{" "}
      will be created for this volume
      {volumeInfo?.totalBytes ? ` (${formatBytes(volumeInfo.totalBytes)} capacity)` : ""}.
    </div>
  );
}

