import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import type { Project } from "@drive-project-catalog/domain";
import { PageHeader } from "@drive-project-catalog/ui";
import { useCatalogStore } from "../app/providers";
import { formatBytes, formatDate, formatParsedDate, getProjectName, getProjectStatusBadges } from "./dashboardHelpers";
import { CapacityLegend, EmptyState, LoadingState, SectionCard, StatusBadge } from "./pagePrimitives";

export function DriveDetailPage() {
  const { driveId = "" } = useParams();
  const { isLoading, getDriveDetailView, selectDrive } = useCatalogStore();

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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Drive detail"
        title={drive.displayName}
        description="Review capacity, current projects, incoming move plans, and missing records still associated with this drive."
        actions={
          <Link to="/drives" className="button-secondary">
            Back to drives
          </Link>
        }
      />

      <SectionCard title="Drive summary" description="Capacity and reservation data stays local-first and updates as move plans change.">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="overflow-hidden rounded-full" style={{ background: "#e5dfd5" }}>
              <div
                className="relative h-3 rounded-full"
                style={{
                  width:
                    drive.totalCapacityBytes && drive.usedBytes !== null
                      ? `${Math.max(8, (drive.usedBytes / drive.totalCapacityBytes) * 100)}%`
                      : "30%",
                  background: "var(--color-accent)"
                }}
              >
                {drive.totalCapacityBytes && drive.reservedIncomingBytes > 0 ? (
                  <div
                    className="absolute right-0 top-0 h-full rounded-full"
                    style={{
                      width: `${Math.max(6, (drive.reservedIncomingBytes / drive.totalCapacityBytes) * 100)}%`,
                      background: "#b18f63"
                    }}
                  />
                ) : null}
              </div>
            </div>
            <CapacityLegend usedLabel="Used" reservedLabel="Reserved" freeLabel="Free" />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Metric label="Used" value={formatBytes(drive.usedBytes)} />
              <Metric label="Reserved incoming" value={formatBytes(drive.reservedIncomingBytes)} />
              <Metric label="Remaining after reserve" value={formatBytes(drive.freeBytes === null ? null : Math.max(drive.freeBytes - drive.reservedIncomingBytes, 0))} />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Metric label="Capacity" value={formatBytes(drive.totalCapacityBytes)} />
            <Metric label="Free" value={formatBytes(drive.freeBytes)} />
            <Metric label="Projects" value={String(projects.length)} />
            <Metric label="Incoming plans" value={String(incomingProjects.length)} />
            <Metric label="Missing records" value={String(missingProjects.length)} />
            <Metric label="Last scan" value={formatDate(drive.lastScannedAt)} />
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
              className="block rounded-[18px] border px-4 py-4 transition hover:bg-[#f7f5f0]"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium" style={{ color: "var(--color-text)" }}>{getProjectName(project)}</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                    {formatParsedDate(project.parsedDate)} · {formatBytes(project.sizeBytes)}
                  </p>
                </div>
                {accentLabel ? <StatusBadge label={accentLabel} /> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border bg-white px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>{label}</p>
      <p className="mt-2 text-base font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>{value}</p>
    </div>
  );
}
