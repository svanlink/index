import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { categoryValues, type Category, type FolderType, type ProjectScanEvent } from "@drive-project-catalog/domain";
import { Icon } from "@drive-project-catalog/ui";

import { useCatalogStore } from "../app/providers";
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
import { showPathInFinder } from "../app/nativeContextMenu";

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
  }, [selectedProject]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  const project = selectedProject;

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

  const currentDriveName = getDriveName(drives.find((d) => d.id === currentProject.currentDriveId));
  const targetDriveName = getDriveName(drives.find((d) => d.id === currentProject.targetDriveId));
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
              value={isMovePending ? targetDriveName : (currentProject.sizeBytes !== null ? formatBytes(currentProject.sizeBytes) : "Unknown")}
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
                        {formatParsedDate(relatedProject.correctedDate ?? relatedProject.parsedDate)} · {relatedProject.sizeBytes !== null ? formatBytes(relatedProject.sizeBytes) : "Unknown"}
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

