import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import type { ScanSessionSnapshot } from "@drive-project-catalog/domain";
import {
  getActiveScanSession,
  getLatestTerminalScanSession,
  getScanStatusLabel
} from "@drive-project-catalog/data";
import { Icon, type IconName } from "@drive-project-catalog/ui";
import { useCatalogStore } from "../app/providers";
import { formatBytes, formatDate } from "./dashboardHelpers";

type TaskStatus = "running" | "attention" | "ready" | "complete" | "waiting";

interface CatalogTask {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  status: TaskStatus;
  statusLabel: string;
  sourceLabel: string;
  sourceValue: string;
  destinationLabel: string;
  destinationValue: string;
  automationLabel: string;
  automationValue: string;
  primaryLabel: string;
  primaryTo: string;
  secondaryLabel: string;
  secondaryTo: string;
  previewLabel: string;
  previewTo: string;
  latestResult: string;
  progress?: number;
  stats: Array<{ label: string; value: string }>;
  notes: string[];
}

export function TasksPage() {
  const { drives, projects, scanSessions, dashboard, repository, isLoading } = useCatalogStore();
  const [pendingRenameCount, setPendingRenameCount] = useState(0);
  const activeScan = useMemo(() => getActiveScanSession(scanSessions), [scanSessions]);
  const latestTerminalScan = useMemo(
    () => getLatestTerminalScanSession(scanSessions),
    [scanSessions]
  );

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

  const tasks = useMemo(
    () =>
      buildCatalogTasks({
        drives,
        projectsCount: projects.length,
        activeScan,
        latestTerminalScan,
        pendingRenameCount,
        alertsCount: dashboard.statusAlerts.length,
        moveCount: dashboard.moveReminders.length
      }),
    [
      activeScan,
      dashboard.moveReminders.length,
      dashboard.statusAlerts.length,
      drives,
      latestTerminalScan,
      pendingRenameCount,
      projects.length
    ]
  );
  const [selectedTaskId, setSelectedTaskId] = useState(tasks[0]?.id ?? "import");
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0];

  useEffect(() => {
    if (tasks.some((task) => task.id === selectedTaskId)) return;
    setSelectedTaskId(tasks[0]?.id ?? "import");
  }, [selectedTaskId, tasks]);

  if (isLoading) {
    return (
      <Stack spacing={2.5} aria-busy="true" aria-label="Loading tasks">
        <Paper variant="outlined" sx={{ p: 3 }}>
          <LinearProgress />
        </Paper>
      </Stack>
    );
  }

  return (
    <Stack spacing={2.5}>
      <h1 className="sr-only">Tasks</h1>

      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          sx={{ alignItems: { xs: "flex-start", md: "center" }, justifyContent: "space-between", gap: 2, px: 3, py: 2.5 }}
        >
          <Box>
            <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0 }}>
              Task Center
            </Typography>
            <Typography variant="h4" component="h2">
              Catalog operations
            </Typography>
            <Typography variant="body2" color="text.secondary">
              CCC-style tasks for importing drives, cleaning folder names, and checking mirrors.
            </Typography>
          </Box>
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
            <Button component={Link} to="/drives" startIcon={<Icon name="scan" size={16} color="currentColor" />}>
              Scan a drive
            </Button>
            <Button component={Link} to="/compare" variant="outlined">
              Compare Discs
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Box sx={{ display: "grid", gap: 2.5, gridTemplateColumns: { xs: "1fr", lg: "360px minmax(0, 1fr)" } }}>
        <Paper variant="outlined" sx={{ overflow: "hidden" }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
            <Typography variant="subtitle1">Tasks</Typography>
            <Typography variant="caption" color="text.secondary">
              Select an operation to see source, destination, status, and actions.
            </Typography>
          </Box>
          <List disablePadding aria-label="Catalog tasks">
            {tasks.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                selected={task.id === selectedTask.id}
                onClick={() => setSelectedTaskId(task.id)}
              />
            ))}
          </List>
        </Paper>

        <TaskDetail task={selectedTask} />
      </Box>
    </Stack>
  );
}

function TaskListItem({
  task,
  selected,
  onClick
}: {
  task: CatalogTask;
  selected: boolean;
  onClick(): void;
}) {
  return (
    <ListItemButton selected={selected} onClick={onClick} sx={{ alignItems: "flex-start", gap: 1.25, py: 1.5 }}>
      <ListItemIcon sx={{ minWidth: 42, pt: 0.25 }}>
        <Avatar sx={{ width: 34, height: 34, bgcolor: `${getStatusColor(task.status)}.main` }}>
          <Icon name={task.icon} size={17} color="currentColor" />
        </Avatar>
      </ListItemIcon>
      <ListItemText
        primary={
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
              {task.title}
            </Typography>
            <Chip size="small" color={getStatusColor(task.status)} variant={task.status === "attention" || task.status === "running" ? "filled" : "outlined"} label={task.statusLabel} />
          </Stack>
        }
        secondary={
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {task.description}
          </Typography>
        }
      />
    </ListItemButton>
  );
}

function TaskDetail({ task }: { task: CatalogTask }) {
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        sx={{ alignItems: { xs: "flex-start", md: "center" }, justifyContent: "space-between", gap: 2, px: 3, py: 2.5 }}
      >
        <Stack direction="row" sx={{ alignItems: "center", gap: 2 }}>
          <Avatar sx={{ width: 48, height: 48, bgcolor: `${getStatusColor(task.status)}.main` }}>
            <Icon name={task.icon} size={24} color="currentColor" />
          </Avatar>
          <Box>
            <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Typography variant="h5" component="h2">
                {task.title}
              </Typography>
              <Chip color={getStatusColor(task.status)} variant={task.status === "attention" || task.status === "running" ? "filled" : "outlined"} label={task.statusLabel} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {task.description}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
          <Button component={Link} to={task.primaryTo}>
            {task.primaryLabel}
          </Button>
          <Button component={Link} to={task.secondaryTo} variant="outlined">
            {task.secondaryLabel}
          </Button>
        </Stack>
      </Stack>

      {typeof task.progress === "number" ? (
        <LinearProgress variant="determinate" value={task.progress} />
      ) : null}

      <Divider />

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" } }}>
        <TaskEndpoint label={task.sourceLabel} value={task.sourceValue} icon="folderOpen" />
        <TaskEndpoint label={task.destinationLabel} value={task.destinationValue} icon="hardDrive" />
        <TaskEndpoint label={task.automationLabel} value={task.automationValue} icon="clock" />
      </Box>

      <Divider />

      <Box sx={{ display: "grid", gap: 0, gridTemplateColumns: { xs: "1fr", md: "1.2fr 0.8fr" } }}>
        <Box sx={{ p: 3, borderRight: { md: "1px solid rgba(0, 0, 0, 0.08)" } }}>
          <Typography variant="subtitle1" gutterBottom>
            Task plan
          </Typography>
          <Stack spacing={1.25}>
            {task.notes.map((note) => (
              <Stack key={note} direction="row" sx={{ alignItems: "flex-start", gap: 1.25 }}>
                <Box sx={{ color: "success.main", pt: 0.25 }}>
                  <Icon name="check" size={16} color="currentColor" />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {note}
                </Typography>
              </Stack>
            ))}
          </Stack>
          <Stack direction="row" sx={{ gap: 1, mt: 2.5, flexWrap: "wrap" }}>
            <Button component={Link} to={task.previewTo} variant="outlined">
              {task.previewLabel}
            </Button>
            <Button component={Link} to="/tasks" variant="text">
              History coming next
            </Button>
          </Stack>
        </Box>

        <Box sx={{ p: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Latest result
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {task.latestResult}
          </Typography>
          <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            {task.stats.map((stat) => (
              <Box key={stat.label} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {stat.label}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                  {stat.value}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

function TaskEndpoint({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  return (
    <Box
      sx={{
        p: 2.5,
        borderRight: { md: "1px solid rgba(0, 0, 0, 0.08)" },
        borderBottom: { xs: "1px solid rgba(0, 0, 0, 0.08)", md: 0 },
        "&:last-child": { borderRight: 0, borderBottom: 0 }
      }}
    >
      <Stack direction="row" sx={{ alignItems: "flex-start", gap: 1.5 }}>
        <Avatar sx={{ width: 32, height: 32, bgcolor: "action.selected", color: "text.secondary" }}>
          <Icon name={icon} size={16} color="currentColor" />
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            {label}
          </Typography>
          <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
            {value}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
}

function buildCatalogTasks({
  drives,
  projectsCount,
  activeScan,
  latestTerminalScan,
  pendingRenameCount,
  alertsCount,
  moveCount
}: {
  drives: Array<{ id: string; displayName: string; volumeName: string; usedBytes: number | null }>;
  projectsCount: number;
  activeScan: ScanSessionSnapshot | null;
  latestTerminalScan: ScanSessionSnapshot | null;
  pendingRenameCount: number;
  alertsCount: number;
  moveCount: number;
}): CatalogTask[] {
  const totalUsedBytes = drives.reduce((sum, drive) => sum + (drive.usedBytes ?? 0), 0);
  const drivePair = drives.length >= 2 ? `${drives[0].displayName} → ${drives[1].displayName}` : "Choose two drives";
  return [
    {
      id: "import",
      title: "Import drive catalog",
      description: "Scan a mounted drive and turn top-level folders into catalog projects.",
      icon: "scan",
      status: activeScan ? "running" : drives.length > 0 ? "complete" : "ready",
      statusLabel: activeScan ? "Running" : drives.length > 0 ? "Complete" : "Ready",
      sourceLabel: "Source",
      sourceValue: activeScan?.driveName ?? "Mounted volume",
      destinationLabel: "Destination",
      destinationValue: "Catalog database",
      automationLabel: "Automation",
      automationValue: "Manual scan + mounted volume watcher",
      primaryLabel: activeScan ? "View scan" : "Run import",
      primaryTo: "/drives",
      secondaryLabel: "Drive inventory",
      secondaryTo: "/drives",
      previewLabel: "Open import preview",
      previewTo: "/drives",
      latestResult: activeScan
        ? `${activeScan.foldersScanned} folders scanned and ${activeScan.matchesFound} matches found.`
        : latestTerminalScan
          ? `${getScanStatusLabel(latestTerminalScan)} on ${latestTerminalScan.driveName}.`
          : "No import task has run yet.",
      progress: activeScan ? getScanProgress(activeScan) : undefined,
      stats: [
        { label: "Drives", value: String(drives.length) },
        { label: "Projects", value: String(projectsCount) },
        { label: "Data tracked", value: formatBytes(totalUsedBytes) },
        { label: "Last scan", value: latestTerminalScan ? formatDate(latestTerminalScan.finishedAt ?? latestTerminalScan.startedAt) : "Never" }
      ],
      notes: [
        "Pick a mounted volume and enumerate top-level folders before import.",
        "Legacy, invalid, duplicate, or incomplete folder names are routed to Rename Review.",
        "Imported folders become searchable projects tied to their source drive."
      ]
    },
    {
      id: "rename",
      title: "Normalize folder names",
      description: "Preview and apply physical folder renames using the required naming convention.",
      icon: "edit",
      status: pendingRenameCount > 0 ? "attention" : projectsCount > 0 ? "complete" : "waiting",
      statusLabel: pendingRenameCount > 0 ? `${pendingRenameCount} pending` : projectsCount > 0 ? "Clean" : "Waiting",
      sourceLabel: "Source",
      sourceValue: pendingRenameCount > 0 ? "Rename Review queue" : "Catalog projects",
      destinationLabel: "Destination",
      destinationValue: "Physical folders",
      automationLabel: "Convention",
      automationValue: "YYYY-MM-DD_Client - Project",
      primaryLabel: pendingRenameCount > 0 ? "Review renames" : "Open Rename Review",
      primaryTo: "/rename",
      secondaryLabel: "Projects",
      secondaryTo: "/projects",
      previewLabel: "Preview rename plan",
      previewTo: "/rename",
      latestResult: pendingRenameCount > 0
        ? `${pendingRenameCount} folder rename${pendingRenameCount === 1 ? "" : "s"} need review.`
        : "No pending folder renames.",
      stats: [
        { label: "Pending", value: String(pendingRenameCount) },
        { label: "Convention", value: "Required" },
        { label: "Applies to", value: "Folders" },
        { label: "Mode", value: "Preview first" }
      ],
      notes: [
        "Show current folder name and proposed physical folder name before applying.",
        "Keep interactive controls separate from destructive filesystem changes.",
        "Record approved, dismissed, skipped, and failed rename decisions."
      ]
    },
    {
      id: "compare",
      title: "Compare mirror drives",
      description: "Check whether two drives contain the same project set.",
      icon: "duplicate",
      status: drives.length >= 2 ? "ready" : "waiting",
      statusLabel: drives.length >= 2 ? "Ready" : "Needs 2 drives",
      sourceLabel: "Source",
      sourceValue: drives[0]?.displayName ?? "Drive A",
      destinationLabel: "Destination",
      destinationValue: drives[1]?.displayName ?? "Drive B",
      automationLabel: "Mode",
      automationValue: "Ad hoc compare",
      primaryLabel: "Run compare",
      primaryTo: "/compare",
      secondaryLabel: "Open drives",
      secondaryTo: "/drives",
      previewLabel: "Preview compare report",
      previewTo: "/compare",
      latestResult: drives.length >= 2
        ? `Ready to compare ${drivePair}.`
        : "Add or scan a second drive before comparing mirrors.",
      stats: [
        { label: "Available drives", value: String(drives.length) },
        { label: "Pair", value: drivePair },
        { label: "Projects", value: String(projectsCount) },
        { label: "Report", value: "Not saved yet" }
      ],
      notes: [
        "Compare by normalized project identity, not only by raw folder name.",
        "Separate results into matching, missing, and different project rows.",
        "Save compare history in the next phase so reports can be audited later."
      ]
    },
    {
      id: "audit",
      title: "Catalog health audit",
      description: "Review missing projects, duplicate records, and move reminders.",
      icon: "warning",
      status: alertsCount + moveCount > 0 ? "attention" : projectsCount > 0 ? "complete" : "waiting",
      statusLabel: alertsCount + moveCount > 0 ? `${alertsCount + moveCount} open` : projectsCount > 0 ? "Clear" : "Waiting",
      sourceLabel: "Source",
      sourceValue: "Catalog records",
      destinationLabel: "Destination",
      destinationValue: "Attention queue",
      automationLabel: "Trigger",
      automationValue: "After scans and edits",
      primaryLabel: "Review projects",
      primaryTo: "/projects",
      secondaryLabel: "Inbox",
      secondaryTo: "/",
      previewLabel: "Open queue",
      previewTo: "/",
      latestResult: alertsCount + moveCount > 0
        ? `${alertsCount} alert${alertsCount === 1 ? "" : "s"} and ${moveCount} move reminder${moveCount === 1 ? "" : "s"}.`
        : "No catalog health issues are currently open.",
      stats: [
        { label: "Alerts", value: String(alertsCount) },
        { label: "Moves", value: String(moveCount) },
        { label: "Projects", value: String(projectsCount) },
        { label: "History", value: "Next phase" }
      ],
      notes: [
        "Surface the exact project rows that need user attention.",
        "Keep audit issues separate from normal browsing and search.",
        "Turn each scan, rename, and compare result into task history events later."
      ]
    }
  ];
}

function getScanProgress(session: ScanSessionSnapshot) {
  const total = session.foldersScanned + Math.max(0, session.matchesFound);
  if (total <= 0) return 8;
  return Math.min(96, Math.max(8, Math.round((session.matchesFound / total) * 100)));
}

function getStatusColor(status: TaskStatus) {
  if (status === "attention") return "warning" as const;
  if (status === "running") return "info" as const;
  if (status === "complete" || status === "ready") return "success" as const;
  return "default" as const;
}
