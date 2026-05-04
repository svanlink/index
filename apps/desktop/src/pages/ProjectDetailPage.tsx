import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
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
import { ConfirmModal, MetaField, SectionCard } from "./pagePrimitives";
import { EmptyState, LoadingState } from "./search";
import { FeedbackNotice, StatusBadge } from "./feedback";
import { showPathInFinder } from "../app/nativeContextMenu";
import { getDriveColor } from "./driveColor";

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
    markProjectOpened,
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

  // Stamp opened_at so this project appears in the palette's Recent section.
  useEffect(() => {
    if (projectId) {
      void markProjectOpened(projectId);
    }
  }, [projectId, markProjectOpened]);

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

  // Category-tinted avatar for the identity card
  const avatarPalette: Record<string, { bg: string; color: string }> = {
    photo: { bg: "var(--info-soft)", color: "var(--info)" },
    video: { bg: "var(--accent-soft)", color: "var(--accent-ink)" },
    design: { bg: "var(--ok-soft)", color: "var(--ok)" },
    mixed: { bg: "var(--warn-soft)", color: "var(--warn)" },
    personal: { bg: "var(--danger-soft)", color: "var(--danger)" }
  };
  const avatar = avatarPalette[currentProject.category ?? ""] ?? {
    bg: "var(--surface-inset)",
    color: "var(--ink-3)"
  };
  const avatarLetter = getProjectName(currentProject)[0]?.toUpperCase() ?? "?";

  // Status accent on the identity card
  const statusAccent =
    currentProject.missingStatus === "missing"
      ? "inset 3px 0 0 var(--danger)"
      : currentProject.duplicateStatus === "duplicate"
        ? "inset 3px 0 0 var(--warn)"
        : undefined;

  // Unsaved changes — compare form state to the persisted project values
  const isFormDirty =
    metadataForm.correctedDate !== (currentProject.correctedDate ?? "") ||
    metadataForm.correctedClient !== (currentProject.correctedClient ?? "") ||
    metadataForm.correctedProject !== (currentProject.correctedProject ?? "") ||
    metadataForm.category !== (currentProject.category ?? "") ||
    metadataForm.folderType !== currentProject.folderType;

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      {showDeleteConfirm ? (
        <ConfirmModal
          title="Delete project?"
          description={`"${getProjectName(currentProject)}" will be permanently removed from the catalog.`}
          consequence="This cannot be undone."
          confirmLabel="Delete project"
          onConfirm={() => void handleDeleteProject()}
          onCancel={() => setShowDeleteConfirm(false)}
          isLoading={isMutating}
        />
      ) : null}

      <div className="card" style={{ overflow: "hidden", ...(statusAccent ? { boxShadow: statusAccent } : {}) }}>
        {/* C4: Action toolbar */}
        <div
          className="flex flex-wrap items-center"
          style={{ gap: 8, borderBottom: "1px solid var(--hairline)", padding: "10px 16px" }}
        >
          <Link to="/projects" className="btn btn-ghost btn-sm">
            <Icon name="chevron" size={11} className="rotate-180" />
            Projects
          </Link>
          <div className="flex-1" />
          {currentProject.currentDriveId ? (
            <Link to={`/drives/${currentProject.currentDriveId}`} className="btn btn-sm">
              <Icon name="hardDrive" size={11} color="currentColor" />
              Drive
            </Link>
          ) : null}
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

        {/* C1: Identity body */}
        <div style={{ padding: "24px" }}>
          <div className="flex flex-wrap items-start" style={{ gap: 20 }}>
            {/* C1: Category-tinted avatar letter */}
            <div
              className="flex shrink-0 items-center justify-center"
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                fontSize: 20,
                fontWeight: 600,
                background: avatar.bg,
                color: avatar.color
              }}
            >
              {avatarLetter}
            </div>
            <div className="min-w-0 flex-1">
              <div className="eyebrow mono">
                {displayDate} · {displayClient}
              </div>
              <h1 className="h-title" style={{ margin: "6px 0 0" }}>
                {getProjectName(currentProject)}
              </h1>
              <p className="mono" style={{ color: "var(--ink-3)", marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
                {currentProject.folderPath ?? currentProject.folderName ?? "Path unavailable"}
              </p>
              {statusBadges.length > 0 ? (
                <div className="flex flex-wrap" style={{ gap: 6, marginTop: 16 }}>
                  {statusBadges.map((badge) => (
                    <StatusBadge key={badge} label={badge} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <dl className="meta-grid-4" style={{ marginTop: 20 }}>
            {/* Drive with color dot */}
            <div className="min-w-0">
              <dt className="text-eyebrow" style={{ color: "var(--ink-4)" }}>
                Current drive
              </dt>
              <dd className="flex items-center tnum truncate" style={{ margin: 0, marginTop: 2, gap: 6, fontSize: 13, fontWeight: 500 }}>
                {currentProject.currentDriveId ? (
                  <>
                    <span
                      className="drive-dot shrink-0"
                      style={{ "--drive-color": getDriveColor(currentProject.currentDriveId), width: 8, height: 8 } as CSSProperties}
                    />
                    <span className="truncate" style={{ color: "var(--ink)" }}>{currentDriveName}</span>
                  </>
                ) : (
                  <span style={{ color: "var(--warn)" }}>{currentDriveName}</span>
                )}
              </dd>
            </div>
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

      <section className="detail-layout">
        <div className="flex flex-col" style={{ gap: 24 }}>
          <SectionCard
            title="Parsed fields"
            description="Values inferred from the folder name on disk. These are immutable — corrections live in the next section."
          >
            <dl className="fields-grid-2">
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
              <div style={{ marginBottom: 16 }}>
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
            <dl className="fields-grid-3" style={{ marginBottom: 16 }}>
              <MetaField label="Last seen" value={formatDate(currentProject.lastSeenAt)} />
              <MetaField
                label="Last scanned"
                value={currentProject.lastScannedAt ? formatDate(currentProject.lastScannedAt) : "Not yet scanned"}
              />
              <MetaField label="Source" value={currentProject.isManual ? "Manual entry" : "Scanned"} />
            </dl>
            {isEventsLoading ? (
              <LoadingState label="Loading observations" />
            ) : events.length === 0 ? (
              <p style={{ color: "var(--ink-3)", fontSize: 13, margin: 0 }}>
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
              <p style={{ color: "var(--ink-3)", fontSize: 13, margin: 0 }}>
                Nothing from this client yet.
              </p>
            ) : (
              <div className="flex flex-col" style={{ gap: 1 }}>
                {relatedProjects.map((relatedProject) => (
                  <Link
                    key={relatedProject.id}
                    to={`/projects/${relatedProject.id}`}
                    className="link-card flex items-center justify-between"
                    style={{ borderRadius: 10, padding: "10px 12px" }}
                  >
                    <div className="min-w-0">
                      <p className="truncate" style={{ color: "var(--ink)", fontSize: 13, fontWeight: 500, margin: 0 }}>
                        {getProjectName(relatedProject)}
                      </p>
                      <p style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 2, margin: 0 }}>
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

        <div className="flex flex-col" style={{ gap: 24 }}>
          <div id="project-metadata-card">
            <SectionCard
              title="Corrections"
              description={
                currentProject.folderType === "personal_folder"
                  ? "Assign structure and correct display values. The folder on disk is never renamed."
                  : "Override parsed fields. The folder on disk is never renamed."
              }
            >
              <form className="form-grid" onSubmit={handleMetadataSave}>
                <FormField label="Date">
                  <input
                    value={metadataForm.correctedDate}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, correctedDate: event.target.value }))}
                    className="field-shell w-full"
                    style={{ fontSize: 13, padding: "10px 16px" }}
                    placeholder={currentProject.parsedDate ? formatParsedDate(currentProject.parsedDate) : "YYYY-MM-DD, e.g. 2024-03-12"}
                    maxLength={10}
                  />
                </FormField>
                <FormField label="Client">
                  <input
                    value={metadataForm.correctedClient}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, correctedClient: event.target.value }))}
                    className="field-shell w-full"
                    style={{ fontSize: 13, padding: "10px 16px" }}
                    placeholder={currentProject.parsedClient ?? (currentProject.folderType === "personal_folder" ? "e.g. Sony" : "Leave blank to keep empty")}
                  />
                </FormField>
                <FormField label="Project">
                  <input
                    value={metadataForm.correctedProject}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, correctedProject: event.target.value }))}
                    className="field-shell w-full"
                    style={{ fontSize: 13, padding: "10px 16px" }}
                    placeholder={currentProject.parsedProject ?? (currentProject.folderType === "personal_folder" ? "Leave blank to use folder name" : "Leave blank to keep empty")}
                  />
                </FormField>
                <FormField label="Category">
                  <select
                    value={metadataForm.category}
                    onChange={(event) => setMetadataForm((current) => ({ ...current, category: event.target.value as Category | "" }))}
                    className="field-shell w-full"
                    style={{ fontSize: 13, padding: "10px 16px" }}
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
                      className="field-shell w-full"
                      style={{ fontSize: 13, padding: "10px 16px" }}
                    >
                      <option value="personal_folder">Personal folder (keep as-is)</option>
                      <option value="personal_project">Personal project</option>
                      <option value="client">Client project</option>
                    </select>
                    <p style={{ color: "var(--ink-3)", fontSize: 12, lineHeight: 1.5, marginTop: 6 }}>
                      {metadataForm.folderType === "personal_folder" || metadataForm.folderType === ""
                        ? "The folder on disk is never renamed. Changing this is permanent and cannot be reversed through this form."
                        : metadataForm.folderType === "client"
                          ? "Reclassifying to client project — set a client name and project name above so the entry displays correctly."
                          : "Reclassifying to personal project — set a project name above so the entry displays correctly."}
                    </p>
                  </FormField>
                ) : null}
                {/* C2: Unsaved indicator */}
                <div className="flex items-center justify-end" style={{ gap: 8, paddingTop: 4 }}>
                  {isFormDirty && !metadataMutation.isPending ? (
                    <span className="chip chip-warn">Unsaved changes</span>
                  ) : metadataMutation.isConfirmed && !isFormDirty ? (
                    <span className="tnum" style={{ fontSize: 12, color: "var(--ink-3)" }}>
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

          <div className="card" style={{ padding: "16px 20px" }}>
            <div className="flex items-start justify-between" style={{ gap: 16 }}>
              <div className="min-w-0">
                <p style={{ color: "var(--ink)", fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>
                  Delete project
                </p>
                <p style={{ color: "var(--ink-3)", fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>
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

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col" style={{ gap: 6 }}>
      <span style={{ color: "var(--ink-2)", fontSize: 12, fontWeight: 500 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function ActivityTimeline({ events }: { events: ProjectScanEvent[] }) {
  return (
    <div className="relative" style={{ paddingLeft: 16 }}>
      {/* Decorative vertical rule — hidden from AT */}
      <div
        aria-hidden="true"
        className="absolute"
        style={{ background: "var(--hairline)", left: 3, top: 6, bottom: 4, width: 1 }}
      />
      <ol
        className="list-none"
        style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 16 }}
        aria-label={`Scan activity, ${events.length} event${events.length === 1 ? "" : "s"}`}
      >
        {events.map((event) => (
          <li key={event.id} className="relative">
            {/* Decorative timeline dot — hidden from AT */}
            <span
              aria-hidden="true"
              className="absolute"
              style={{
                left: -16,
                top: 5,
                width: 7,
                height: 7,
                borderRadius: "50%",
                background:
                  event.observedFolderType != null ? "var(--accent)" : "var(--ink-3)",
                boxShadow: "0 0 0 3px var(--surface)"
              }}
            />
            <div className="flex items-center" style={{ gap: 12 }}>
              <p style={{ color: "var(--ink)", fontSize: 13, fontWeight: 500, margin: 0 }}>
                {event.observedFolderName}
              </p>
              <time
                dateTime={event.observedAt}
                className="tnum"
                style={{ color: "var(--ink-4)", fontSize: 12 }}
              >
                {formatDate(event.observedAt)}
              </time>
            </div>
            <div className="flex flex-wrap" style={{ gap: 8, marginTop: 4, fontSize: 12, color: "var(--ink-3)" }}>
              <span>{event.observedDriveName}</span>
              {event.observedFolderType != null ? (
                <>
                  {/* Decorative separator — hidden from AT */}
                  <span aria-hidden="true" style={{ color: "var(--ink-4)" }}>·</span>
                  <span>{getFolderTypeLabel(event.observedFolderType)}</span>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
