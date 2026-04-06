import {
  getActiveScanSession,
  getLatestCompletedScanSession,
  getLatestTerminalScanSession,
  getScanStatusLabel,
  getScanStatusMessage
} from "@drive-project-catalog/data";
import { Link } from "react-router-dom";
import { PageHeader, StatCard } from "@drive-project-catalog/ui";
import { useCatalogStore } from "../app/providers";
import {
  formatBytes,
  formatDate,
  getDriveName,
  getProjectName,
  getProjectStatusBadges
} from "./dashboardHelpers";
import { EmptyState, LoadingState, SectionCard, StatusBadge } from "./pagePrimitives";

export function DashboardPage() {
  const { dashboard, drives, isLoading, scanSessions } = useCatalogStore();
  const activeScan = getActiveScanSession(scanSessions);
  const latestCompletedScan = getLatestCompletedScanSession(scanSessions);
  const latestTerminalScan = getLatestTerminalScanSession(scanSessions);

  if (isLoading) {
    return <LoadingState label="Loading dashboard overview" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Project-first dashboard"
        description="Recent scans, recent projects, move reminders, and status alerts now update from the same local catalog state used by the functional project and drive workflows."
      />

      <section className="grid gap-4 xl:grid-cols-4">
        <StatCard label="Recent scans" value={String(dashboard.recentScans.length)} detail="Last two scanned drives" />
        <StatCard label="Recent projects" value={String(dashboard.recentProjects.length)} detail="Newest catalog entries" />
        <StatCard label="Move reminders" value={String(dashboard.moveReminders.length)} detail="Pending move confirmations" />
        <StatCard label="Status alerts" value={String(dashboard.statusAlerts.length)} detail="Missing, duplicate, and unassigned" />
      </section>

      {activeScan ? (
        <SectionCard title="Active scan" description="Live desktop scan session progress is persisted and ingested into the catalog while the scan runs.">
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Drive" value={activeScan.driveName} />
            <Metric label="Folders scanned" value={String(activeScan.foldersScanned)} />
            <Metric label="Matches found" value={String(activeScan.matchesFound)} />
            <Metric label="Status" value={activeScan.status} />
          </div>
        </SectionCard>
      ) : null}

      {latestCompletedScan?.summary ? (
        <SectionCard
          title="Latest scan summary"
          description="Most recent completed scan reconciliation summary from the desktop ingestion pipeline."
          action={<Link to={`/scans/${latestCompletedScan.scanId}`} className="button-secondary">Open session</Link>}
        >
          <div className="grid gap-3 md:grid-cols-5">
            <Metric label="New" value={String(latestCompletedScan.summary.newProjectsCount)} />
            <Metric label="Updated" value={String(latestCompletedScan.summary.updatedProjectsCount)} />
            <Metric label="Missing" value={String(latestCompletedScan.summary.missingProjectsCount)} />
            <Metric label="Duplicates" value={String(latestCompletedScan.summary.duplicatesFlaggedCount)} />
            <Metric
              label="Duration"
              value={latestCompletedScan.summary.durationMs ? `${Math.round(latestCompletedScan.summary.durationMs / 1000)} sec` : "N/A"}
            />
          </div>
        </SectionCard>
      ) : null}

      {latestTerminalScan && latestTerminalScan.status !== "completed" && latestTerminalScan.status !== "running" ? (
        <SectionCard title="Latest scan outcome" description="The most recent non-running scan session state recovered from the desktop workflow.">
          <div className="grid gap-3 md:grid-cols-[180px_1fr]">
            <Metric label="Status" value={getScanStatusLabel(latestTerminalScan)} />
            <div className="rounded-[16px] border bg-white px-4 py-3" style={{ borderColor: "var(--color-border)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>
                Summary
              </p>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
                {getScanStatusMessage(latestTerminalScan)}
              </p>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Recent scans" description="The two most recently scanned drives with capacity and reservation context.">
          {dashboard.recentScans.length === 0 ? (
            <EmptyState title="No scans yet" description="Recent scan cards will appear here after the first drive scans are recorded." />
          ) : (
            <div className="space-y-4">
              {dashboard.recentScans.map((scan) => (
                <Link
                  key={scan.id}
                  to={scan.driveId ? `/scans?drive=${scan.driveId}` : "/scans"}
                  className="block rounded-[20px] border p-5 transition hover:opacity-95"
                  style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[18px] font-semibold" style={{ color: "var(--color-text)" }}>{scan.driveName}</p>
                      <p className="text-sm" style={{ color: "var(--color-text-soft)" }}>Last scanned {formatDate(scan.lastScannedAt)}</p>
                    </div>
                    <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{scan.projectCount} projects indexed</p>
                  </div>
                  <div className="mt-5 overflow-hidden rounded-full" style={{ background: "#e6e1d9" }}>
                    <div
                      className="h-2.5 rounded-full"
                      style={{
                        width:
                          scan.totalCapacityBytes && scan.freeBytes !== null
                            ? `${Math.max(8, ((scan.totalCapacityBytes - scan.freeBytes) / scan.totalCapacityBytes) * 100)}%`
                            : "28%",
                        background: "var(--color-accent)"
                      }}
                    />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <Metric label="Capacity" value={formatBytes(scan.totalCapacityBytes)} />
                    <Metric label="Free" value={formatBytes(scan.freeBytes)} />
                    <Metric label="Reserved" value={formatBytes(scan.reservedIncomingBytes)} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Move reminders" description="Projects already planned for physical moves outside the app.">
          {dashboard.moveReminders.length === 0 ? (
            <EmptyState title="No pending moves" description="Move reminders appear here when a project gets a target drive." />
          ) : (
            <div className="space-y-3">
              {dashboard.moveReminders.map((reminder) => (
                <Link
                  key={reminder.projectId}
                  to={`/projects/${reminder.projectId}`}
                  className="block rounded-[18px] border px-4 py-4 transition"
                  style={{ borderColor: "#ddcfb8", background: "var(--color-warning-soft)" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="font-medium" style={{ color: "var(--color-text)" }}>{reminder.projectName}</p>
                    <StatusBadge label="Move pending" />
                  </div>
                  <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
                    {reminder.currentDriveName} to {reminder.targetDriveName}
                  </p>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-warning)" }}>
                    {formatBytes(reminder.sizeBytes)} planned impact
                  </p>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Recent projects" description="Newest project records with direct links into the detail view.">
          {dashboard.recentProjects.length === 0 ? (
            <EmptyState title="No projects yet" description="Create a manual project or import one from a scan to populate this table." />
          ) : (
            <div className="overflow-hidden rounded-[20px] border" style={{ borderColor: "var(--color-border)" }}>
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead style={{ background: "var(--color-surface-subtle)", color: "var(--color-text-soft)" }}>
                  <tr>
                    <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.16em]">Date</th>
                    <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.16em]">Project</th>
                    <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.16em]">Drive</th>
                    <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.16em]">Size</th>
                  </tr>
                </thead>
                <tbody className="bg-white" style={{ borderColor: "var(--color-border)" }}>
                  {dashboard.recentProjects.map((project) => (
                    <tr key={project.id} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                      <td className="px-4 py-4 font-medium" style={{ color: "var(--color-text-muted)" }}>{project.parsedDate}</td>
                      <td className="px-4 py-4" style={{ color: "var(--color-text)" }}>
                        <Link to={`/projects/${project.id}`} className="font-medium transition hover:opacity-75" style={{ color: "var(--color-text)" }}>
                          {getProjectName(project)}
                        </Link>
                      </td>
                      <td className="px-4 py-4" style={{ color: "var(--color-text-muted)" }}>{getDriveName(drives, project.currentDriveId)}</td>
                      <td className="px-4 py-4 font-medium" style={{ color: "var(--color-text-muted)" }}>{formatBytes(project.sizeBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Status alerts" description="Missing, duplicate, and unassigned project states surfaced from the local repository.">
          {dashboard.statusAlerts.length === 0 ? (
            <EmptyState title="No alerts" description="The catalog currently has no missing, duplicate, or unassigned projects." />
          ) : (
            <div className="space-y-3">
              {dashboard.statusAlerts.map((alert) => (
                <Link
                  key={`${alert.kind}-${alert.projectId}`}
                  to={`/projects/${alert.projectId}`}
                  className="block rounded-[18px] border px-4 py-4 transition"
                  style={{
                    borderColor:
                      alert.kind === "missing"
                        ? "#dcc6c0"
                        : alert.kind === "duplicate"
                          ? "#ddcfb8"
                          : "#c9d5df",
                    background:
                      alert.kind === "missing"
                        ? "var(--color-danger-soft)"
                        : alert.kind === "duplicate"
                          ? "var(--color-warning-soft)"
                          : "var(--color-info-soft)"
                  }}
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge label={alert.kind[0]!.toUpperCase() + alert.kind.slice(1)} />
                  </div>
                  <p className="mt-3 font-medium" style={{ color: "var(--color-text)" }}>{alert.projectName}</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>{alert.detail}</p>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </section>

      <SectionCard title="Quick search targets" description="Direct entry points into the newest projects in the local catalog.">
        <div className="grid gap-3 md:grid-cols-3">
          {dashboard.recentProjects.slice(0, 3).map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="rounded-[20px] border px-4 py-5 transition"
              style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
            >
              <p className="font-medium" style={{ color: "var(--color-text)" }}>{getProjectName(project)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {getProjectStatusBadges(project).map((badge) => (
                  <StatusBadge key={badge} label={badge} />
                ))}
              </div>
            </Link>
          ))}
        </div>
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
