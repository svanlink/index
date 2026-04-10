import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  buildStoragePlanningRows,
  buildStoragePlanningSummary,
  getDriveHealthLabel
} from "@drive-project-catalog/data";


import { useCatalogStore } from "../app/providers";
import { formatBytes, formatParsedDate, getProjectName } from "./dashboardHelpers";
import { CapacityBar, CapacityLegend, EmptyState, LoadingState, MetricCard, SectionCard, StatusBadge } from "./pagePrimitives";

export function StoragePlanningPage() {
  const { drives, projects, isLoading } = useCatalogStore();
  const planningRows = useMemo(() => buildStoragePlanningRows(drives, projects), [drives, projects]);
  const summary = useMemo(() => buildStoragePlanningSummary(planningRows, projects), [planningRows, projects]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        {summary.unassignedProjectCount > 0 ? (
          <Link to="/projects?unassigned=1" className="button-secondary">
            Review {summary.unassignedProjectCount} unassigned
          </Link>
        ) : (
          <Link to="/drives" className="button-secondary">Open drives</Link>
        )}
      </div>

      <div className="flex items-center gap-8 border-b pb-4" style={{ borderColor: "var(--color-border)" }}>
        <SummaryCard label="Drives" value={String(summary.totalDrives)} />
        <SummaryCard label="Overcommitted" value={String(summary.overcommittedCount)} />
        <SummaryCard label="Unknown impact" value={String(summary.unknownImpactCount)} />
        <SummaryCard label="Reserved incoming" value={formatBytes(summary.totalReservedIncomingBytes)} />
      </div>

      <SectionCard
        title="Drive planning board"
        description="Overcommitted drives rise to the top, followed by the lowest effective free space after reserved incoming moves."
      >
        {isLoading ? (
          <LoadingState label="Loading storage planning" />
        ) : planningRows.length === 0 ? (
          <EmptyState title="No drives available" description="Create or scan a drive to start planning storage pressure." />
        ) : (
          <div className="space-y-5">
            {planningRows.map((row) => (
              <article key={row.drive.id} className="border-b py-5 last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-semibold" style={{ color: "var(--color-text)" }}>
                        {row.drive.displayName}
                      </h3>
                      <StatusBadge label={getDriveHealthLabel(row.health)} />
                      {row.hasUnknownIncomingImpact ? <StatusBadge label="Unknown impact" /> : null}
                    </div>
                    <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                      {row.pendingIncomingMoveCount} incoming move{row.pendingIncomingMoveCount === 1 ? "" : "s"} · {row.pendingOutgoingMoveCount} outgoing move{row.pendingOutgoingMoveCount === 1 ? "" : "s"} · {row.projectCount} current project{row.projectCount === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link to={`/drives/${row.drive.id}`} className="button-secondary">
                      Open drive
                    </Link>
                    <Link to={`/projects?targetDrive=${row.drive.id}&movePending=1`} className="button-secondary">
                      Incoming moves
                    </Link>
                    <Link to={`/projects?drive=${row.drive.id}&movePending=1`} className="button-secondary">
                      Outgoing moves
                    </Link>
                  </div>
                </div>

                <div className="mt-3">
                  <CapacityBar
                    usedBytes={row.usedBytes}
                    totalBytes={row.drive.totalCapacityBytes}
                    reservedBytes={row.reservedIncomingBytes}
                    overcommitted={row.health === "overcommitted"}
                  />
                </div>
                <CapacityLegend usedLabel="Used" reservedLabel="Reserved" freeLabel="Free" />

                <div className="mt-3 flex flex-wrap gap-6">
                  <MetricCard label="Capacity" value={formatBytes(row.drive.totalCapacityBytes)} />
                  <MetricCard label="Used" value={formatBytes(row.usedBytes)} />
                  <MetricCard label="Free" value={formatBytes(row.freeBytes)} />
                  <MetricCard label="Reserved incoming" value={formatBytes(row.reservedIncomingBytes)} />
                  <MetricCard label="Effective free" value={formatBytes(row.rawEffectiveFreeBytes)} />
                </div>

                <div className="mt-3 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                  <div className="flex flex-wrap gap-6">
                    <MetricCard label="Current projects" value={String(row.projectCount)} />
                    <MetricCard label="Incoming plans" value={String(row.pendingIncomingMoveCount)} />
                    <MetricCard label="Outgoing plans" value={String(row.pendingOutgoingMoveCount)} />
                    <MetricCard label="Unknown incoming" value={String(row.unknownIncomingCount)} />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <MoveBreakdown
                      title="Incoming breakdown"
                      description={`${formatBytes(row.knownIncomingBytes)} known incoming reserved`}
                      projects={row.incomingProjects}
                      emptyLabel="No pending incoming moves."
                    />
                    <MoveBreakdown
                      title="Outgoing breakdown"
                      description="Projects currently leaving this drive."
                      projects={row.outgoingProjects}
                      emptyLabel="No outgoing move pressure."
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium" style={{ color: "var(--color-text-soft)" }}>{label}</p>
      <p className="mt-0.5 text-[18px] font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>{value}</p>
    </div>
  );
}


function MoveBreakdown({
  title,
  description,
  projects,
  emptyLabel
}: {
  title: string;
  description: string;
  projects: ReturnType<typeof buildStoragePlanningRows>[number]["incomingProjects"];
  emptyLabel: string;
}) {
  return (
    <div>
      <p className="text-[12px] font-semibold" style={{ color: "var(--color-text)" }}>{title}</p>
      <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>{description}</p>
      {projects.length === 0 ? (
        <p className="mt-2 text-[12px]" style={{ color: "var(--color-text-muted)" }}>{emptyLabel}</p>
      ) : (
        <div className="mt-2 divide-y" style={{ borderColor: "var(--color-border)" }}>
          {projects.slice(0, 4).map((project) => (
            <Link key={project.id} to={`/projects/${project.id}`} className="link-card flex items-center justify-between py-1.5 first:pt-0">
              <div>
                <p className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>{getProjectName(project)}</p>
                <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                  {[(project.correctedDate ?? project.parsedDate) ? formatParsedDate(project.correctedDate ?? project.parsedDate) : null, formatBytes(project.sizeBytes)].filter(Boolean).join(" · ")}
                </p>
              </div>
              {project.sizeBytes === null ? <StatusBadge label="Unknown size impact" /> : null}
            </Link>
          ))}
          {projects.length > 4 ? (
            <p className="pt-1 text-[11px]" style={{ color: "var(--color-text-soft)" }}>+{projects.length - 4} more</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
