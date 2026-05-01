import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { categoryValues, type Category, type FolderType, type ProjectScanEvent } from "@drive-project-catalog/domain";
import { Icon } from "@drive-project-catalog/ui";

import { validateSingleProjectMove } from "../app/catalogValidation";
import { useCatalogStore } from "../app/providers";
import { useAsyncAction } from "../app/useAsyncAction";
import { useOptimisticMutation } from "../app/useOptimisticMutation";
import {
  formatBytes,
  formatDate,
  formatParsedDate,
  getDriveName,
  getFolderTypeLabel,
  getProjectName,
  getProjectStatusBadges
} from "./dashboardHelpers";
import { ConfirmModal, EmptyState, FeedbackNotice, LoadingState, SectionCard, StatusBadge } from "./pagePrimitives";
import {
  archiveProject,
  pickArchiveRoot,
  type ArchiveResult
} from "../app/archiveCommands";
import { showPathInFinder } from "../app/nativeContextMenu";

interface ProjectMetadataFormState {
  correctedDate: string;
  correctedClient: string;
  correctedProject: string;
  category: Category | "";
  folderType: FolderType | "";
}

/** State machine for the Archive & Freeze workflow modal. */
type ArchiveStage = "idle" | "picking" | "running" | "done" | "error";

export function ProjectDetailPage() {
  const {
    drives,
    projects,
    selectedProject,
    selectProject,
    listProjectScanEvents,
    updateProjectMetadata,
    deleteProject,
    planProjectMove,
    confirmProjectMove,
    cancelProjectMove,
    isLoading,
    isMutating
  } = useCatalogStore();
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [events, setEvents] = useState<ProjectScanEvent[]>([]);
  const [isEventsLoading, setIsEventsLoading] = useState(true);
  const [metadataForm, setMetadataForm] = useState<ProjectMetadataFormState>({
    correctedDate: "",
    correctedClient: "",
    correctedProject: "",
    category: "",
    folderType: ""
  });
  const [targetDriveId, setTargetDriveId] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "warning" | "error" | "info"; title: string; messages: string[] } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Archive & Freeze workflow — opens a modal that walks the user through
  // selecting an archive root, hashes every file, moves the folder, and
  // marks the destination immutable via `chflags uchg`. The Rust side
  // handles the heavy lifting in a background task.
  const [archiveStage, setArchiveStage] = useState<ArchiveStage>("idle");
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveResult, setArchiveResult] = useState<ArchiveResult | null>(null);
  const [lockAfterArchive, setLockAfterArchive] = useState(true);

  useEffect(() => {
    selectProject(projectId || null);

    return () => {
      selectProject(null);
    };
  }, [projectId, selectProject]);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      setIsEventsLoading(true);
      try {
        const nextEvents = await listProjectScanEvents(projectId);
        if (isMounted) {
          setEvents(nextEvents);
        }
      } finally {
        if (isMounted) {
          setIsEventsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [listProjectScanEvents, projectId]);

  useEffect(() => {
    if (!selectedProject) {
      return;
    }

    setMetadataForm({
      correctedDate: selectedProject.correctedDate ?? "",
      correctedClient: selectedProject.correctedClient ?? "",
      correctedProject: selectedProject.correctedProject ?? "",
      category: selectedProject.category ?? "",
      folderType: selectedProject.folderType
    });
    setTargetDriveId(selectedProject.targetDriveId ?? "");
  }, [selectedProject]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  const project = selectedProject;

  // S6/H10 — async actions use useAsyncAction so event handlers never leak
  // unhandled promise rejections. The hook normalises unknown-shape errors
  // and keeps the onClick signature synchronous.
  const confirmMoveAction = useAsyncAction(
    async () => {
      if (!project) throw new Error("No project selected");
      await confirmProjectMove(project.id);
      return project;
    },
    {
      onSuccess: (p) => {
        setFeedback({
          tone: "success",
          title: "Move confirmed",
          messages: [
            `Current drive updated to ${getDriveName(drives, p.targetDriveId)}.`,
            "Pending move state and reserved incoming impact were cleared."
          ]
        });
      },
      onError: (error) => {
        setFeedback({
          tone: "error",
          title: "Move confirmation failed",
          messages: [error.message || "The move could not be confirmed."]
        });
      }
    }
  );

  const cancelMoveAction = useAsyncAction(
    async () => {
      if (!project) throw new Error("No project selected");
      await cancelProjectMove(project.id);
    },
    {
      onSuccess: () => {
        setFeedback({
          tone: "info",
          title: "Move cancelled",
          messages: ["Pending move state and target drive were cleared."]
        });
      },
      onError: (error) => {
        setFeedback({
          tone: "error",
          title: "Move cancellation failed",
          messages: [error.message || "The move could not be cancelled."]
        });
      }
    }
  );

  const metadataMutation = useOptimisticMutation(
    (payload: Parameters<typeof updateProjectMetadata>[0]) => updateProjectMetadata(payload),
    {
      onSuccess: () =>
        setFeedback({
          tone: "success",
          title: "Metadata saved",
          messages: ["Corrected fields were updated for this project."]
        }),
      onRollback: (error) =>
        setFeedback({
          tone: "error",
          title: "Save failed",
          messages: [error.message || "The metadata could not be saved."]
        })
    }
  );

  const moveValidation = useMemo(
    () =>
      project
        ? validateSingleProjectMove({
            project,
            targetDriveId,
            drives,
            allProjects: projects
          })
        : { errors: [], warnings: [] },
    [drives, project, projects, targetDriveId]
  );
  const targetDrive = drives.find((drive) => drive.id === targetDriveId) ?? null;

  if (isLoading) {
    return <LoadingState label="Loading project detail" />;
  }

  if (!project) {
    return (
      <EmptyState
        title="Project not found"
        description="The requested project is not available in the current local catalog."
      />
    );
  }

  const currentProject = project;

  function handleMetadataSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Only send folderType when the user is intentionally upgrading away from personal_folder.
    // Sending null preserves the existing type, which is the right default for all other saves.
    const reclassifyTarget =
      metadataForm.folderType &&
      metadataForm.folderType !== currentProject.folderType
        ? (metadataForm.folderType as FolderType)
        : null;

    metadataMutation.mutate({
      projectId: currentProject.id,
      correctedDate: metadataForm.correctedDate || null,
      correctedClient: metadataForm.correctedClient || null,
      correctedProject: metadataForm.correctedProject || null,
      category: metadataForm.category || null,
      folderType: reclassifyTarget
    });
  }

  async function handlePlanMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!targetDriveId) {
      return;
    }
    if (moveValidation.errors.length > 0) {
      setFeedback({
        tone: "error",
        title: "Move planning blocked",
        messages: moveValidation.errors
      });
      return;
    }

    try {
      await planProjectMove(currentProject.id, targetDriveId);
      setFeedback({
        tone: moveValidation.warnings.length > 0 ? "warning" : "success",
        title: "Move target updated",
        messages: [
          `Target drive set to ${targetDrive?.displayName ?? "the selected drive"}.`,
          ...(moveValidation.warnings.length > 0
            ? moveValidation.warnings
            : [
                currentProject.sizeBytes === null
                  ? "Reserved impact remains unknown until a size is available."
                  : `Reserved impact: ${formatBytes(currentProject.sizeBytes)}.`
              ])
        ]
      });
    } catch (error) {
      setFeedback({ tone: "error", title: "Move planning failed", messages: [error instanceof Error ? error.message : "The move could not be planned."] });
    }
  }

  const moveImpactLabel =
    currentProject.sizeBytes === null
      ? "Unknown"
      : formatBytes(currentProject.sizeBytes);
  const currentDriveName = getDriveName(drives, currentProject.currentDriveId);
  const targetDriveName = getDriveName(drives, currentProject.targetDriveId);
  const isMovePending = currentProject.moveStatus === "pending";
  const relatedProjects = projects
    .filter((candidate) => {
      if (candidate.id === currentProject.id) return false;
      const candidateClient = candidate.correctedClient ?? candidate.parsedClient;
      const currentClient = currentProject.correctedClient ?? currentProject.parsedClient;
      return Boolean(currentClient) && candidateClient === currentClient;
    })
    .slice(0, 3);
  const hasClassificationDrift =
    !isEventsLoading &&
    events.length > 0 &&
    events[0]?.observedFolderType != null &&
    events[0].observedFolderType !== currentProject.folderType;

  async function handleDeleteProject() {
    try {
      await deleteProject(currentProject.id);
      navigate("/projects");
    } catch (error) {
      setShowDeleteConfirm(false);
      setFeedback({ tone: "error", title: "Delete failed", messages: [error instanceof Error ? error.message : "The project could not be deleted."] });
    }
  }

  // ── Archive & Freeze ────────────────────────────────────────────────────
  // Two-step flow: (1) user picks the archive root via the native folder
  // picker, (2) Rust hashes the folder, writes the manifest, moves it, and
  // optionally locks it. Stage transitions are explicit so the modal can
  // render the right copy/affordances at each step.

  async function handleStartArchive() {
    setArchiveError(null);
    setArchiveResult(null);
    setArchiveStage("picking");

    if (!currentProject.folderPath) {
      setArchiveStage("error");
      setArchiveError(
        "This project has no on-disk folder path. Re-import the folder before archiving."
      );
      return;
    }

    let archiveRoot: string | null = null;
    try {
      archiveRoot = await pickArchiveRoot();
    } catch (e) {
      setArchiveStage("error");
      setArchiveError(e instanceof Error ? e.message : "Could not open folder picker.");
      return;
    }

    if (!archiveRoot) {
      // User cancelled.
      setArchiveStage("idle");
      return;
    }

    setArchiveStage("running");
    try {
      const result = await archiveProject({
        folderPath: currentProject.folderPath,
        archiveRoot,
        lockAfterArchive
      });
      setArchiveResult(result);
      setArchiveStage("done");
    } catch (e) {
      setArchiveStage("error");
      setArchiveError(e instanceof Error ? e.message : "The archive operation failed.");
    }
  }

  function closeArchiveModal() {
    setArchiveStage("idle");
    setArchiveError(null);
    setArchiveResult(null);
  }

  const statusBadges = getProjectStatusBadges(currentProject);
  const displayClient = currentProject.correctedClient ?? currentProject.parsedClient ?? "No client";
  const displayDate = formatParsedDate(currentProject.correctedDate ?? currentProject.parsedDate);

  return (
    <div className="space-y-6">
      {showDeleteConfirm ? (
        <ConfirmModal
          title="Delete project?"
          description={`"${getProjectName(currentProject)}" will be permanently removed from the catalog. This cannot be undone.`}
          confirmLabel="Delete project"
          onConfirm={() => void handleDeleteProject()}
          onCancel={() => setShowDeleteConfirm(false)}
          isLoading={isMutating}
        />
      ) : null}

      {archiveStage !== "idle" ? (
        <ArchiveWorkflowModal
          stage={archiveStage}
          error={archiveError}
          result={archiveResult}
          lockAfterArchive={lockAfterArchive}
          folderPath={currentProject.folderPath}
          onLockChange={setLockAfterArchive}
          onClose={closeArchiveModal}
          onRetry={() => void handleStartArchive()}
        />
      ) : null}

      <div className="card overflow-hidden">
        <div
          className="flex flex-wrap items-center gap-2 border-b px-5 py-4"
          style={{ borderColor: "var(--hairline)" }}
        >
          <Link to="/projects" className="btn btn-ghost btn-sm">
            <Icon name="chevron" size={11} className="rotate-180" />
            Projects
          </Link>
          <div className="flex-1" />
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void showPathInFinder(currentProject.folderPath)}
            disabled={!currentProject.folderPath}
          >
            <Icon name="folder" size={11} />
            Show in Finder
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              document
                .getElementById("project-metadata-card")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            <Icon name="edit" size={11} />
            Edit metadata
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void handleStartArchive()}
            disabled={archiveStage === "picking" || archiveStage === "running"}
            title="Generate SHA-256 manifest, move to archive drive, and lock"
          >
            <Icon name="download" size={11} />
            Archive…
          </button>
          <button type="button" className="btn btn-sm btn-danger" onClick={() => setShowDeleteConfirm(true)}>
            <Icon name="trash" size={11} />
            Delete
          </button>
        </div>

        <div className="px-6 py-6">
          <div className="flex flex-wrap items-start gap-5">
            <div className="min-w-0 flex-1">
              <div className="eyebrow mono">
                {displayDate} · {displayClient}
              </div>
              <h1 className="h-title" style={{ margin: "6px 0 0" }}>
                {getProjectName(currentProject)}
              </h1>
              <p className="mono mt-2 text-[12px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
                {currentProject.folderPath ?? currentProject.folderName}
              </p>
              {statusBadges.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {statusBadges.map((badge) => (
                    <StatusBadge key={badge} label={badge} />
                  ))}
                </div>
              ) : null}
            </div>

            <div
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px]"
              style={{ background: "var(--surface-inset)" }}
            >
              <Icon name="folder" size={24} color="var(--ink-2)" />
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
            <MetaField label="Current drive" value={currentDriveName} />
            <MetaField
              label={isMovePending ? "Target drive" : "Size"}
              value={isMovePending ? targetDriveName : formatBytes(currentProject.sizeBytes)}
              tone={isMovePending ? "accent" : undefined}
            />
            <MetaField label="Type" value={getFolderTypeLabel(currentProject.folderType)} />
            <MetaField label="Category" value={currentProject.category ?? "Uncategorized"} />
          </dl>
        </div>
      </div>

      {feedback ? (
        <FeedbackNotice tone={feedback.tone} title={feedback.title} messages={feedback.messages} />
      ) : null}

      {isMovePending ? (
        <div
          className="rounded-[16px] border px-5 py-4"
          style={{
            borderColor: "var(--accent)",
            background: "var(--accent-soft)"
          }}
        >
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="eyebrow" style={{ color: "var(--accent-ink)" }}>
                Move in progress
              </div>
              <div className="mt-1 text-[14px] font-semibold tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
                {currentDriveName} → {targetDriveName}
              </div>
              <p className="mt-2 text-[12.5px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
                {targetDriveName} has reserved {moveImpactLabel} for this move. Drag the folder outside the app, then confirm to update the catalog.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-sm"
                disabled={isMutating || cancelMoveAction.isPending}
                onClick={cancelMoveAction.run}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={isMutating || confirmMoveAction.isPending}
                onClick={confirmMoveAction.run}
              >
                <Icon name="check" size={11} color="currentColor" />
                Confirm moved
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <SectionCard
            title="Parsed fields"
            description="Values inferred from the folder name on disk. These are immutable — corrections live in the next section."
          >
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <MetaField label="Date" value={formatParsedDate(currentProject.parsedDate)} />
              <MetaField label="Client" value={currentProject.parsedClient ?? "—"} />
              <MetaField label="Project" value={currentProject.parsedProject ?? "—"} />
              <MetaField label="Folder name" value={currentProject.folderName} mono />
            </dl>
          </SectionCard>

          <SectionCard
            title="Scan activity"
            description="Observed classifications and timestamps stored from scans of this project."
          >
            {hasClassificationDrift ? (
              <div className="mb-4">
                <FeedbackNotice
                  tone="info"
                  title="Classification drift detected"
                  messages={[
                    `Most recent scan classified this folder as "${getFolderTypeLabel(events[0].observedFolderType!)}", but the stored type is "${getFolderTypeLabel(currentProject.folderType)}".`,
                    "The stored type is preserved. Use the Edit metadata form to reclassify if needed."
                  ]}
                />
              </div>
            ) : null}
            <dl className="mb-4 grid gap-x-6 gap-y-3 sm:grid-cols-3">
              <MetaField label="Last seen" value={formatDate(currentProject.lastSeenAt)} />
              <MetaField label="Last scanned" value={formatDate(currentProject.lastScannedAt)} />
              <MetaField label="Source" value={currentProject.isManual ? "Manual entry" : "Scanned"} />
            </dl>
            {isEventsLoading ? (
              <LoadingState label="Loading observations" />
            ) : events.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                No scan observations yet.
              </p>
            ) : (
              <ActivityTimeline events={events} />
            )}
          </SectionCard>

          <SectionCard
            title="Related"
            description="Other projects from the same client in the current catalog."
          >
            {relatedProjects.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                Nothing from this client yet.
              </p>
            ) : (
              <div className="flex flex-col gap-px">
                {relatedProjects.map((relatedProject) => (
                  <Link
                    key={relatedProject.id}
                    to={`/projects/${relatedProject.id}`}
                    className="link-card group flex items-center justify-between rounded-[10px] px-3 py-2.5 transition-colors hover:bg-[color:var(--surface-inset)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                        {getProjectName(relatedProject)}
                      </p>
                      <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                        {formatParsedDate(relatedProject.correctedDate ?? relatedProject.parsedDate)} · {formatBytes(relatedProject.sizeBytes)}
                      </p>
                    </div>
                    <Icon name="chevron" size={12} color="var(--ink-4)" />
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <div id="project-metadata-card">
            <SectionCard
              title="Corrections"
              description={
                currentProject.folderType === "personal_folder"
                  ? "Assign structure and correct display values. The folder on disk is never renamed."
                  : "Override parsed fields. The folder on disk is never renamed."
              }
            >
              <form className="grid gap-4" onSubmit={handleMetadataSave}>
                <FormField label="Date">
                  <input
                    value={metadataForm.correctedDate}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, correctedDate: event.target.value }))}
                    className="field-shell w-full bg-transparent px-4 py-2.5 text-[13.5px] outline-none"
                    placeholder={currentProject.parsedDate ? formatParsedDate(currentProject.parsedDate) : "YYYY-MM-DD, e.g. 2024-03-12"}
                    maxLength={10}
                  />
                </FormField>
                <FormField label="Client">
                  <input
                    value={metadataForm.correctedClient}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, correctedClient: event.target.value }))}
                    className="field-shell w-full bg-transparent px-4 py-2.5 text-[13.5px] outline-none"
                    placeholder={currentProject.parsedClient ?? (currentProject.folderType === "personal_folder" ? "e.g. Sony" : "Leave blank to keep empty")}
                  />
                </FormField>
                <FormField label="Project">
                  <input
                    value={metadataForm.correctedProject}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, correctedProject: event.target.value }))}
                    className="field-shell w-full bg-transparent px-4 py-2.5 text-[13.5px] outline-none"
                    placeholder={currentProject.parsedProject ?? (currentProject.folderType === "personal_folder" ? "Leave blank to use folder name" : "Leave blank to keep empty")}
                  />
                </FormField>
                <FormField label="Category">
                  <select
                    value={metadataForm.category}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, category: event.target.value as Category | "" }))}
                    className="field-shell w-full bg-transparent px-4 py-2.5 text-[13.5px] outline-none"
                  >
                    <option value="">Uncategorized</option>
                    {categoryValues.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </FormField>
                {currentProject.folderType === "personal_folder" ? (
                  <FormField label="Folder type">
                    <select
                      value={metadataForm.folderType}
                      onChange={(event) => setMetadataForm((current) => ({ ...current, folderType: event.target.value as FolderType | "" }))}
                      className="field-shell w-full bg-transparent px-4 py-2.5 text-[13.5px] outline-none"
                    >
                      <option value="personal_folder">Personal folder (keep as-is)</option>
                      <option value="personal_project">Personal project</option>
                      <option value="client">Client project</option>
                    </select>
                    <p className="mt-1.5 text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
                      {metadataForm.folderType === "personal_folder" || metadataForm.folderType === ""
                        ? "The folder on disk is never renamed. Changing this is permanent and cannot be reversed through this form."
                        : metadataForm.folderType === "client"
                          ? "Reclassifying to client project — set a client name and project name above so the entry displays correctly."
                          : "Reclassifying to personal project — set a project name above so the entry displays correctly."}
                    </p>
                  </FormField>
                ) : null}
                <div className="flex items-center justify-end gap-2 pt-1">
                  {metadataMutation.isConfirmed ? (
                    <span className="text-[11.5px] tnum" style={{ color: "var(--ink-3)" }}>
                      Saved ✓
                    </span>
                  ) : null}
                  <button
                    type="submit"
                    className="btn btn-sm btn-primary"
                    disabled={metadataMutation.isPending || isMutating}
                  >
                    {metadataMutation.isPending ? "Saving…" : "Save corrections"}
                  </button>
                </div>
              </form>
            </SectionCard>
          </div>

          <SectionCard
            title="Move"
            description="Plan moves virtually. Target drives reserve incoming space until you confirm the physical move."
          >
            <dl className="mb-5 grid gap-x-6 gap-y-3 grid-cols-3">
              <MetaField label="Current" value={currentDriveName} />
              <MetaField
                label="Target"
                value={isMovePending ? targetDriveName : "—"}
                tone={isMovePending ? "accent" : undefined}
              />
              <MetaField label="Impact" value={moveImpactLabel} />
            </dl>

            {isMovePending ? (
              <p className="text-[12.5px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
                To replan this move, cancel it first from the rail above.
              </p>
            ) : (
              <form className="grid gap-4" onSubmit={handlePlanMove}>
                <FormField label="Target drive">
                  <select
                    value={targetDriveId}
                    onChange={(event) => setTargetDriveId(event.target.value)}
                    className="field-shell w-full bg-transparent px-4 py-2.5 text-[13.5px] outline-none"
                  >
                    <option value="">Select a drive</option>
                    {drives
                      .filter((drive) => drive.id !== currentProject.currentDriveId)
                      .map((drive) => (
                        <option key={drive.id} value={drive.id}>
                          {drive.displayName}
                        </option>
                      ))}
                  </select>
                </FormField>
                {moveValidation.errors.length > 0 ? (
                  <FeedbackNotice tone="error" title="Move validation" messages={moveValidation.errors} />
                ) : null}
                {moveValidation.warnings.length > 0 ? (
                  <FeedbackNotice tone="warning" title="Move cautions" messages={moveValidation.warnings} />
                ) : null}
                {currentProject.sizeBytes === null && targetDriveId ? (
                  <p className="text-[12px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
                    This project has an unknown size. The target drive will reserve an unknown incoming impact.
                  </p>
                ) : null}
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="btn btn-sm btn-primary"
                    disabled={!targetDriveId || isMutating}
                  >
                    Set target drive
                  </button>
                </div>
              </form>
            )}
          </SectionCard>

          <div className="card px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
                  Delete project
                </p>
                <p className="mt-1 text-[12px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
                  Permanently removes this project from the catalog. This cannot be undone.
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
        </div>
      </section>
    </div>
  );
}

/**
 * Inline label/value pair used in the identity card, corrections panel, and move panel.
 * Matches the MetaField pattern in DriveDetailPage and DrivesPage so every detail
 * surface reads with the same visual rhythm.
 */
function MetaField({
  label,
  value,
  tone,
  mono
}: {
  label: string;
  value: string;
  tone?: "accent" | "warn";
  mono?: boolean;
}) {
  const valueColor =
    tone === "accent" ? "var(--accent-ink)" : tone === "warn" ? "var(--warn)" : "var(--ink)";

  return (
    <div className="min-w-0">
      <dt
        className="text-[10.5px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--ink-4)" }}
      >
        {label}
      </dt>
      <dd
        className={`tnum truncate text-[13.5px] font-medium ${mono ? "mono" : ""}`}
        style={{ color: valueColor, marginTop: 2 }}
      >
        {value}
      </dd>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-medium" style={{ color: "var(--ink-2)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function ActivityTimeline({ events }: { events: ProjectScanEvent[] }) {
  return (
    <div className="relative pl-4">
      <div
        className="absolute bottom-1 left-[3px] top-[6px] w-px"
        style={{ background: "var(--hairline)" }}
      />
      <div className="space-y-4">
        {events.map((event) => (
          <div key={event.id} className="relative">
            <span
              className="absolute -left-4 top-[5px] h-[7px] w-[7px] rounded-full"
              style={{
                background:
                  event.observedFolderType != null ? "var(--accent)" : "var(--ink-3)",
                boxShadow: "0 0 0 3px var(--surface)"
              }}
            />
            <div className="flex items-center gap-3">
              <p className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                {event.observedFolderName}
              </p>
              <span className="text-[11px] tnum" style={{ color: "var(--ink-4)" }}>
                {formatDate(event.observedAt)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              <span>{event.observedDriveName}</span>
              {event.observedFolderType != null ? (
                <>
                  <span style={{ color: "var(--ink-4)" }}>·</span>
                  <span>{getFolderTypeLabel(event.observedFolderType)}</span>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Archive workflow modal — single component that renders the right surface
// for each `ArchiveStage`. We keep it co-located so the page-specific state
// machine and copy live next to the affordance that triggers them.
// ───────────────────────────────────────────────────────────────────────────

interface ArchiveWorkflowModalProps {
  stage: ArchiveStage;
  error: string | null;
  result: ArchiveResult | null;
  lockAfterArchive: boolean;
  folderPath: string | null | undefined;
  onLockChange(value: boolean): void;
  onClose(): void;
  onRetry(): void;
}

function ArchiveWorkflowModal({
  stage,
  error,
  result,
  lockAfterArchive,
  folderPath,
  onLockChange,
  onClose,
  onRetry
}: ArchiveWorkflowModalProps) {
  const isClosable = stage !== "running" && stage !== "picking";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Archive project"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50
      }}
      onClick={isClosable ? onClose : undefined}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 92vw)",
          maxHeight: "90vh",
          overflow: "auto",
          padding: 24,
          background: "var(--surface)"
        }}
      >
        {stage === "picking" ? (
          <ArchiveStagePicking />
        ) : stage === "running" ? (
          <ArchiveStageRunning folderPath={folderPath ?? undefined} />
        ) : stage === "done" && result ? (
          <ArchiveStageDone result={result} onClose={onClose} />
        ) : stage === "error" ? (
          <ArchiveStageError error={error} onRetry={onRetry} onClose={onClose} />
        ) : (
          <ArchiveStageReady
            folderPath={folderPath ?? undefined}
            lockAfterArchive={lockAfterArchive}
            onLockChange={onLockChange}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

function ArchiveStageReady({
  folderPath,
  lockAfterArchive,
  onLockChange,
  onClose
}: {
  folderPath?: string;
  lockAfterArchive: boolean;
  onLockChange: (value: boolean) => void;
  onClose: () => void;
}) {
  return (
    <>
      <p className="eyebrow mb-1">Archive &amp; Freeze</p>
      <h3 className="h-title mb-2" style={{ fontSize: 20 }}>
        Finalize this project
      </h3>
      <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>
        Generates a SHA-256 manifest of every file, moves the folder to your
        chosen archive drive, and locks it against accidental changes.
      </p>
      {folderPath && (
        <p
          className="mono mt-3"
          style={{
            fontSize: 12,
            color: "var(--ink-3)",
            background: "var(--surface-container-low)",
            padding: "6px 8px",
            borderRadius: 4,
            border: "1px solid var(--hairline)"
          }}
        >
          {folderPath}
        </p>
      )}
      <label
        className="mt-4 flex items-center gap-2"
        style={{ fontSize: 13, color: "var(--ink-2)" }}
      >
        <input
          type="checkbox"
          checked={lockAfterArchive}
          onChange={(e) => onLockChange(e.target.checked)}
        />
        Lock with <span className="mono">chflags uchg</span> after move
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  );
}

function ArchiveStagePicking() {
  return (
    <>
      <p className="eyebrow mb-1">Archive &amp; Freeze</p>
      <h3 className="h-title mb-2" style={{ fontSize: 20 }}>
        Choose archive destination
      </h3>
      <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
        Pick the drive or folder where this project should live as an archive.
      </p>
    </>
  );
}

function ArchiveStageRunning({ folderPath }: { folderPath?: string }) {
  return (
    <>
      <p className="eyebrow mb-1">Archive &amp; Freeze</p>
      <h3 className="h-title mb-2" style={{ fontSize: 20 }}>
        Hashing and moving…
      </h3>
      <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>
        Computing SHA-256 for every file, then moving the folder. Don't unmount
        the source or destination drive until this completes.
      </p>
      {folderPath && (
        <p
          className="mono mt-3"
          style={{ fontSize: 12, color: "var(--ink-4)", wordBreak: "break-all" }}
        >
          {folderPath}
        </p>
      )}
      <div
        className="mt-4"
        style={{
          height: 4,
          width: "100%",
          background: "var(--surface-container)",
          borderRadius: 2,
          overflow: "hidden",
          position: "relative"
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, transparent, var(--action), transparent)",
            animation: "archive-shimmer 1.4s ease-in-out infinite"
          }}
        />
      </div>
      <style>{`
        @keyframes archive-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </>
  );
}

function ArchiveStageDone({
  result,
  onClose
}: {
  result: ArchiveResult;
  onClose: () => void;
}) {
  return (
    <>
      <p className="eyebrow mb-1" style={{ color: "var(--ok)" }}>
        Archive complete
      </p>
      <h3 className="h-title mb-2" style={{ fontSize: 20 }}>
        Folder is safely archived
      </h3>
      <dl
        className="mt-3 space-y-2"
        style={{ fontSize: 13, color: "var(--ink-2)" }}
      >
        <div className="flex justify-between gap-3">
          <dt style={{ color: "var(--ink-3)" }}>Files hashed</dt>
          <dd className="tnum">{result.totalFiles.toLocaleString()}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt style={{ color: "var(--ink-3)" }}>Total size</dt>
          <dd className="tnum">
            {(result.totalBytes / 1024 / 1024).toFixed(2)} MB
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt style={{ color: "var(--ink-3)" }}>Locked</dt>
          <dd>{result.locked ? "Yes (chflags uchg)" : "No"}</dd>
        </div>
      </dl>
      <p
        className="mono mt-4"
        style={{
          fontSize: 11,
          color: "var(--ink-4)",
          wordBreak: "break-all"
        }}
      >
        {result.archivedPath}
      </p>
      <p
        className="mt-2"
        style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}
      >
        Manifest written to <span className="mono">.archive-manifest.json</span> at
        the archive root.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </>
  );
}

function ArchiveStageError({
  error,
  onRetry,
  onClose
}: {
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <p className="eyebrow mb-1" style={{ color: "var(--danger)" }}>
        Archive failed
      </p>
      <h3 className="h-title mb-2" style={{ fontSize: 20 }}>
        Something went wrong
      </h3>
      <p
        style={{
          fontSize: 13,
          color: "var(--ink-2)",
          background: "var(--danger-soft)",
          padding: 10,
          borderRadius: 4,
          lineHeight: 1.5
        }}
      >
        {error ?? "An unexpected error occurred."}
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Retry
        </button>
      </div>
    </>
  );
}
