import { useEffect, useState } from "react";
import {
  getActiveScanSession,
  getLatestCompletedScanSession,
  getLatestTerminalScanSession,
  getScanStatusLabel,
  getScanStatusMessage
} from "@drive-project-catalog/data";
import { Link } from "react-router-dom";
import { useCatalogStore } from "../app/providers";
import {
  formatBytes,
  formatDate,
  formatParsedDate,
  getDriveName,
  getProjectName,
  getProjectStatusBadges
} from "./dashboardHelpers";
import { formatElapsedSeconds, formatScanDuration } from "./scanPageHelpers";
import { CapacityBar, EmptyState, MetricCard, MetricCardSkeleton, SectionCard, StatusBadge } from "./pagePrimitives";

export function DashboardPage() {
  const { dashboard, drives, isLoading, scanSessions } = useCatalogStore();
  const activeScan = getActiveScanSession(scanSessions);
  const latestCompletedScan = getLatestCompletedScanSession(scanSessions);
  const latestTerminalScan = getLatestTerminalScanSession(scanSessions);

  // Live elapsed-time counter for the active scan banner — ticks every second.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!activeScan) { setElapsedSeconds(0); return; }
    const startMs = new Date(activeScan.startedAt).getTime();
    setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [activeScan?.scanId, activeScan?.startedAt]);

  // Show folders/sec only after a few seconds to avoid noisy initial values.
  const foldersPerSec =
    activeScan && elapsedSeconds > 2 && activeScan.foldersScanned > 0
      ? (activeScan.foldersScanned / elapsedSeconds).toFixed(1)
      : null;

  if (isLoading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Loading dashboard">
        {/* Metric strip skeleton */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="app-panel px-4 py-3">
              <MetricCardSkeleton />
            </div>
          ))}
        </div>
        {/* Content skeleton rows */}
        <div className="grid gap-5 xl:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="app-panel px-4 py-4 space-y-3">
              <div className="skeleton h-3.5 w-1/3 rounded" />
              {[0, 1, 2].map((j) => (
                <div key={j} className="skeleton h-10 w-full rounded" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Active scan banner — full-width, top priority, always above fold */}
      {activeScan ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3"
          style={{ background: "var(--color-accent-soft)", borderColor: "var(--color-accent)" }}
          role="status"
          aria-live="polite"
          aria-label={`Active scan: ${activeScan.driveName}`}
        >
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ background: "var(--color-accent)" }} />
          <span className="text-[13px] font-semibold" style={{ color: "var(--color-accent)" }}>
            Scanning {activeScan.driveName}
          </span>
          <span className="text-[13px] tabular-nums" style={{ color: "var(--color-text-muted)" }}>
            {activeScan.foldersScanned} folders · {activeScan.matchesFound} matches
            {elapsedSeconds > 0 ? ` · ${formatElapsedSeconds(elapsedSeconds)}` : ""}
            {foldersPerSec !== null ? ` · ${foldersPerSec}/s` : ""}
          </span>
          <StatusBadge label={activeScan.status} />
          {activeScan.requestedDriveId ? (
            <Link to={`/drives/${activeScan.requestedDriveId}`} className="button-secondary ml-auto">Open drive</Link>
          ) : (
            <Link to="/drives" className="button-secondary ml-auto">Open drives</Link>
          )}
        </div>
      ) : null}

      {/* 2. Top grid: KPIs + scan info (left) · status alerts (right, always visible) */}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          {/* Stats strip */}
          <div className="flex flex-wrap items-center gap-8 border-b pb-4" style={{ borderColor: "var(--color-border)" }}>
            <MetricCard label="Recent scans" value={String(dashboard.recentScans.length)} />
            <MetricCard label="Recent projects" value={String(dashboard.recentProjects.length)} />
            <MetricCard label="Move reminders" value={String(dashboard.moveReminders.length)} />
            <MetricCard label="Status alerts" value={String(dashboard.statusAlerts.length)} />
          </div>

          {/* Latest scan summary */}
          {latestCompletedScan?.summary ? (
            <SectionCard
              title="Latest scan summary"
              action={
                latestCompletedScan.requestedDriveId ? (
                  <Link to={`/drives/${latestCompletedScan.requestedDriveId}`} className="button-secondary">Open drive</Link>
                ) : null
              }
            >
              <div className="flex flex-wrap items-center gap-6">
                <MetricCard label="New" value={String(latestCompletedScan.summary.newProjectsCount)} />
                <MetricCard label="Updated" value={String(latestCompletedScan.summary.updatedProjectsCount)} />
                <MetricCard label="Missing" value={String(latestCompletedScan.summary.missingProjectsCount)} />
                <MetricCard label="Duplicates" value={String(latestCompletedScan.summary.duplicatesFlaggedCount)} />
                <MetricCard
                  label="Duration"
                  value={latestCompletedScan.summary.durationMs != null ? formatScanDuration(latestCompletedScan.summary.durationMs) : "N/A"}
                />
              </div>
            </SectionCard>
          ) : null}

          {/* Latest scan outcome (failed / interrupted) */}
          {latestTerminalScan && latestTerminalScan.status !== "completed" && latestTerminalScan.status !== "running" ? (
            <SectionCard title="Latest scan outcome">
              <div className="flex items-center gap-4 text-[13px]">
                <StatusBadge label={getScanStatusLabel(latestTerminalScan)} />
                <span style={{ color: "var(--color-text-muted)" }}>{getScanStatusMessage(latestTerminalScan)}</span>
              </div>
            </SectionCard>
          ) : null}
        </div>

        {/* Status alerts — always visible top-right */}
        <SectionCard title="Status alerts">
          {dashboard.statusAlerts.length === 0 ? (
            <EmptyState title="No alerts" description="The catalog currently has no missing, duplicate, or unassigned projects." />
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {dashboard.statusAlerts.map((alert) => (
                <Link
                  key={`${alert.kind}-${alert.projectId}`}
                  to={`/projects/${alert.projectId}`}
                  className="link-card block py-3 first:pt-0"
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge label={alert.kind[0]!.toUpperCase() + alert.kind.slice(1)} />
                    <span className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>{alert.projectName}</span>
                  </div>
                  <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>{alert.detail}</p>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* 3. Recent scans + move reminders */}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Recent scans">
          {dashboard.recentScans.length === 0 ? (
            <EmptyState title="No scans yet" description="Recent scan cards will appear here after the first drive scans are recorded." />
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {dashboard.recentScans.map((scan) => (
                <Link
                  key={scan.id}
                  to={scan.driveId ? `/drives/${scan.driveId}` : "/drives"}
                  className="link-card block py-3 transition-colors first:pt-0 hover:bg-[color:var(--color-surface-subtle)]"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>{scan.driveName}</p>
                    <p className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>{scan.projectCount} projects</p>
                  </div>
                  <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-soft)" }}>
                    Last scanned {formatDate(scan.lastScannedAt)}
                  </p>
                  <div className="mt-2">
                    <CapacityBar
                      usedBytes={scan.totalCapacityBytes && scan.freeBytes !== null ? scan.totalCapacityBytes - scan.freeBytes : null}
                      totalBytes={scan.totalCapacityBytes}
                      height="sm"
                    />
                  </div>
                  <div className="mt-1.5 flex gap-4 text-[11px]" style={{ color: "var(--color-text-soft)" }}>
                    <span>{formatBytes(scan.totalCapacityBytes)} total</span>
                    <span>{formatBytes(scan.freeBytes)} free</span>
                    <span>{formatBytes(scan.reservedIncomingBytes)} reserved</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Move reminders">
          {dashboard.moveReminders.length === 0 ? (
            <EmptyState title="No pending moves" description="Move reminders appear here when a project gets a target drive." />
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {dashboard.moveReminders.map((reminder) => (
                <Link
                  key={reminder.projectId}
                  to={`/projects/${reminder.projectId}`}
                  className="link-card block py-3 first:pt-0"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>{reminder.projectName}</p>
                    <StatusBadge label="Move pending" />
                  </div>
                  <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
                    {reminder.currentDriveName} → {reminder.targetDriveName}
                  </p>
                  <p className="mt-1 text-[11px] font-medium" style={{ color: "var(--color-warning)" }}>
                    {formatBytes(reminder.sizeBytes)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* 4. Recent projects + quick search */}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Recent projects">
          {dashboard.recentProjects.length === 0 ? (
            <EmptyState title="No projects yet" description="Create a manual project or import one from a scan to populate this table." />
          ) : (
            <table className="min-w-full text-left text-[13px]">
              <thead>
                <tr className="border-b text-[11px] font-medium" style={{ borderColor: "var(--color-border)", color: "var(--color-text-soft)" }}>
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium">Project</th>
                  <th className="pb-2 pr-4 font-medium">Drive</th>
                  <th className="pb-2 font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentProjects.map((project) => (
                  <tr key={project.id} className="border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                    <td className="py-2 pr-4" style={{ color: "var(--color-text-muted)" }}>{formatParsedDate(project.correctedDate ?? project.parsedDate)}</td>
                    <td className="py-2 pr-4">
                      <Link to={`/projects/${project.id}`} className="font-medium hover:text-[color:var(--color-accent)]" style={{ color: "var(--color-text)" }}>
                        {getProjectName(project)}
                      </Link>
                    </td>
                    <td className="py-2 pr-4" style={{ color: "var(--color-text-muted)" }}>{getDriveName(drives, project.currentDriveId)}</td>
                    <td className="py-2 tabular-nums" style={{ color: "var(--color-text-muted)" }}>{formatBytes(project.sizeBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <SectionCard title="Quick search targets">
          {dashboard.recentProjects.length === 0 ? (
            <EmptyState title="No quick targets yet" description="Quick project links appear here after the first catalog entries are created or scanned." />
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {dashboard.recentProjects.slice(0, 3).map((project) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="link-card flex items-center justify-between py-2.5 first:pt-0"
                >
                  <span className="text-[13px] font-medium" style={{ color: "var(--color-text)" }}>{getProjectName(project)}</span>
                  <div className="flex gap-1.5">
                    {getProjectStatusBadges(project).map((badge) => (
                      <StatusBadge key={badge} label={badge} />
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
