import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Project } from "@drive-project-catalog/domain";


import { useCatalogStore } from "../app/providers";
import { formatBytes, formatDate, formatParsedDate, getProjectName, getProjectStatusBadges } from "./dashboardHelpers";
import { CapacityBar, CapacityLegend, ConfirmModal, EmptyState, LoadingState, MetricCard, SectionCard, StatusBadge } from "./pagePrimitives";

export function DriveDetailPage() {
  const { driveId = "" } = useParams();
  const navigate = useNavigate();
  const { isLoading, isMutating, getDriveDetailView, selectDrive, deleteDrive } = useCatalogStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
        <div className="flex items-center gap-2">
          <button type="button" className="button-danger" onClick={() => setShowDeleteConfirm(true)}>Delete</button>
          <Link to="/drives" className="button-secondary">Back</Link>
        </div>
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

