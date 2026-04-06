import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { categoryValues, type Category, type ProjectScanEvent } from "@drive-project-catalog/domain";
import { PageHeader } from "@drive-project-catalog/ui";
import { validateSingleProjectMove } from "../app/catalogValidation";
import { useCatalogStore } from "../app/providers";
import {
  formatBytes,
  formatDate,
  formatParsedDate,
  getDriveName,
  getProjectName,
  getProjectStatusBadges
} from "./dashboardHelpers";
import { EmptyState, FeedbackNotice, LoadingState, SectionCard, StatusBadge } from "./pagePrimitives";

interface ProjectMetadataFormState {
  correctedClient: string;
  correctedProject: string;
  category: Category | "";
}

export function ProjectDetailPage() {
  const {
    drives,
    projects,
    selectedProject,
    selectProject,
    listProjectScanEvents,
    updateProjectMetadata,
    planProjectMove,
    confirmProjectMove,
    cancelProjectMove,
    isLoading,
    isMutating
  } = useCatalogStore();
  const { projectId = "" } = useParams();
  const [events, setEvents] = useState<ProjectScanEvent[]>([]);
  const [isEventsLoading, setIsEventsLoading] = useState(true);
  const [metadataForm, setMetadataForm] = useState<ProjectMetadataFormState>({
    correctedClient: "",
    correctedProject: "",
    category: ""
  });
  const [targetDriveId, setTargetDriveId] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "warning" | "error" | "info"; title: string; messages: string[] } | null>(null);

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
      correctedClient: selectedProject.correctedClient ?? "",
      correctedProject: selectedProject.correctedProject ?? "",
      category: selectedProject.category ?? ""
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

  async function handleMetadataSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await updateProjectMetadata({
      projectId: currentProject.id,
      correctedClient: metadataForm.correctedClient,
      correctedProject: metadataForm.correctedProject,
      category: metadataForm.category || null
    });
    setFeedback({
      tone: "success",
      title: "Metadata saved",
      messages: ["Corrected fields were updated for this project."]
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
  }

  const moveImpactLabel =
    currentProject.sizeBytes === null
      ? "Unknown size impact"
      : formatBytes(currentProject.sizeBytes);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project detail"
        title={getProjectName(project)}
        description="Edit corrected metadata, assign or confirm virtual moves, and review the scan observations already captured in local state."
        actions={
          <Link
            to="/projects"
            className="button-secondary"
          >
            Back to projects
          </Link>
        }
      />

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
            <DetailField label="Parsed date" value={formatParsedDate(project.parsedDate)} />
            <DetailField label="Category" value={project.category ?? "Uncategorized"} />
            <DetailField label="Parsed client" value={project.parsedClient} />
            <DetailField label="Parsed project" value={project.parsedProject} />
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
          <SectionCard title="Edit metadata" description="Correct display values without changing the parsed source fields.">
            <form className="grid gap-4" onSubmit={handleMetadataSave}>
              <FormField label="Corrected client">
                <input
                  value={metadataForm.correctedClient}
                  onChange={(event) => setMetadataForm((current) => ({ ...current, correctedClient: event.target.value }))}
                  className="field-shell w-full bg-transparent px-4 py-3 outline-none"
                  placeholder="Leave blank to use parsed client"
                />
              </FormField>
              <FormField label="Corrected project">
                <input
                  value={metadataForm.correctedProject}
                  onChange={(event) => setMetadataForm((current) => ({ ...current, correctedProject: event.target.value }))}
                  className="field-shell w-full bg-transparent px-4 py-3 outline-none"
                  placeholder="Leave blank to use parsed project"
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
              <div className="flex justify-end">
                <button type="submit" className="button-secondary" disabled={isMutating}>
                  {isMutating ? "Saving..." : "Save corrections"}
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
                  disabled={project.moveStatus !== "pending" || isMutating}
                  onClick={() => void confirmProjectMove(project.id)
                    .then(() => {
                      setFeedback({
                        tone: "success",
                        title: "Move confirmed",
                        messages: [
                          `Current drive updated to ${getDriveName(drives, project.targetDriveId)}.`,
                          "Pending move state and reserved incoming impact were cleared."
                        ]
                      });
                    })
                    .catch((error) => {
                      setFeedback({
                        tone: "error",
                        title: "Move confirmation failed",
                        messages: [error instanceof Error ? error.message : "The move could not be confirmed."]
                      });
                    })}
                >
                  Confirm moved
                </button>
                <button
                  type="button"
                  className="button-danger"
                  disabled={project.moveStatus !== "pending" || isMutating}
                  onClick={() => void cancelProjectMove(project.id)
                    .then(() => {
                      setFeedback({
                        tone: "info",
                        title: "Move cancelled",
                        messages: ["Pending move state and target drive were cleared."]
                      });
                    })
                    .catch((error) => {
                      setFeedback({
                        tone: "error",
                        title: "Move cancellation failed",
                        messages: [error instanceof Error ? error.message : "The move could not be cancelled."]
                      });
                    })}
                >
                  Cancel move
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Scan observations" description="Observed folders and timestamps already stored in the local catalog model.">
            {isEventsLoading ? (
              <LoadingState label="Loading observations" />
            ) : events.length === 0 ? (
              <EmptyState title="No observations yet" description="This project has no recorded scan events in the local catalog." />
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.id} className="rounded-[18px] border px-4 py-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
                    <p className="font-medium" style={{ color: "var(--color-text)" }}>{event.observedFolderName}</p>
                    <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>{event.observedDriveName}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--color-text-soft)" }}>
                      Observed {formatDate(event.observedAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </section>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border px-4 py-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>{label}</p>
      <p className="mt-2 text-sm font-medium leading-6" style={{ color: "var(--color-text)" }}>{value}</p>
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
