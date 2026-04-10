import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  buildScanSessionListItems,
  getScanStatusLabel,
  getScanStatusMessage,
  type ScanHistoryStatusFilter
} from "@drive-project-catalog/data";
import { useCatalogStore } from "../app/providers";
import { formatDate } from "./dashboardHelpers";
import { EmptyState, LoadingState, MetricCard, SectionCard, StatusBadge } from "./pagePrimitives";
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
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={[
                "rounded border px-2 py-1 text-[11px] font-medium transition-colors",
                statusFilter === filter.value ? "text-white" : ""
              ].join(" ")}
              style={
                statusFilter === filter.value
                  ? { borderColor: "var(--color-accent)", background: "var(--color-accent)" }
                  : { borderColor: "var(--color-border)", color: "var(--color-text-muted)" }
              }
            >
              {filter.label}
            </button>
          ))}
        </div>

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
          className="field-shell min-w-[200px] bg-transparent text-[13px] outline-none"
        >
          <option value="">All drives</option>
          {drives.map((drive) => (
            <option key={drive.id} value={drive.id}>{drive.displayName}</option>
          ))}
        </select>
      </div>

      <SectionCard title="Scan sessions">
        {isLoading ? (
          <LoadingState label="Loading scan history" />
        ) : sessions.length === 0 ? (
          <EmptyState
            title={scanSessions.length === 0 ? "No scan sessions yet" : "No matches"}
            description={scanSessions.length === 0
              ? "Run the first desktop scan to populate history."
              : "Loosen the filters to see sessions."}
          />
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {sessions.map((session) => (
              <article key={session.scanId} className="py-4 first:pt-0">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge label={getScanStatusLabel(session)} />
                      <Link
                        to={`/scans/${session.scanId}`}
                        className="text-[14px] font-semibold hover:underline"
                        style={{ color: "var(--color-text)" }}
                      >
                        {session.driveName}
                      </Link>
                    </div>
                    <p className="mt-0.5 text-[12px] break-all" style={{ color: "var(--color-text-muted)" }}>
                      {session.targetPath}
                    </p>
                    {(session.status === "failed" || session.status === "interrupted" || session.status === "cancelled") ? (
                      <p className="mt-1 text-[12px]" style={{ color: session.status === "cancelled" ? "var(--color-warning)" : "var(--color-danger)" }}>
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
                  <Link to={`/scans/${session.scanId}`} className="button-secondary shrink-0">Detail</Link>
                </div>

                <div className="mt-2 flex flex-wrap gap-6">
                  <MetricCard label="Started" value={formatDate(session.startedAt)} />
                  <MetricCard label="Ended" value={formatDate(session.finishedAt)} />
                  <MetricCard label="Duration" value={formatScanDuration(session.durationMs)} />
                  <MetricCard label="Folders" value={String(session.foldersScanned)} />
                  <MetricCard label="Matches" value={String(session.matchesFound)} />
                </div>

                <div className="mt-1 flex flex-wrap gap-6">
                  <MetricCard label="New" value={String(session.newProjectsCount)} />
                  <MetricCard label="Updated" value={String(session.updatedProjectsCount)} />
                  <MetricCard label="Missing" value={String(session.missingProjectsCount)} />
                  <MetricCard label="Duplicates" value={String(session.duplicatesFlaggedCount)} />
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
