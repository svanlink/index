import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  buildStoragePlanningRows,
  buildStoragePlanningSummary,
  getDriveHealthLabel
} from "@drive-project-catalog/data";
import type { ScanSessionSnapshot } from "@drive-project-catalog/domain";

import { useVolumeInfo } from "../app/scanCommands";
import { useCatalogStore } from "../app/providers";
import { formatBytes, formatParsedDate, getProjectName } from "./dashboardHelpers";
import { CapacityBar, CapacityLegend, EmptyState, MetricCard, MetricCardSkeleton, SectionCard, StatusBadge } from "./pagePrimitives";

export function StoragePlanningPage() {
  const { drives, projects, scanSessions, isLoading } = useCatalogStore();
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
          <div className="space-y-3" aria-busy="true" aria-label="Loading storage planning">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--color-border)" }}>
                <div className="skeleton h-3.5 w-1/3 rounded" />
                <div className="skeleton h-2 w-full rounded-full" />
                <div className="flex gap-4">
                  {[0, 1, 2, 3].map((j) => <MetricCardSkeleton key={j} />)}
                </div>
              </div>
            ))}
          </div>
        ) : planningRows.length === 0 ? (
          <EmptyState title="No drives available" description="Add a drive or run a scan first to start planning storage." />
        ) : (
          <div className="space-y-5">
            {planningRows.map((row) => (
              <DriveRow key={row.drive.id} row={row} scanSessions={scanSessions} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

type PlanningRow = ReturnType<typeof buildStoragePlanningRows>[number];

function DriveRow({ row, scanSessions }: { row: PlanningRow; scanSessions: ScanSessionSnapshot[] }) {
  const driveRootPath = scanSessions
    .filter((s) => s.requestedDriveId === row.drive.id)
    .sort((a, b) =>
      (b.finishedAt ?? b.updatedAt ?? b.startedAt).localeCompare(
        a.finishedAt ?? a.updatedAt ?? a.startedAt
      )
    )[0]?.rootPath ?? null;
  const volumeInfo = useVolumeInfo(driveRootPath);

  const displayTotal = row.drive.totalCapacityBytes ?? volumeInfo?.totalBytes ?? null;
  const displayFree = row.freeBytes ?? volumeInfo?.freeBytes ?? null;
  const effectiveFree = row.rawEffectiveFreeBytes ?? (volumeInfo ? volumeInfo.freeBytes - row.reservedIncomingBytes : null);

  const healthBorderColor =
    row.health === "overcommitted"
      ? "var(--color-danger)"
      : row.health === "near-capacity"
        ? "var(--color-warning)"
        : "var(--color-border-success)";

  return (
    <article
      className="rounded-lg border-l-[3px] border border-l-[color:var(--border-l)] py-5 px-4 last:mb-0"
      style={{
        "--border-l": healthBorderColor,
        borderColor: "var(--color-border)",
        borderLeftColor: healthBorderColor
      } as React.CSSProperties}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--color-text)" }}>
              {row.drive.displayName}
            </h3>
            <StatusBadge label={getDriveHealthLabel(row.health)} />
            {row.hasUnknownIncomingImpact ? <StatusBadge label="Unknown impact" /> : null}
            {volumeInfo ? (
              <span className="text-[11px]" style={{ color: "var(--color-text-soft)" }}>
                {volumeInfo.filesystemType}
              </span>
            ) : null}
          </div>
          <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
            {row.pendingIncomingMoveCount} incoming move{row.pendingIncomingMoveCount === 1 ? "" : "s"} · {row.pendingOutgoingMoveCount} outgoing move{row.pendingOutgoingMoveCount === 1 ? "" : "s"} · {row.projectCount} current project{row.projectCount === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link to={`/drives/${row.drive.id}`} className="button-secondary">Open drive</Link>
          <Link to={`/projects?targetDrive=${row.drive.id}&movePending=1`} className="button-secondary">Incoming moves</Link>
          <Link to={`/projects?drive=${row.drive.id}&movePending=1`} className="button-secondary">Outgoing moves</Link>
        </div>
      </div>

      <div className="mt-3">
        <CapacityBar
          usedBytes={row.usedBytes}
          totalBytes={displayTotal}
          reservedBytes={row.reservedIncomingBytes}
          overcommitted={row.health === "overcommitted"}
        />
      </div>
      <CapacityLegend usedLabel="Used" reservedLabel="Reserved" freeLabel="Free" />

      <div className="mt-3 flex flex-wrap gap-6">
        <MetricCard label="Capacity" value={formatBytes(displayTotal)} />
        <MetricCard label="Used" value={formatBytes(row.usedBytes)} />
        <MetricCard label="Free" value={formatBytes(displayFree)} />
        <MetricCard label="Reserved incoming" value={formatBytes(row.reservedIncomingBytes)} />
        <MetricCard label="Effective free" value={formatBytes(effectiveFree)} />
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
            moreLink={`/projects?targetDrive=${row.drive.id}&movePending=1`}
          />
          <MoveBreakdown
            title="Outgoing breakdown"
            description="Projects currently leaving this drive."
            projects={row.outgoingProjects}
            emptyLabel="No outgoing move pressure."
            moreLink={`/projects?drive=${row.drive.id}&movePending=1`}
          />
        </div>
      </div>
    </article>
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
  emptyLabel,
  moreLink
}: {
  title: string;
  description: string;
  projects: ReturnType<typeof buildStoragePlanningRows>[number]["incomingProjects"];
  emptyLabel: string;
  moreLink?: string;
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
          {projects.length > 4 && moreLink ? (
            <Link
              to={moreLink}
              className="block pt-1.5 text-[11px] font-medium hover:underline"
              style={{ color: "var(--color-accent)" }}
            >
              +{projects.length - 4} more
            </Link>
          ) : projects.length > 4 ? (
            <p className="pt-1 text-[11px]" style={{ color: "var(--color-text-soft)" }}>
              +{projects.length - 4} more
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
