import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  buildStoragePlanningRows,
  buildStoragePlanningSummary,
  getDriveHealthLabel
} from "@drive-project-catalog/data";
import { PageHeader } from "@drive-project-catalog/ui";
import { useCatalogStore } from "../app/providers";
import { formatBytes, formatParsedDate, getProjectName } from "./dashboardHelpers";
import { CapacityLegend, EmptyState, LoadingState, SectionCard, StatusBadge } from "./pagePrimitives";

export function StoragePlanningPage() {
  const { drives, projects, isLoading } = useCatalogStore();
  const planningRows = useMemo(() => buildStoragePlanningRows(drives, projects), [drives, projects]);
  const summary = useMemo(() => buildStoragePlanningSummary(planningRows, projects), [planningRows, projects]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Storage planning"
        title="Capacity planning"
        description="Review effective free space, incoming reservation pressure, and move concentration across all drives before the next archive decision."
        actions={
          summary.unassignedProjectCount > 0 ? (
            <Link to="/projects?unassigned=1" className="button-secondary">
              Review {summary.unassignedProjectCount} unassigned
            </Link>
          ) : (
            <Link to="/drives" className="button-secondary">
              Open drives
            </Link>
          )
        }
      />

      <section className="grid gap-4 xl:grid-cols-4">
        <SummaryCard label="Drives" value={String(summary.totalDrives)} detail="Planning rows sorted by urgency." />
        <SummaryCard label="Overcommitted" value={String(summary.overcommittedCount)} detail="Drives where reserved incoming exceeds free space." />
        <SummaryCard label="Unknown impact" value={String(summary.unknownImpactCount)} detail="Drives with incoming projects that still have unknown size." />
        <SummaryCard label="Reserved incoming" value={formatBytes(summary.totalReservedIncomingBytes)} detail="Known incoming space already reserved by pending moves." />
      </section>

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
              <article key={row.drive.id} className="rounded-[22px] border p-5 xl:p-6" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[24px] font-semibold tracking-[-0.02em]" style={{ color: "var(--color-text)" }}>
                        {row.drive.displayName}
                      </h3>
                      <StatusBadge label={getDriveHealthLabel(row.health)} />
                      {row.hasUnknownIncomingImpact ? <StatusBadge label="Unknown impact" /> : null}
                    </div>
                    <p className="text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
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

                <div className="mt-5 overflow-hidden rounded-full" style={{ background: "#e5dfd5" }}>
                  <div
                    className="relative h-3 rounded-full"
                    style={{
                      width:
                        row.drive.totalCapacityBytes && row.usedBytes !== null
                          ? `${Math.max(8, (row.usedBytes / row.drive.totalCapacityBytes) * 100)}%`
                          : "28%",
                      background: "var(--color-accent)"
                    }}
                  >
                    {row.drive.totalCapacityBytes && row.reservedIncomingBytes > 0 ? (
                      <div
                        className="absolute right-0 top-0 h-full rounded-full"
                        style={{
                          width: `${Math.max(6, (row.reservedIncomingBytes / row.drive.totalCapacityBytes) * 100)}%`,
                          background: row.health === "overcommitted" ? "var(--color-danger)" : "#b18f63"
                        }}
                      />
                    ) : null}
                  </div>
                </div>
                <CapacityLegend usedLabel="Used" reservedLabel="Reserved" freeLabel="Free" />

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <Metric label="Capacity" value={formatBytes(row.drive.totalCapacityBytes)} />
                  <Metric label="Used" value={formatBytes(row.usedBytes)} />
                  <Metric label="Free" value={formatBytes(row.freeBytes)} />
                  <Metric label="Reserved incoming" value={formatBytes(row.reservedIncomingBytes)} />
                  <Metric label="Effective free" value={formatBytes(row.rawEffectiveFreeBytes)} />
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Metric label="Current projects" value={String(row.projectCount)} />
                    <Metric label="Incoming plans" value={String(row.pendingIncomingMoveCount)} />
                    <Metric label="Outgoing plans" value={String(row.pendingOutgoingMoveCount)} />
                    <Metric label="Unknown incoming" value={String(row.unknownIncomingCount)} />
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

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="app-panel p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>
        {label}
      </p>
      <p className="mt-3 text-[28px] font-semibold tracking-[-0.03em]" style={{ color: "var(--color-text)" }}>
        {value}
      </p>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
        {detail}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border bg-white px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold tabular-nums" style={{ color: "var(--color-text)" }}>
        {value}
      </p>
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
    <div className="rounded-[18px] border px-4 py-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-subtle)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>
        {title}
      </p>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
        {description}
      </p>
      {projects.length === 0 ? (
        <p className="mt-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
          {emptyLabel}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {projects.slice(0, 4).map((project) => (
            <Link key={project.id} to={`/projects/${project.id}`} className="block rounded-[14px] border px-3 py-3 transition hover:bg-white" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                    {getProjectName(project)}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {formatParsedDate(project.parsedDate)} · {formatBytes(project.sizeBytes)}
                  </p>
                </div>
                {project.sizeBytes === null ? <StatusBadge label="Unknown size impact" /> : null}
              </div>
            </Link>
          ))}
          {projects.length > 4 ? (
            <p className="text-xs" style={{ color: "var(--color-text-soft)" }}>
              +{projects.length - 4} more project{projects.length - 4 === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
