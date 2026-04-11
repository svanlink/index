import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Project } from "@drive-project-catalog/domain";

import { useVolumeInfo } from "../app/scanCommands";
import { useCatalogStore } from "../app/providers";
import { formatBytes, formatDate, formatParsedDate, getProjectName, getProjectStatusBadges } from "./dashboardHelpers";
import { CapacityBar, CapacityLegend, ConfirmModal, EmptyState, LoadingState, MetricCard, SectionCard, StatusBadge } from "./pagePrimitives";

export function DriveDetailPage() {
  const { driveId = "" } = useParams();
  const navigate = useNavigate();
  const { isLoading, isMutating, getDriveDetailView, selectDrive, deleteDrive, scanSessions } = useCatalogStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const driveRootPath = scanSessions
    .filter((s) => s.requestedDriveId === driveId)
    .sort((a, b) =>
      (b.finishedAt ?? b.updatedAt ?? b.startedAt).localeCompare(
        a.finishedAt ?? a.updatedAt ?? a.startedAt
      )
    )[0]?.rootPath ?? null;
  const volumeInfo = useVolumeInfo(driveRootPath);

  useEffect(() => {
    selectDrive(driveId || null);

    return () => {
      selectDrive(null);
    };
  }, [driveId, selectDrive]);

  if (isLoading) {
    return <LoadingState label="Loading drive detail" />;
  }

  const detail = getDriveDetailView(driveId);

  if (!detail) {
    return <EmptyState title="Drive not found" description="The requested drive is not available in the current local catalog." />;
  }

  const { drive, projects, incomingProjects, missingProjects } = detail;

  async function handleDeleteDrive() {
    try {
      await deleteDrive(driveId);
      navigate("/drives");
    } catch {
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div className="space-y-6">
      {showDeleteConfirm ? (
        <ConfirmModal
          title="Delete drive?"
          description={`"${drive.displayName}" will be permanently removed from the catalog. Projects assigned to this drive will become unassigned. This cannot be undone.`}
          confirmLabel="Delete drive"
          onConfirm={() => void handleDeleteDrive()}
          onCancel={() => setShowDeleteConfirm(false)}
          isLoading={isMutating}
        />
      ) : null}

      <div className="flex items-center justify-between">
        <div />
        <Link to="/drives" className="button-secondary">Back</Link>
      </div>

      <SectionCard title="Drive summary" description="Capacity and reservation data stays local-first and updates as move plans change.">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <CapacityBar
              usedBytes={drive.usedBytes}
              totalBytes={drive.totalCapacityBytes}
              reservedBytes={drive.reservedIncomingBytes}
            />
            <CapacityLegend usedLabel="Used" reservedLabel="Reserved" freeLabel="Free" />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <MetricCard label="Used" value={formatBytes(drive.usedBytes)} />
              <MetricCard label="Reserved incoming" value={formatBytes(drive.reservedIncomingBytes)} />
              <MetricCard label="Remaining after reserve" value={formatBytes(drive.freeBytes === null ? null : Math.max(drive.freeBytes - drive.reservedIncomingBytes, 0))} />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard label="Capacity" value={formatBytes(drive.totalCapacityBytes)} />
            <MetricCard label="Free" value={formatBytes(drive.freeBytes)} />
            <MetricCard label="Projects" value={String(projects.length)} />
            <MetricCard label="Incoming plans" value={String(incomingProjects.length)} />
            <MetricCard label="Missing records" value={String(missingProjects.length)} />
            <MetricCard label="Last scan" value={formatDate(drive.lastScannedAt)} />
            {volumeInfo ? (
              <>
                <MetricCard label="Filesystem" value={volumeInfo.filesystemType} />
                <MetricCard label="Volume total" value={formatBytes(volumeInfo.totalBytes)} />
                <MetricCard label="Volume free" value={formatBytes(volumeInfo.freeBytes)} />
              </>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <section className="grid gap-6 xl:grid-cols-3">
        <ProjectCollection
          title="Projects on this drive"
          description="Current project assignments."
          projects={projects}
        />
        <ProjectCollection
          title="Incoming move plans"
          description="Projects reserving incoming space on this drive."
          projects={incomingProjects}
          accentLabel="Incoming"
        />
        <ProjectCollection
          title="Missing projects"
          description="Projects last associated with this drive but absent from later scans."
          projects={missingProjects}
          accentLabel="Missing"
        />
      </section>

      {/* Danger zone — separated from primary actions */}
      <div className="rounded-lg border px-4 py-4" style={{ borderColor: "var(--color-border)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-text-soft)" }}>Danger zone</p>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>Delete drive</p>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
              Permanently removes this drive from the catalog. Projects assigned to it will become unassigned.
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

function ProjectCollection({
  title,
  description,
  projects,
  accentLabel
}: {
  title: string;
  description: string;
  projects: Project[];
  accentLabel?: string;
}) {
  return (
    <SectionCard title={title} description={description}>
      {projects.length === 0 ? (
        <EmptyState title="No projects" description="Nothing in this section yet." />
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="link-card flex items-center justify-between border-b py-2.5 last:border-b-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div>
                <p className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>{getProjectName(project)}</p>
                <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                  {formatParsedDate(project.parsedDate)} · {formatBytes(project.sizeBytes)}
                </p>
              </div>
              <div className="flex gap-1">
                {accentLabel ? <StatusBadge label={accentLabel} /> : null}
                {getProjectStatusBadges(project).map((badge) => (
                  <StatusBadge key={badge} label={badge} />
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

