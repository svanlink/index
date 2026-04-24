import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Drive, Project, ScanSessionSnapshot } from "@drive-project-catalog/domain";
import {
  getActiveScanSession,
  getLatestTerminalScanSession,
  getScanStatusLabel
} from "@drive-project-catalog/data";
import { Icon, type IconName } from "@drive-project-catalog/ui";
import { useCatalogStore } from "../app/providers";
import { formatBytes, getProjectName } from "./dashboardHelpers";
import { formatElapsedSeconds } from "./scanPageHelpers";
import { getDriveColor } from "./driveColor";

// ---------------------------------------------------------------------------
// Inbox — DESIGN.md §7
//
// The Inbox is NOT a dashboard. It answers exactly two questions the user has
// every time they open the app:
//
//   1. What just happened?  → LastActivityRow — the most recent scan.
//   2. Where are my things? → ActivityTimelineRow list — recent projects,
//                             each row surfacing the drive it lives on.
//
// No KPI grid, no status alerts, no attention tiles, no drive capacity aside.
// Those belong on Projects and Drives. Inbox is the landing page; it stays
// quiet so "just opened the app" never feels like "please triage a backlog".
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const { dashboard, drives, scanSessions, isLoading } = useCatalogStore();

  const activeScan = useMemo(() => getActiveScanSession(scanSessions), [scanSessions]);
  const latestTerminalScan = useMemo(
    () => getLatestTerminalScanSession(scanSessions),
    [scanSessions]
  );

  // Live elapsed-time counter for the active scan — ticks every second without
  // re-rendering the rest of the page.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!activeScan) {
      setElapsedSeconds(0);
      return;
    }
    const startMs = new Date(activeScan.startedAt).getTime();
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    const id = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [activeScan?.scanId, activeScan?.startedAt]);

  if (isLoading) {
    return <InboxSkeleton />;
  }

  const isColdStart = drives.length === 0 && dashboard.recentProjects.length === 0;
  if (isColdStart) {
    return <InboxWelcome />;
  }

  const recentProjects = dashboard.recentProjects.slice(0, 8);

  return (
    <div className="space-y-10 pt-1">
      <Section title="Last activity">
        {activeScan ? (
          <ActiveScanRow
            session={activeScan}
            elapsedSeconds={elapsedSeconds}
          />
        ) : latestTerminalScan ? (
          <TerminalScanRow session={latestTerminalScan} />
        ) : (
          <QuietEmpty
            label="No scans yet"
            hint="Run a scan from Drives and the most recent activity will appear here."
          />
        )}
      </Section>

      <Section
        title="Recent projects"
        action={
          recentProjects.length > 0 ? (
            <Link to="/projects" className="btn btn-ghost btn-sm">
              View all
            </Link>
          ) : null
        }
      >
        {recentProjects.length === 0 ? (
          <QuietEmpty
            label="No projects yet"
            hint="Scan a drive and your projects will appear here."
          />
        ) : (
          <ol className="flex flex-col" aria-label="Recent projects">
            {recentProjects.map((project) => (
              <ProjectTimelineRow key={project.id} project={project} drives={drives} />
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section — label + optional trailing action + content
//
// `h-section` is the 14/500 product sub-heading from globals.css. No uppercase
// tracking, no decorative kicker.
// ---------------------------------------------------------------------------

function Section({
  title,
  action,
  children
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="h-section" style={{ margin: 0 }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// ActiveScanRow — live scan, pulsing dot, live elapsed counter.
//
// Uses the same ActivityTimelineRow geometry as a project row so the Inbox
// reads as a single vertical cadence — there is only one row shape on this
// page, just two different fills for the icon square.
// ---------------------------------------------------------------------------

function ActiveScanRow({
  session,
  elapsedSeconds
}: {
  session: ScanSessionSnapshot;
  elapsedSeconds: number;
}) {
  const target = session.requestedDriveId ? `/drives/${session.requestedDriveId}` : "/drives";

  const secondaryParts = [
    `${formatCount(session.foldersScanned, "folder", "folders")} scanned`,
    `${formatCount(session.matchesFound, "match", "matches")} found`,
    elapsedSeconds > 0 ? formatElapsedSeconds(elapsedSeconds) : null
  ].filter((part): part is string => Boolean(part));

  return (
    <Link to={target} className="activity-row group" role="status" aria-live="polite">
      <span className="activity-row__tile" aria-hidden="true">
        <span className="pulse-dot" />
      </span>
      <span className="activity-row__body">
        <span className="activity-row__primary">
          Scanning {session.driveName}
        </span>
        <span className="activity-row__secondary">{secondaryParts.join(" · ")}</span>
      </span>
      <span className="activity-row__meta tnum">Live</span>
      <Icon name="chevron" size={12} color="var(--ink-4)" className="activity-row__chevron" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// TerminalScanRow — most recent completed / failed / cancelled / interrupted.
// ---------------------------------------------------------------------------

function TerminalScanRow({ session }: { session: ScanSessionSnapshot }) {
  const target = session.requestedDriveId ? `/drives/${session.requestedDriveId}` : "/drives";
  const { icon, iconColor } = getScanVisual(session.status);
  const secondary = getTerminalSecondary(session);
  const timestamp = session.finishedAt ?? session.startedAt;

  return (
    <Link to={target} className="activity-row group">
      <span className="activity-row__tile" aria-hidden="true">
        <Icon name={icon} size={15} color={iconColor} />
      </span>
      <span className="activity-row__body">
        <span className="activity-row__primary">
          {getScanStatusLabel(session)} — {session.driveName}
        </span>
        <span className="activity-row__secondary">{secondary}</span>
      </span>
      <span className="activity-row__meta tnum">{formatRelativeTime(timestamp)}</span>
      <Icon name="chevron" size={12} color="var(--ink-4)" className="activity-row__chevron" />
    </Link>
  );
}

function getScanVisual(status: ScanSessionSnapshot["status"]): {
  icon: IconName;
  iconColor: string;
} {
  if (status === "completed") {
    return { icon: "check", iconColor: "var(--ink-2)" };
  }
  if (status === "failed" || status === "interrupted") {
    return { icon: "warning", iconColor: "var(--danger)" };
  }
  return { icon: "clock", iconColor: "var(--warn)" };
}

function getTerminalSecondary(session: ScanSessionSnapshot): string {
  if (session.status === "completed" && session.summary) {
    const { newProjectsCount, updatedProjectsCount, missingProjectsCount } = session.summary;
    return [
      `${newProjectsCount} new`,
      `${updatedProjectsCount} updated`,
      `${missingProjectsCount} missing`
    ].join(" · ");
  }
  if (session.error) {
    return session.error;
  }
  return `${formatCount(session.foldersScanned, "folder", "folders")} · ${formatCount(
    session.matchesFound,
    "match",
    "matches"
  )}`;
}

// ---------------------------------------------------------------------------
// ProjectTimelineRow — ActivityTimelineRow bound to a Project.
//
// Answers "Where is project X?" at a glance: the drive color fills the icon
// square and the drive name is the first secondary value, so the eye lands on
// drive identity immediately.
// ---------------------------------------------------------------------------

function ProjectTimelineRow({ project, drives }: { project: Project; drives: Drive[] }) {
  const drive = drives.find((candidate) => candidate.id === project.currentDriveId) ?? null;
  const driveColor = drive ? getDriveColor(drive.id) : null;
  const driveLabel = drive
    ? drive.displayName || drive.volumeName
    : project.isUnassigned
      ? "Unassigned"
      : "Unknown drive";

  const timestamp = project.lastSeenAt ?? project.lastScannedAt ?? project.updatedAt;
  const size = project.sizeBytes !== null ? formatBytes(project.sizeBytes) : null;

  return (
    <li>
      <Link
        to={`/projects/${project.id}`}
        className="activity-row group"
        aria-label={`${getProjectName(project)} on ${driveLabel}`}
      >
        <span className="activity-row__tile" aria-hidden="true">
          <Icon name="folder" size={15} color={driveColor ?? "var(--ink-3)"} />
        </span>
        <span className="activity-row__body">
          <span className="activity-row__primary">{getProjectName(project)}</span>
          <span className="activity-row__secondary">
            {driveColor ? (
              <span
                className="drive-dot"
                style={
                  {
                    "--drive-color": driveColor,
                    width: 6,
                    height: 6,
                    marginRight: 6,
                    verticalAlign: "middle"
                  } as CSSProperties
                }
                aria-hidden="true"
              />
            ) : null}
            <span style={{ color: project.isUnassigned ? "var(--warn)" : "inherit" }}>
              {driveLabel}
            </span>
            {size ? <span style={{ color: "var(--ink-4)" }}>{" · "}{size}</span> : null}
          </span>
        </span>
        <span className="activity-row__meta tnum">{formatRelativeTime(timestamp)}</span>
        <Icon name="chevron" size={12} color="var(--ink-4)" className="activity-row__chevron" />
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------
// InboxWelcome — cold start. Only when nothing has ever been scanned.
//
// One primary CTA. No hero panel, no marketing imagery, no feature grid. The
// user should feel "scan a drive, see your things" and nothing else.
// ---------------------------------------------------------------------------

function InboxWelcome() {
  return (
    <div className="flex min-h-[50vh] items-center pt-2">
      <div className="max-w-[520px]">
        <span
          className="mb-5 inline-flex h-9 w-9 items-center justify-center rounded-[10px]"
          style={{ background: "var(--surface-container-low)" }}
          aria-hidden="true"
        >
          <Icon name="hardDrive" size={18} color="var(--ink-2)" />
        </span>
        <h1
          className="text-[28px] font-semibold leading-tight"
          style={{ color: "var(--ink)", letterSpacing: "-0.01em", margin: 0 }}
        >
          Scan a drive to get started.
        </h1>
        <p
          className="mt-3 text-[17px] leading-[1.47]"
          style={{ color: "var(--ink-2)", margin: 0 }}
        >
          Project Catalog indexes what's already on your drives so you can find any project by
          name, no matter where it lives.
        </p>
        <div className="mt-6 flex items-center gap-2">
          <Link to="/drives" className="btn btn-primary">
            Scan a drive
          </Link>
          <Link to="/projects" className="btn">
            Add a project manually
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuietEmpty — in-section empty, matches the row geometry so the cadence does
// not break. No dashed borders, no illustrations.
// ---------------------------------------------------------------------------

function QuietEmpty({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="activity-row activity-row--static">
      <span
        className="activity-row__tile"
        aria-hidden="true"
        style={{ background: "var(--surface-container-low)" }}
      >
        <Icon name="dot" size={12} color="var(--ink-4)" />
      </span>
      <span className="activity-row__body">
        <span className="activity-row__primary" style={{ color: "var(--ink-2)" }}>
          {label}
        </span>
        <span className="activity-row__secondary">{hint}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InboxSkeleton — cadence-matched loading state.
// ---------------------------------------------------------------------------

function InboxSkeleton() {
  return (
    <div className="space-y-10 pt-1" aria-busy="true" aria-label="Loading Inbox">
      <section>
        <div className="skeleton mb-3 h-4 w-24 rounded" />
        <div className="activity-row activity-row--static">
          <span className="activity-row__tile skeleton" />
          <span className="activity-row__body">
            <span className="skeleton h-[17px] w-48 rounded" />
            <span className="skeleton mt-1.5 h-[14px] w-64 rounded" />
          </span>
          <span className="skeleton h-[12px] w-10 rounded" />
        </div>
      </section>
      <section>
        <div className="skeleton mb-3 h-4 w-32 rounded" />
        <ol className="flex flex-col">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i}>
              <div className="activity-row activity-row--static">
                <span className="activity-row__tile skeleton" />
                <span className="activity-row__body">
                  <span className="skeleton h-[17px] w-56 rounded" />
                  <span className="skeleton mt-1.5 h-[14px] w-40 rounded" />
                </span>
                <span className="skeleton h-[12px] w-8 rounded" />
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffSeconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
