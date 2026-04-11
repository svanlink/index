import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { categoryValues, type Category, type FolderType, type ProjectScanEvent } from "@drive-project-catalog/domain";


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

interface ProjectMetadataFormState {
  correctedDate: string;
  correctedClient: string;
  correctedProject: string;
  category: Category | "";
  folderType: FolderType | "";
}

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
      ? "Unknown size impact"
      : formatBytes(currentProject.sizeBytes);

  async function handleDeleteProject() {
    try {
      await deleteProject(currentProject.id);
      navigate("/projects");
    } catch (error) {
      setShowDeleteConfirm(false);
      setFeedback({ tone: "error", title: "Delete failed", messages: [error instanceof Error ? error.message : "The project could not be deleted."] });
    }
  }

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

      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text)" }}>{getProjectName(project)}</h2>
        <Link to="/projects" className="button-secondary">Back</Link>
      </div>

      {feedback ? (
        <FeedbackNotice tone={feedback.tone} title={feedback.title} messages={feedback.messages} />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {getProjectStatusBadges(project).map((badge) => (
          <StatusBadge key={badge} label={badge} />
        ))}
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard title="Project fields" description="Parsed, corrected, and operational fields shown from the current local record.">
          <div className="grid gap-4 md:grid-cols-2">
            <DetailField label="Folder name" value={project.folderName} />
            <DetailField label="Type" value={getFolderTypeLabel(project.folderType)} />
            <DetailField label="Parsed date" value={formatParsedDate(project.parsedDate)} />
            <DetailField label="Category" value={project.category ?? "Uncategorized"} />
            <DetailField label="Parsed client" value={project.parsedClient ?? "—"} />
            <DetailField label="Parsed project" value={project.parsedProject ?? "—"} />
            <DetailField label="Corrected date" value={project.correctedDate ? formatParsedDate(project.correctedDate) : "Not set"} />
            <DetailField label="Corrected client" value={project.correctedClient ?? "Not set"} />
            <DetailField label="Corrected project" value={project.correctedProject ?? "Not set"} />
            <DetailField label="Size" value={formatBytes(project.sizeBytes)} />
            <DetailField label="Current drive" value={getDriveName(drives, project.currentDriveId)} />
            <DetailField label="Target drive" value={getDriveName(drives, project.targetDriveId)} />
            <DetailField label="Last seen" value={formatDate(project.lastSeenAt)} />
            <DetailField label="Last scanned" value={formatDate(project.lastScannedAt)} />
            <DetailField label="Source" value={project.isManual ? "Manual project" : "Scanned project"} />
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard
            title="Edit metadata"
            description={project.folderType === "personal_folder"
              ? "Assign structure and correct display values. Folder on disk is never renamed."
              : "Correct display values. Parsed source fields and folder name on disk are never changed."}
          >
            <form className="grid gap-4" onSubmit={handleMetadataSave}>
              <FormField label="Date override (YYMMDD)">
                <input
                  value={metadataForm.correctedDate}
                  onChange={(event) => setMetadataForm((current) => ({ ...current, correctedDate: event.target.value }))}
                  className="field-shell w-full bg-transparent px-4 py-3 outline-none"
                  placeholder={project.parsedDate ?? "e.g. 240401"}
                  maxLength={6}
                />
              </FormField>
              <FormField label="Client override">
                <input
                  value={metadataForm.correctedClient}
                  onChange={(event) => setMetadataForm((current) => ({ ...current, correctedClient: event.target.value }))}
                  className="field-shell w-full bg-transparent px-4 py-3 outline-none"
                  placeholder={project.parsedClient ?? (project.folderType === "personal_folder" ? "e.g. Sony" : "Leave blank to leave empty")}
                />
              </FormField>
              <FormField label="Project override">
                <input
                  value={metadataForm.correctedProject}
                  onChange={(event) => setMetadataForm((current) => ({ ...current, correctedProject: event.target.value }))}
                  className="field-shell w-full bg-transparent px-4 py-3 outline-none"
                  placeholder={project.parsedProject ?? (project.folderType === "personal_folder" ? "Leave blank to use folder name" : "Leave blank to leave empty")}
                />
              </FormField>
              <FormField label="Category">
                <select
                  value={metadataForm.category}
                  onChange={(event) => setMetadataForm((current) => ({ ...current, category: event.target.value as Category | "" }))}
                  className="field-shell w-full bg-transparent px-4 py-3 outline-none"
                >
                  <option value="">Uncategorized</option>
                  {categoryValues.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </FormField>
              {project.folderType === "personal_folder" ? (
                <FormField label="Folder type">
                  <select
                    value={metadataForm.folderType}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, folderType: event.target.value as FolderType | "" }))}
                    className="field-shell w-full bg-transparent px-4 py-3 outline-none"
                  >
                    <option value="personal_folder">Personal folder (keep as-is)</option>
                    <option value="personal_project">Personal project</option>
                    <option value="client">Client project</option>
                  </select>
                  <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {metadataForm.folderType === "personal_folder" || metadataForm.folderType === ""
                      ? "The folder on disk is never renamed. Changing this is permanent and cannot be reversed through this form."
                      : metadataForm.folderType === "client"
                        ? "Reclassifying to client project — set a client name and project name above so the entry displays correctly. The folder on disk is not renamed."
                        : "Reclassifying to personal project — set a project name above so the entry displays correctly. The folder on disk is not renamed."}
                  </p>
                </FormField>
              ) : null}
              <div className="flex justify-end">
                <button type="submit" className="button-secondary" disabled={metadataMutation.isPending || isMutating}>
                  {metadataMutation.isConfirmed ? "Saved ✓" : metadataMutation.isPending ? "Saving…" : "Save corrections"}
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Move overview" description="Plan moves virtually, reserve incoming space, then confirm after the physical folder move happens outside the app.">
            <div className="grid gap-4 md:grid-cols-3">
              <DetailField label="Current" value={getDriveName(drives, project.currentDriveId)} />
              <DetailField label="Target" value={getDriveName(drives, project.targetDriveId)} />
              <DetailField label="Impact" value={moveImpactLabel} />
            </div>

            <form className="mt-5 grid gap-4" onSubmit={handlePlanMove}>
              <FormField label="Target drive">
                <select
                  value={targetDriveId}
                  onChange={(event) => setTargetDriveId(event.target.value)}
                  className="field-shell w-full bg-transparent px-4 py-3 outline-none"
                >
                  <option value="">Select a drive</option>
                  {drives
                    .filter((drive) => drive.id !== project.currentDriveId)
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
              {project.sizeBytes === null ? (
                <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                  This project has an unknown size. The target drive will still reserve an unknown incoming impact state.
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-3">
                <button type="submit" className="button-secondary" disabled={!targetDriveId || isMutating}>
                  Set target drive
                </button>
                <button
                  type="button"
                  className="button-success"
                  disabled={project.moveStatus !== "pending" || isMutating || confirmMoveAction.isPending}
                  onClick={confirmMoveAction.run}
                >
                  Confirm moved
                </button>
                <button
                  type="button"
                  className="button-danger"
                  disabled={project.moveStatus !== "pending" || isMutating || cancelMoveAction.isPending}
                  onClick={cancelMoveAction.run}
                >
                  Cancel move
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Scan observations" description="Observed folder classifications and timestamps stored in the local catalog.">
            {!isEventsLoading && events.length > 0 && events[0]?.observedFolderType != null && events[0].observedFolderType !== project.folderType ? (
              <FeedbackNotice
                tone="info"
                title="Classification drift detected"
                messages={[
                  `Most recent scan classified this folder as "${getFolderTypeLabel(events[0].observedFolderType)}", but the stored type is "${getFolderTypeLabel(project.folderType)}".`,
                  "The stored type is preserved. Use the Edit metadata form to reclassify if needed."
                ]}
              />
            ) : null}
            {isEventsLoading ? (
              <LoadingState label="Loading observations" />
            ) : events.length === 0 ? (
              <EmptyState title="No observations yet" description="This project has no recorded scan events in the local catalog." />
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.id} className="border-b py-2.5 last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                    <p className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>{event.observedFolderName}</p>
                    <div className="flex gap-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                      <span>{event.observedDriveName}</span>
                      {event.observedFolderType != null ? <span>{getFolderTypeLabel(event.observedFolderType)}</span> : null}
                      <span>{formatDate(event.observedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </section>

      {/* Danger zone — separated from primary actions */}
      <div className="rounded-lg border px-4 py-4" style={{ borderColor: "var(--color-border)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-text-soft)" }}>Danger zone</p>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>Delete project</p>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              Permanently removes this project from the catalog. This cannot be undone.
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

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium" style={{ color: "var(--color-text-soft)" }}>{label}</p>
      <p className="mt-0.5 text-[13px] font-medium" style={{ color: "var(--color-text)" }}>{value}</p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-text-soft)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
