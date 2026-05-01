import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Paper,
  Skeleton,
  Stack,
  Typography
} from "@mui/material";
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
  const { dashboard, drives, scanSessions, isLoading, repository } = useCatalogStore();
  const [pendingRenameCount, setPendingRenameCount] = useState(0);

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

  useEffect(() => {
    let isMounted = true;
    void repository
      .listRenameSuggestions()
      .then((items) => {
        if (isMounted) {
          setPendingRenameCount(items.filter((item) => item.status === "pending").length);
        }
      })
      .catch(() => {
        if (isMounted) setPendingRenameCount(0);
      });
    return () => {
      isMounted = false;
    };
  }, [repository]);

  if (isLoading) {
    return <InboxSkeleton />;
  }

  const isColdStart = drives.length === 0 && dashboard.recentProjects.length === 0;
  if (isColdStart) {
    return (
      <Stack spacing={2.5}>
        <InboxWelcome />
        <TaskPlanPanel
          driveCount={0}
          projectCount={0}
          pendingRenameCount={pendingRenameCount}
          workQueueCount={pendingRenameCount}
          activeScan={activeScan}
          latestTerminalScan={latestTerminalScan}
        />
      </Stack>
    );
  }

  const recentProjects = dashboard.recentProjects.slice(0, 8);
  const workQueueCount =
    pendingRenameCount + dashboard.statusAlerts.length + dashboard.moveReminders.length;
  const focus = getInboxFocus({
    activeScan,
    latestTerminalScan,
    pendingRenameCount,
    workQueueCount,
    moveCount: dashboard.moveReminders.length,
    alertCount: dashboard.statusAlerts.length,
    elapsedSeconds
  });

  return (
    <Stack spacing={3}>
      {/* sr-only h1 so screen readers and tests can identify this page. The
          visible section heading ("Last activity") is a secondary landmark;
          the top-nav breadcrumb names the section for sighted users but is not
          an h1 in the DOM, so we provide one here for WCAG 2.4.6 compliance. */}
      <h1 className="sr-only">Inbox</h1>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack direction={{ xs: "column", md: "row" }} sx={{ alignItems: { xs: "flex-start", md: "center" }, justifyContent: "space-between", gap: 2 }}>
          <Box>
            <Typography variant="overline" color="text.secondary">Inbox</Typography>
            <Typography id="inbox-focus-title" variant="h5" component="h2">
            {focus.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">{focus.subtitle}</Typography>
          </Box>
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
            <Button component={Link} to="/tasks" variant="outlined">
              Task Center
            </Button>
            <Button component={Link} to={focus.primaryTo}>
            {focus.primaryLabel}
            </Button>
            <Button component={Link} to={focus.secondaryTo} variant="outlined">
            {focus.secondaryLabel}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <TaskPlanPanel
        driveCount={drives.length}
        projectCount={dashboard.recentProjects.length}
        pendingRenameCount={pendingRenameCount}
        workQueueCount={workQueueCount}
        activeScan={activeScan}
        latestTerminalScan={latestTerminalScan}
      />

      <InboxSection title="Last activity">
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
      </InboxSection>

      <InboxSection
        title="Needs attention"
        action={
          workQueueCount > 0 ? (
            <Chip size="small" label={workQueueCount} />
          ) : null
        }
      >
        {workQueueCount === 0 ? (
          <QuietEmpty label="Nothing pending" hint="Rename, move, and catalog alerts will appear here." />
        ) : (
          <List aria-label="Needs attention" disablePadding>
            {pendingRenameCount > 0 ? (
              <WorkQueueRow
                to="/rename"
                icon="edit"
                title={`${pendingRenameCount} rename suggestion${pendingRenameCount === 1 ? "" : "s"}`}
                detail="Review and apply physical folder renames."
                meta="Rename"
              />
            ) : null}
            {dashboard.moveReminders.slice(0, 3).map((reminder) => (
              <WorkQueueRow
                key={reminder.projectId}
                to={`/projects/${reminder.projectId}`}
                icon="arrowRight"
                title={reminder.projectName}
                detail={`${reminder.currentDriveName} → ${reminder.targetDriveName}`}
                meta="Move"
              />
            ))}
            {dashboard.statusAlerts.slice(0, 4).map((alert) => (
              <WorkQueueRow
                key={`${alert.kind}-${alert.projectId}`}
                to={`/projects/${alert.projectId}`}
                icon={alert.kind === "missing" ? "warning" : alert.kind === "duplicate" ? "duplicate" : "folder"}
                title={alert.projectName}
                detail={alert.detail}
                meta={alert.kind}
              />
            ))}
          </List>
        )}
      </InboxSection>

      <InboxSection
        title="Recent projects"
        action={
          recentProjects.length > 0 ? (
            <Button component={Link} to="/projects" variant="text" size="small">
              View all
            </Button>
          ) : null
        }
      >
        {recentProjects.length === 0 ? (
          <QuietEmpty
            label="No projects yet"
            hint="Scan a drive and your projects will appear here."
          />
        ) : (
          <List aria-label="Recent projects" disablePadding>
            {recentProjects.map((project) => (
              <ProjectTimelineRow key={project.id} project={project} drives={drives} />
            ))}
          </List>
        )}
      </InboxSection>
    </Stack>
  );
}

interface InboxFocusInput {
  activeScan: ScanSessionSnapshot | null;
  latestTerminalScan: ScanSessionSnapshot | null;
  pendingRenameCount: number;
  workQueueCount: number;
  moveCount: number;
  alertCount: number;
  elapsedSeconds: number;
}

function getInboxFocus({
  activeScan,
  latestTerminalScan,
  pendingRenameCount,
  workQueueCount,
  moveCount,
  alertCount,
  elapsedSeconds
}: InboxFocusInput) {
  if (activeScan) {
    return {
      title: `Scanning ${activeScan.driveName}`,
      subtitle: [
        `${formatCount(activeScan.foldersScanned, "folder", "folders")} scanned`,
        `${formatCount(activeScan.matchesFound, "match", "matches")} found`,
        elapsedSeconds > 0 ? formatElapsedSeconds(elapsedSeconds) : null
      ].filter((part): part is string => Boolean(part)).join(" · "),
      primaryLabel: "View drive",
      primaryTo: activeScan.requestedDriveId ? `/drives/${activeScan.requestedDriveId}` : "/drives",
      secondaryLabel: "All projects",
      secondaryTo: "/projects"
    };
  }

  if (workQueueCount > 0) {
    const detail = [
      pendingRenameCount > 0 ? `${pendingRenameCount} rename${pendingRenameCount === 1 ? "" : "s"}` : null,
      moveCount > 0 ? `${moveCount} move${moveCount === 1 ? "" : "s"}` : null,
      alertCount > 0 ? `${alertCount} alert${alertCount === 1 ? "" : "s"}` : null
    ].filter((part): part is string => Boolean(part)).join(" · ");

    return {
      title: `${workQueueCount} item${workQueueCount === 1 ? "" : "s"} need review`,
      subtitle: detail || "Review the queue before the next import or scan.",
      primaryLabel: pendingRenameCount > 0 ? "Rename Review" : "Review projects",
      primaryTo: pendingRenameCount > 0 ? "/rename" : "/projects",
      secondaryLabel: "Open drives",
      secondaryTo: "/drives"
    };
  }

  if (latestTerminalScan) {
    return {
      title: "Catalog is ready",
      subtitle: `${getScanStatusLabel(latestTerminalScan)} on ${latestTerminalScan.driveName} · ${getTerminalSecondary(latestTerminalScan)}`,
      primaryLabel: "Find projects",
      primaryTo: "/projects",
      secondaryLabel: "Scan drives",
      secondaryTo: "/drives"
    };
  }

  return {
    title: "Ready to catalog your drives",
    subtitle: "Scan a drive to build a searchable project list.",
    primaryLabel: "Scan drives",
    primaryTo: "/drives",
    secondaryLabel: "All projects",
    secondaryTo: "/projects"
  };
}

// ---------------------------------------------------------------------------
// TaskPlanPanel — CCC-inspired operational map.
// ---------------------------------------------------------------------------

function TaskPlanPanel({
  driveCount,
  projectCount,
  pendingRenameCount,
  workQueueCount,
  activeScan,
  latestTerminalScan
}: {
  driveCount: number;
  projectCount: number;
  pendingRenameCount: number;
  workQueueCount: number;
  activeScan: ScanSessionSnapshot | null;
  latestTerminalScan: ScanSessionSnapshot | null;
}) {
  const scanState = activeScan ? "running" : driveCount > 0 ? "complete" : "ready";
  const renameState = pendingRenameCount > 0 ? "attention" : projectCount > 0 ? "complete" : "waiting";
  const compareState = driveCount >= 2 ? "ready" : "waiting";

  return (
    <Paper variant="outlined" component="section" sx={{ overflow: "hidden" }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        sx={{ alignItems: { xs: "flex-start", md: "center" }, justifyContent: "space-between", gap: 2, px: 3, py: 2.25 }}
      >
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0 }}>
            Task plan
          </Typography>
          <Typography variant="h6" component="h2">
            From drive intake to verified mirrors
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Follow the same operating loop every time: scan, normalize, compare.
          </Typography>
        </Box>
        <Chip
          color={activeScan ? "info" : workQueueCount > 0 ? "warning" : driveCount === 0 ? "default" : "success"}
          variant={workQueueCount > 0 || activeScan ? "filled" : "outlined"}
          label={
            activeScan
              ? "Scanning"
              : workQueueCount > 0
                ? `${workQueueCount} needs review`
                : driveCount === 0
                  ? "Start with scan"
                  : "Ready"
          }
        />
      </Stack>

      <Divider />

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(3, 1fr)" } }}>
        <TaskPlanStep
          index="1"
          icon="scan"
          title="Scan connected drives"
          status={scanState}
          statusLabel={activeScan ? "Running" : driveCount > 0 ? `${driveCount} drive${driveCount === 1 ? "" : "s"}` : "Start here"}
          detail={
            activeScan
              ? `${activeScan.driveName} is being indexed now.`
              : latestTerminalScan
                ? `${getScanStatusLabel(latestTerminalScan)} on ${latestTerminalScan.driveName}.`
                : "Import folders from a mounted volume and build the catalog."
          }
          buttonLabel={activeScan ? "View active scan" : "Scan a drive"}
          to="/drives"
        />
        <TaskPlanStep
          index="2"
          icon="edit"
          title="Normalize folder names"
          status={renameState}
          statusLabel={pendingRenameCount > 0 ? `${pendingRenameCount} pending` : projectCount > 0 ? "Clean" : "Waiting"}
          detail={
            pendingRenameCount > 0
              ? "Review physical folder rename suggestions before archiving."
              : "Projects should follow YYYY-MM-DD_Client - Project."
          }
          buttonLabel="Rename Review"
          to="/rename"
          disabled={projectCount === 0 && pendingRenameCount === 0}
        />
        <TaskPlanStep
          index="3"
          icon="duplicate"
          title="Compare mirror drives"
          status={compareState}
          statusLabel={driveCount >= 2 ? "Available" : "Needs 2 drives"}
          detail={
            driveCount >= 2
              ? "Check whether Drive A and Drive B contain the same projects."
              : "Add another drive before running a mirror comparison."
          }
          buttonLabel="Compare Discs"
          to="/compare"
          disabled={driveCount < 2}
        />
      </Box>
    </Paper>
  );
}

function TaskPlanStep({
  index,
  icon,
  title,
  status,
  statusLabel,
  detail,
  buttonLabel,
  to,
  disabled = false
}: {
  index: string;
  icon: IconName;
  title: string;
  status: "ready" | "running" | "complete" | "attention" | "waiting";
  statusLabel: string;
  detail: string;
  buttonLabel: string;
  to: string;
  disabled?: boolean;
}) {
  const statusColor = getTaskPlanStatusColor(status);
  return (
    <Box
      sx={{
        p: 2.5,
        borderRight: { lg: "1px solid rgba(0, 0, 0, 0.08)" },
        borderBottom: { xs: "1px solid rgba(0, 0, 0, 0.08)", lg: 0 },
        "&:last-child": {
          borderRight: 0,
          borderBottom: 0
        }
      }}
    >
      <Stack spacing={2}>
        <Stack direction="row" sx={{ alignItems: "flex-start", gap: 1.5 }}>
          <Avatar sx={{ bgcolor: `${statusColor}.main`, width: 38, height: 38 }}>
            <Icon name={icon} size={19} color="currentColor" />
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Typography variant="caption" color="text.secondary">
                Step {index}
              </Typography>
              <Chip size="small" color={statusColor} variant={status === "attention" || status === "running" ? "filled" : "outlined"} label={statusLabel} />
            </Stack>
            <Typography variant="subtitle1" sx={{ mt: 0.25 }}>
              {title}
            </Typography>
          </Box>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {detail}
        </Typography>
        <Button component={Link} to={to} variant={disabled ? "outlined" : "contained"} disabled={disabled} size="small">
          {buttonLabel}
        </Button>
      </Stack>
    </Box>
  );
}

function getTaskPlanStatusColor(status: "ready" | "running" | "complete" | "attention" | "waiting") {
  if (status === "attention") return "warning" as const;
  if (status === "running") return "info" as const;
  if (status === "complete" || status === "ready") return "success" as const;
  return "default" as const;
}

// ---------------------------------------------------------------------------
// InboxSection — quiet section wrapper.
// ---------------------------------------------------------------------------

function InboxSection({
  title,
  action,
  children
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper variant="outlined" component="section" sx={{ overflow: "hidden" }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2, px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="subtitle1" component="h2">
          {title}
        </Typography>
        {action}
      </Stack>
      <Box>{children}</Box>
    </Paper>
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
    <TimelineButton
      to={target}
      icon={<Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "primary.main" }} />}
      title={`Scanning ${session.driveName}`}
      detail={secondaryParts.join(" · ")}
      meta="Live"
      ariaLive
    />
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
    <TimelineButton
      to={target}
      icon={<Icon name={icon} size={18} color={iconColor} />}
      title={`${getScanStatusLabel(session)} — ${session.driveName}`}
      detail={secondary}
      meta={formatRelativeTime(timestamp)}
    />
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
    <TimelineButton
      to={`/projects/${project.id}`}
      icon={<Icon name="folder" size={18} color={driveColor ?? "currentColor"} />}
      title={getProjectName(project)}
      detail={`${driveLabel}${size ? ` · ${size}` : ""}`}
      meta={formatRelativeTime(timestamp)}
      ariaLabel={`${getProjectName(project)} on ${driveLabel}`}
      accentColor={driveColor ?? undefined}
      warning={project.isUnassigned}
    />
  );
}

function WorkQueueRow({
  to,
  icon,
  title,
  detail,
  meta
}: {
  to: string;
  icon: IconName;
  title: string;
  detail: string;
  meta: string;
}) {
  return (
    <TimelineButton
      to={to}
      icon={<Icon name={icon} size={18} color="currentColor" />}
      title={title}
      detail={detail}
      meta={meta}
    />
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
    <Paper variant="outlined" sx={{ p: 4 }}>
      <Stack direction={{ xs: "column", md: "row" }} sx={{ alignItems: { xs: "flex-start", md: "center" }, justifyContent: "space-between", gap: 3 }}>
        <Stack direction="row" sx={{ alignItems: "flex-start", gap: 2.5, maxWidth: 760 }}>
          <Avatar sx={{ bgcolor: "primary.main", width: 48, height: 48 }}>
            <Icon name="hardDrive" size={24} color="currentColor" />
          </Avatar>
          <Box>
            <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0 }}>
              First run
            </Typography>
            <Typography variant="h4" component="h1" gutterBottom>
              Scan a drive to get started.
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Catalog indexes what's already on your drives, then helps you clean folder
              names and verify mirror copies.
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
          <Button component={Link} to="/tasks" variant="outlined">
            Open Task Center
          </Button>
          <Button component={Link} to="/drives">
            Scan a drive
          </Button>
          <Button component={Link} to="/projects" variant="outlined">
            Add a project manually
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// QuietEmpty — in-section empty, matches the row geometry so the cadence does
// not break. No dashed borders, no illustrations.
// ---------------------------------------------------------------------------

function QuietEmpty({ label, hint }: { label: string; hint: string }) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", gap: 2, px: 2, py: 2.5 }}>
      <Avatar sx={{ bgcolor: "action.hover", color: "text.secondary", width: 36, height: 36 }}>
        <Icon name="dot" size={14} color="currentColor" />
      </Avatar>
      <Box>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="caption" color="text.secondary">{hint}</Typography>
      </Box>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// InboxSkeleton — cadence-matched loading state.
// ---------------------------------------------------------------------------

function InboxSkeleton() {
  return (
    <Stack spacing={3} aria-busy="true" aria-label="Loading Inbox">
      {[0, 1, 2].map((section) => (
        <Paper key={section} variant="outlined" sx={{ p: 2 }}>
          <Skeleton width={140} height={24} />
          {[0, 1, 2].map((row) => (
            <Stack key={row} direction="row" sx={{ alignItems: "center", gap: 2, py: 1.25 }}>
              <Skeleton variant="circular" width={36} height={36} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="45%" />
                <Skeleton width="30%" />
              </Box>
              <Skeleton width={40} />
            </Stack>
          ))}
        </Paper>
      ))}
    </Stack>
  );
}

function TimelineButton({
  to,
  icon,
  title,
  detail,
  meta,
  ariaLabel,
  ariaLive = false,
  accentColor,
  warning = false
}: {
  to: string;
  icon: ReactNode;
  title: string;
  detail: string;
  meta: string;
  ariaLabel?: string;
  ariaLive?: boolean;
  accentColor?: string;
  warning?: boolean;
}) {
  return (
    <ListItemButton component={Link} to={to} aria-label={ariaLabel} role={ariaLive ? "status" : undefined} aria-live={ariaLive ? "polite" : undefined}>
      <ListItemAvatar>
        <Avatar sx={{ bgcolor: accentColor ?? "action.hover", color: warning ? "warning.main" : "text.secondary", width: 36, height: 36 }}>
          {icon}
        </Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={title}
        secondary={detail}
        slotProps={{
          primary: { noWrap: true },
          secondary: { noWrap: true, sx: { color: warning ? "warning.main" : "text.secondary" } }
        }}
      />
      <Chip size="small" variant="outlined" label={meta} sx={{ ml: 2 }} />
    </ListItemButton>
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
