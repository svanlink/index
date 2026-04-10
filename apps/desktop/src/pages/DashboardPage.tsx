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
import { CapacityBar, EmptyState, LoadingState, MetricCard, SectionCard, StatusBadge } from "./pagePrimitives";

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
      {/* Stats strip */}
      <div className="flex items-center gap-8 border-b pb-4" style={{ borderColor: "var(--color-border)" }}>
        <MetricCard label="Recent scans" value={String(dashboard.recentScans.length)} />
        <MetricCard label="Recent projects" value={String(dashboard.recentProjects.length)} />
        <MetricCard label="Move reminders" value={String(dashboard.moveReminders.length)} />
        <MetricCard label="Status alerts" value={String(dashboard.statusAlerts.length)} />
      </div>

      {activeScan ? (
        <SectionCard title="Active scan">
          <div className="flex items-center gap-6 text-[13px]">
            <span style={{ color: "var(--color-text-muted)" }}>
              <span className="font-medium" style={{ color: "var(--color-text)" }}>{activeScan.driveName}</span>
            </span>
            <span style={{ color: "var(--color-text-muted)" }}>{activeScan.foldersScanned} folders</span>
            <span style={{ color: "var(--color-text-muted)" }}>{activeScan.matchesFound} matches</span>
            <StatusBadge label={activeScan.status} />
          </div>
        </SectionCard>
      ) : null}

      {latestCompletedScan?.summary ? (
        <SectionCard
          title="Latest scan summary"
          action={<Link to={`/scans/${latestCompletedScan.scanId}`} className="button-secondary">Open session</Link>}
        >
          <div className="flex items-center gap-6">
            <MetricCard label="New" value={String(latestCompletedScan.summary.newProjectsCount)} />
            <MetricCard label="Updated" value={String(latestCompletedScan.summary.updatedProjectsCount)} />
            <MetricCard label="Missing" value={String(latestCompletedScan.summary.missingProjectsCount)} />
            <MetricCard label="Duplicates" value={String(latestCompletedScan.summary.duplicatesFlaggedCount)} />
            <MetricCard
              label="Duration"
              value={latestCompletedScan.summary.durationMs ? `${Math.round(latestCompletedScan.summary.durationMs / 1000)}s` : "N/A"}
            />
          </div>
        </SectionCard>
      ) : null}

      {latestTerminalScan && latestTerminalScan.status !== "completed" && latestTerminalScan.status !== "running" ? (
        <SectionCard title="Latest scan outcome">
          <div className="flex items-center gap-4 text-[13px]">
            <StatusBadge label={getScanStatusLabel(latestTerminalScan)} />
            <span style={{ color: "var(--color-text-muted)" }}>{getScanStatusMessage(latestTerminalScan)}</span>
          </div>
        </SectionCard>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Recent scans">
          {dashboard.recentScans.length === 0 ? (
            <EmptyState title="No scans yet" description="Recent scan cards will appear here after the first drive scans are recorded." />
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {dashboard.recentScans.map((scan) => (
                <Link
                  key={scan.id}
                  to={scan.driveId ? `/scans?drive=${scan.driveId}` : "/scans"}
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
  );
}
