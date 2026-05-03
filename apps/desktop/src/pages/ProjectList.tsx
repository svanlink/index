/**
 * Shared project table — identical row structure used on both
 * ProjectsPage (unfiltered or filtered by search/tabs) and
 * DriveDetailPage (pre-filtered to a single drive).
 *
 * Consumers pass a pre-filtered `projects` list; this component
 * only handles rendering, not filtering.
 */

import { type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@drive-project-catalog/ui";
import type { Drive, Project } from "@drive-project-catalog/domain";
import { getDisplayClient, getDisplayProject } from "@drive-project-catalog/domain";
import {
  formatBytes,
  formatParsedDate,
  getDriveName,
  getProjectStatusBadges
} from "./dashboardHelpers";
import { StatusBadge } from "./pagePrimitives";
import { getDriveColor } from "./driveColor";

// ---------------------------------------------------------------------------
// ProjectRow — shared by ProjectsPage and ProjectList
// ---------------------------------------------------------------------------

export function ProjectRow({
  project,
  drives
}: {
  project: Project;
  drives: Drive[];
}) {
  const displayName = getDisplayProject(project);
  const displayClient = getDisplayClient(project);
  const displayDate = formatParsedDate(project.correctedDate ?? project.parsedDate);
  const isPersonalFolder = project.folderType === "personal_folder";
  const statusBadges = getProjectStatusBadges(project).filter((b: string) => b !== "Normal");
  const currentDrive = project.currentDriveId ? drives.find((d) => d.id === project.currentDriveId) : null;
  const driveName = getDriveName(currentDrive);
  const driveColor = getDriveColor(project.currentDriveId);
  const targetDrive = project.targetDriveId
    ? drives.find((d) => d.id === project.targetDriveId)
    : null;
  const targetDriveName = targetDrive?.displayName ?? null;
  const targetDriveColor = targetDrive ? getDriveColor(targetDrive.id) : null;

  const isMissing = project.missingStatus === "missing";
  const isDuplicate = project.duplicateStatus === "duplicate";
  const statusAccent = isMissing
    ? "inset 3px 0 0 var(--danger)"
    : isDuplicate
      ? "inset 3px 0 0 var(--warn)"
      : undefined;

  const primaryLine = isPersonalFolder ? project.folderName : displayClient !== "—" ? displayClient : displayName;
  const secondaryLine = isPersonalFolder
    ? project.folderPath || ""
    : displayClient !== "—"
      ? displayName
      : project.folderName !== displayName
        ? project.folderName
        : "";

  const avatarPalette: Record<string, { bg: string; color: string }> = {
    photo: { bg: "var(--info-soft)", color: "var(--info)" },
    video: { bg: "var(--accent-soft)", color: "var(--accent-ink)" },
    design: { bg: "var(--ok-soft)", color: "var(--ok)" },
    mixed: { bg: "var(--warn-soft)", color: "var(--warn)" },
    personal: { bg: "var(--danger-soft)", color: "var(--danger)" }
  };
  const avatar =
    avatarPalette[project.category ?? ""] ?? {
      bg: "var(--surface-inset)",
      color: "var(--ink-3)"
    };
  const avatarLetter = (primaryLine || "?")[0]?.toUpperCase() ?? "?";

  return (
    <div
      role="listitem"
      className="proj-row grid items-center"
      style={{
        gap: 12,
        gridTemplateColumns: "minmax(0,1fr) minmax(170px,220px) 88px minmax(140px,180px) 16px",
        borderBottom: "1px solid var(--hairline)",
        padding: "12px 16px",
        boxShadow: statusAccent
      }}
    >
      {/* Project — avatar + title + subtitle */}
      <Link
        to={`/projects/${project.id}`}
        className="flex min-w-0 items-center"
        style={{ gap: 12 }}
        aria-label={`Open ${project.folderName}`}
      >
        <div
          className="flex shrink-0 items-center justify-center font-semibold"
          style={{ height: 32, width: 32, borderRadius: 10, fontSize: 12, background: avatar.bg, color: avatar.color }}
        >
          {avatarLetter}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="truncate font-medium leading-snug"
            style={{ fontSize: 13, color: "var(--ink)" }}
          >
            {primaryLine}
            {!isPersonalFolder && displayClient !== "—" && displayName ? (
              <span style={{ marginLeft: 4, color: "var(--ink-3)", fontWeight: 400 }}>
                · {displayName}
              </span>
            ) : null}
          </div>
          {secondaryLine || displayDate !== "—" ? (
            <div className="flex" style={{ marginTop: 2, gap: 8, fontSize: 12, color: "var(--ink-3)" }}>
              {displayDate !== "—" ? (
                <span className="tnum shrink-0">{displayDate}</span>
              ) : null}
              {displayDate !== "—" && secondaryLine ? (
                <span style={{ color: "var(--ink-4)" }}>·</span>
              ) : null}
              {secondaryLine ? (
                <span className="truncate">{secondaryLine}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </Link>

      {/* Drive — drive-dot + name, with optional "→ target" for pending moves */}
      <div className="min-w-0" style={{ fontSize: 12 }}>
        {project.currentDriveId ? (
          <div className="flex items-center" style={{ gap: 8 }}>
            <span
              className="drive-dot"
              style={{ "--drive-color": driveColor, width: 8, height: 8 } as CSSProperties}
            />
            <span className="truncate" style={{ color: "var(--ink-2)" }}>
              {driveName}
            </span>
            {targetDriveName && project.moveStatus === "pending" ? (
              <>
                <Icon name="arrowRight" size={10} color="var(--ink-4)" />
                <span
                  className="drive-dot"
                  style={{ "--drive-color": targetDriveColor ?? "var(--ink-3)", width: 7, height: 7 } as CSSProperties}
                />
                <span className="truncate" style={{ color: "var(--ink-3)" }}>
                  {targetDriveName}
                </span>
              </>
            ) : null}
          </div>
        ) : (
          <span style={{ color: "var(--warn)" }}>Unassigned</span>
        )}
      </div>

      {/* Size */}
      <div className="tnum" style={{ textAlign: "right", fontSize: 12, color: "var(--ink-2)" }}>
        {project.sizeBytes != null ? formatBytes(project.sizeBytes) : "—"}
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap justify-end overflow-hidden" style={{ gap: 4 }}>
        {statusBadges.map((b: string) => (
          <StatusBadge key={b} label={b} />
        ))}
      </div>

      {/* Chevron */}
      <Link
        to={`/projects/${project.id}`}
        className="link-card row-chevron flex items-center justify-center"
        style={{ opacity: 0, transition: "opacity 150ms var(--ease)", color: "var(--ink-4)" }}
        aria-label={`Open ${project.folderName}`}
        tabIndex={-1}
      >
        <Icon name="chevron" size={12} />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
export const PROJECT_COL_TEMPLATE = "minmax(0,1fr) minmax(170px,220px) 88px minmax(140px,180px) 16px";

export function ProjectTableHeader() {
  return (
    <div
      className="table-head-glass grid items-center"
      style={{ gap: 12, gridTemplateColumns: PROJECT_COL_TEMPLATE, padding: "8px 16px" }}
      aria-hidden="true"
    >
      {(["Project", "Drive", "Size", "Status", ""] as const).map((col) => (
        <span
          key={col}
          style={{ fontSize: 10.5, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", textAlign: col === "Size" ? "right" : "left" }}
        >
          {col}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProjectList — minimal table wrapper; no filter chrome
// ---------------------------------------------------------------------------

export function ProjectList({
  projects,
  drives,
  isLoading = false,
  emptyMessage = "No projects."
}: {
  projects: Project[];
  drives: Drive[];
  isLoading?: boolean;
  emptyMessage?: string;
}) {
  if (isLoading) {
    return (
      <div className="card text-center" style={{ overflow: "hidden", padding: "48px 0" }}>
        <p style={{ fontSize: 13, color: "var(--ink-3)" }}>Loading…</p>
      </div>
    );
  }
  if (projects.length === 0) {
    return (
      <div className="card" style={{ overflow: "hidden" }}>
        <div className="flex flex-col items-center text-center" style={{ gap: 8, padding: "48px 16px" }}>
          <span
            className="inline-flex items-center justify-center"
            style={{ marginBottom: 4, height: 44, width: 44, borderRadius: 10, background: "var(--surface-inset)" }}
            aria-hidden="true"
          >
            <Icon name="folder" size={20} color="var(--ink-3)" />
          </span>
          <p className="font-semibold" style={{ fontSize: 13, color: "var(--ink)" }}>
            {emptyMessage}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <ProjectTableHeader />
      <div role="list">
        {projects.map((project) => (
          <ProjectRow key={project.id} project={project} drives={drives} />
        ))}
      </div>
    </div>
  );
}
