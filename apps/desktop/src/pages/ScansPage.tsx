import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  buildScanSessionListItems,
  getScanStatusLabel,
  getScanStatusMessage,
  type ScanHistoryStatusFilter
} from "@drive-project-catalog/data";
import { PageHeader } from "@drive-project-catalog/ui";
import { useCatalogStore } from "../app/providers";
import { formatDate } from "./dashboardHelpers";
import { EmptyState, LoadingState, SectionCard, StatusBadge } from "./pagePrimitives";
import { formatScanDuration } from "./scanPageHelpers";

const statusFilters: Array<{ label: string; value: ScanHistoryStatusFilter }> = [
  { label: "All", value: "all" },
  { label: "Completed", value: "completed" },
  { label: "Running", value: "running" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Failed", value: "failed" },
  { label: "Interrupted", value: "interrupted" }
];

export function ScansPage() {
  const { scanSessions, drives, isLoading } = useCatalogStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<ScanHistoryStatusFilter>("all");
  const driveFilter = searchParams.get("drive") ?? "";

  const sessions = useMemo(
    () => buildScanSessionListItems(scanSessions, drives, { status: statusFilter, driveId: driveFilter || undefined }),
    [driveFilter, drives, scanSessions, statusFilter]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Scans"
        title="Scan history"
        description="Review completed, running, cancelled, failed, and interrupted desktop scan sessions from the persisted local catalog."
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-3">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={[
                "rounded-full border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                statusFilter === filter.value ? "text-white" : "bg-white"
              ].join(" ")}
              style={
                statusFilter === filter.value
                  ? { borderColor: "var(--color-accent)", background: "var(--color-accent)" }
                  : { borderColor: "var(--color-border-strong)", color: "var(--color-text-muted)" }
              }
            >
              {filter.label}
            </button>
          ))}
        </div>

        <label className="space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-text-soft)" }}>
            Drive filter
          </span>
          <select
            value={driveFilter}
            onChange={(event) => {
              const next = new URLSearchParams(searchParams);
              if (event.target.value) {
                next.set("drive", event.target.value);
              } else {
                next.delete("drive");
              }
              setSearchParams(next);
            }}
            className="field-shell min-w-[240px] bg-transparent px-4 py-3 outline-none"
          >
            <option value="">All drives</option>
            {drives.map((drive) => (
              <option key={drive.id} value={drive.id}>
                {drive.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SectionCard
        title="Scan sessions"
        description="Newest first, with durable session lifecycle state, path mapping, and ingestion summaries ready for operational review."
      >
        {isLoading ? (
          <LoadingState label="Loading scan history" />
        ) : sessions.length === 0 ? (
          <EmptyState title="No scan sessions match this filter" description="Start a scan or loosen the filters to review persisted sessions." />
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => (
              <article
                key={session.scanId}
                className="rounded-[20px] border px-5 py-5"
                style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label={getScanStatusLabel(session)} />
                      <Link
                        to={`/scans/${session.scanId}`}
                        className="text-[18px] font-semibold transition hover:opacity-75"
                        style={{ color: "var(--color-text)" }}
                      >
                        {session.driveName}
                      </Link>
                    </div>
                    <p className="mt-2 text-sm break-all" style={{ color: "var(--color-text-muted)" }}>
                      {session.targetPath}
                    </p>
                    {(session.status === "failed" || session.status === "interrupted" || session.status === "cancelled") ? (
                      <p className="mt-3 text-sm leading-6" style={{ color: session.status === "cancelled" ? "var(--color-warning)" : "var(--color-danger)" }}>
                        {getScanStatusMessage({
                          status: session.status,
                          error: session.error,
                          summary: null,
                          finishedAt: session.finishedAt,
                          startedAt: session.startedAt
                        })}
                      </p>
                    ) : null}
                  </div>

                  <Link to={`/scans/${session.scanId}`} className="button-secondary shrink-0">
                    View detail
                  </Link>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <Metric label="Started" value={formatDate(session.startedAt)} />
                  <Metric label="Ended" value={formatDate(session.finishedAt)} />
                  <Metric label="Duration" value={formatScanDuration(session.durationMs)} />
                  <Metric label="Folders scanned" value={String(session.foldersScanned)} />
                  <Metric label="Matches found" value={String(session.matchesFound)} />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Metric label="New projects" value={String(session.newProjectsCount)} />
                  <Metric label="Updated projects" value={String(session.updatedProjectsCount)} />
                  <Metric label="Missing projects" value={String(session.missingProjectsCount)} />
                  <Metric label="Duplicates flagged" value={String(session.duplicatesFlaggedCount)} />
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
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
