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
      className="proj-row group grid items-center gap-3 border-b px-4 py-3"
      style={{
        gridTemplateColumns: "minmax(0,1fr) minmax(170px,220px) 88px minmax(140px,180px) 16px",
        borderColor: "var(--hairline)",
        boxShadow: statusAccent
      }}
    >
      {/* Project — avatar + title + subtitle */}
      <Link
        to={`/projects/${project.id}`}
        className="flex min-w-0 items-center gap-3"
        aria-label={`Open ${project.folderName}`}
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[11.5px] font-semibold"
          style={{ background: avatar.bg, color: avatar.color }}
        >
          {avatarLetter}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[13px] font-medium leading-snug"
            style={{ color: "var(--ink)" }}
          >
            {primaryLine}
            {!isPersonalFolder && displayClient !== "—" && displayName ? (
              <span className="ml-1" style={{ color: "var(--ink-3)", fontWeight: 400 }}>
                · {displayName}
              </span>
            ) : null}
          </div>
          {secondaryLine || displayDate !== "—" ? (
            <div className="mt-0.5 flex gap-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
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
      <div className="min-w-0 text-[12.5px]">
        {project.currentDriveId ? (
          <div className="flex items-center gap-2">
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
      <div className="tnum text-right text-[12.5px]" style={{ color: "var(--ink-2)" }}>
        {project.sizeBytes != null ? formatBytes(project.sizeBytes) : "—"}
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap justify-end gap-1 overflow-hidden">
        {statusBadges.map((b: string) => (
          <StatusBadge key={b} label={b} />
        ))}
      </div>

      {/* Chevron */}
      <Link
        to={`/projects/${project.id}`}
        className="link-card flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        style={{ color: "var(--ink-4)" }}
        aria-label={`Open ${project.folderName}`}
        tabIndex={-1}
      >
        <Icon name="chevron" size={12} />
      </Link>
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
      <div className="card overflow-hidden py-12 text-center">
        <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>Loading…</p>
      </div>
    );
  }
  if (projects.length === 0) {
    return (
      <div className="card overflow-hidden">
        <div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
          <p className="text-[13.5px] font-semibold" style={{ color: "var(--ink)" }}>
            {emptyMessage}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <div role="list">
        {projects.map((project) => (
          <ProjectRow key={project.id} project={project} drives={drives} />
        ))}
      </div>
    </div>
  );
}
