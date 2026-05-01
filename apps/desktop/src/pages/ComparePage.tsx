import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItemButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography
} from "@mui/material";
import { getDisplayClient, getDisplayProject, type Drive, type Project } from "@drive-project-catalog/domain";
import { Icon } from "@drive-project-catalog/ui";
import { useCatalogStore } from "../app/providers";
import { formatBytes, formatDate, formatParsedDate, getDriveName } from "./dashboardHelpers";
import { LoadingState } from "./pagePrimitives";
import { getDriveColor } from "./driveColor";

type CompareStatus = "match" | "different" | "onlyA" | "onlyB";

interface CompareRow {
  key: string;
  status: CompareStatus;
  label: string;
  detail: string;
  projectA: Project | null;
  projectB: Project | null;
  reason: string;
}

export function ComparePage() {
  const { projects, drives, isLoading } = useCatalogStore();
  const [driveAId, setDriveAId] = useState(() => drives[0]?.id ?? "");
  const [driveBId, setDriveBId] = useState(() => drives.find((drive) => drive.id !== driveAId)?.id ?? "");
  const [hasRunCompare, setHasRunCompare] = useState(false);
  const [reportGeneratedAt, setReportGeneratedAt] = useState<string | null>(null);

  const comparison = useMemo(
    () => buildDriveComparison(projects, drives, driveAId, driveBId),
    [driveAId, driveBId, drives, projects]
  );

  useEffect(() => {
    if (drives.length < 2) return;
    if (driveAId && drives.some((drive) => drive.id === driveAId)) return;
    setDriveAId(drives[0]?.id ?? "");
  }, [driveAId, drives]);

  useEffect(() => {
    if (drives.length < 2) return;
    if (driveBId && driveBId !== driveAId && drives.some((drive) => drive.id === driveBId)) return;
    setDriveBId(drives.find((drive) => drive.id !== driveAId)?.id ?? "");
  }, [driveAId, driveBId, drives]);

  useEffect(() => {
    setHasRunCompare(false);
    setReportGeneratedAt(null);
  }, [driveAId, driveBId]);

  if (isLoading) return <LoadingState label="Loading compare view" />;

  if (drives.length < 2) {
    return (
      <Paper variant="outlined" sx={{ p: 4, maxWidth: 680 }}>
        <Stack spacing={2.5}>
          <Avatar sx={{ bgcolor: "primary.main", width: 44, height: 44 }}>
            <Icon name="duplicate" size={22} color="currentColor" />
          </Avatar>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              Two drives needed.
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Compare checks whether a mirror drive has the same projects as the source.
              Add or scan at least two drives before running a comparison.
            </Typography>
          </Box>
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
            <Button component={Link} to="/drives">
              Add drives
            </Button>
            <Button component={Link} to="/tasks" variant="outlined">
              Open Task Center
            </Button>
            <Button component={Link} to="/projects" variant="outlined">
              View projects
            </Button>
          </Stack>
        </Stack>
      </Paper>
    );
  }

  const driveA = drives.find((drive) => drive.id === driveAId) ?? null;
  const driveB = drives.find((drive) => drive.id === driveBId) ?? null;
  const reportSummary = summarizeComparison(comparison);

  function runCompare() {
    setHasRunCompare(true);
    setReportGeneratedAt(new Date().toISOString());
  }

  return (
    <Stack spacing={2.5}>
      <h1 className="sr-only">Compare Discs</h1>

      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          sx={{ alignItems: { xs: "flex-start", md: "center" }, justifyContent: "space-between", gap: 2, px: 3, py: 2.5 }}
        >
          <Box>
            <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0 }}>
              Compare task
            </Typography>
            <Typography variant="h4" component="h2">
              Mirror compare
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Select a source drive and mirror drive, then run a dry compare report.
            </Typography>
          </Box>
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
            <Button
              onClick={runCompare}
              startIcon={<Icon name="scan" size={16} color="currentColor" />}
              disabled={!driveA || !driveB || driveA.id === driveB.id}
            >
              Run Compare
            </Button>
            <Button component={Link} to="/tasks" variant="outlined">
              Task Center
            </Button>
          </Stack>
        </Stack>

        <Divider />

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 56px 1fr 0.9fr" } }}>
          <DriveEndpointCard
            title="Source"
            subtitle="Drive A"
            drive={driveA}
            select={<DriveSelect label="Source drive" value={driveAId} drives={drives} onChange={setDriveAId} />}
          />
          <Box
            sx={{
              display: { xs: "none", lg: "flex" },
              alignItems: "center",
              justifyContent: "center",
              borderRight: "1px solid rgba(0, 0, 0, 0.08)",
              color: "text.disabled"
            }}
          >
              <Icon name="arrowRight" size={18} color="currentColor" />
          </Box>
          <DriveEndpointCard
            title="Destination"
            subtitle="Drive B"
            drive={driveB}
            select={
              <DriveSelect
                label="Mirror drive"
                value={driveBId}
                drives={drives.filter((drive) => drive.id !== driveAId)}
                onChange={setDriveBId}
              />
            }
          />
          <CompareSettingsCard hasRunCompare={hasRunCompare} reportGeneratedAt={reportGeneratedAt} />
        </Box>

        <Divider />

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" } }}>
          <SummaryCell label="Matching" value={comparison.matches.length} tone="ok" />
          <SummaryCell label={`Only on ${driveA?.displayName ?? "A"}`} value={comparison.onlyA.length} tone="warn" />
          <SummaryCell label={`Only on ${driveB?.displayName ?? "B"}`} value={comparison.onlyB.length} tone="warn" />
          <SummaryCell label="Different" value={comparison.different.length} tone="danger" />
        </Box>

        <Divider />

        <Box sx={{ px: 2.5, py: 2 }}>
          <Stack direction={{ xs: "column", md: "row" }} sx={{ gap: 1.5, alignItems: { md: "center" }, justifyContent: "space-between" }}>
            <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
              {driveA ? <DrivePill drive={driveA} /> : null}
              {driveB ? <DrivePill drive={driveB} /> : null}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {hasRunCompare && reportGeneratedAt ? `Report generated ${formatDate(reportGeneratedAt)}` : "Run Compare to generate an audit report."}
            </Typography>
          </Stack>
        </Box>
      </Paper>

      {hasRunCompare ? (
        <>
          <CompareReportSummary summary={reportSummary} driveA={driveA} driveB={driveB} />
          <CompareSection title="Different" rows={comparison.different} emptyLabel="No differences found." />
          <CompareSection title={`Missing from ${driveB?.displayName ?? "Drive B"}`} rows={comparison.onlyA} emptyLabel="Nothing missing from Drive B." />
          <CompareSection title={`Missing from ${driveA?.displayName ?? "Drive A"}`} rows={comparison.onlyB} emptyLabel="Nothing missing from Drive A." />
          <CompareSection title="Matching" rows={comparison.matches} emptyLabel="No matching projects yet." collapsed />
        </>
      ) : (
        <ComparePreflight comparison={comparison} driveA={driveA} driveB={driveB} onRun={runCompare} />
      )}
    </Stack>
  );
}

function DriveEndpointCard({
  title,
  subtitle,
  drive,
  select
}: {
  title: string;
  subtitle: string;
  drive: Drive | null;
  select: ReactNode;
}) {
  return (
    <Box sx={{ p: 2.5, borderRight: { lg: "1px solid rgba(0, 0, 0, 0.08)" } }}>
      <Stack spacing={2}>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1.5 }}>
          <Avatar sx={{ bgcolor: drive ? `${getDriveColor(drive.id)} !important` : "action.selected", width: 42, height: 42 }}>
            <Icon name="hardDrive" size={21} color="currentColor" />
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0 }}>
              {subtitle}
            </Typography>
            <Typography variant="h6" component="h3" noWrap>
              {title}
            </Typography>
          </Box>
        </Stack>
        {select}
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 }}>
          <MiniMetric label="Used" value={drive ? formatBytes(drive.usedBytes) : "—"} />
          <MiniMetric label="Volume" value={drive?.volumeName ?? "—"} />
        </Box>
      </Stack>
    </Box>
  );
}

function CompareSettingsCard({
  hasRunCompare,
  reportGeneratedAt
}: {
  hasRunCompare: boolean;
  reportGeneratedAt: string | null;
}) {
  return (
    <Box sx={{ p: 2.5 }}>
      <Stack spacing={1.5}>
        <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0 }}>
          Task settings
        </Typography>
        <TaskSetting icon="search" label="Compare mode" value="Project identity + size/name" />
        <TaskSetting icon="eye" label="Write mode" value="Dry run only" />
        <TaskSetting icon="clock" label="Last report" value={hasRunCompare && reportGeneratedAt ? formatDate(reportGeneratedAt) : "Not run"} />
      </Stack>
    </Box>
  );
}

function TaskSetting({ icon, label, value }: { icon: "search" | "eye" | "clock"; label: string; value: string }) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", gap: 1.25 }}>
      <Avatar sx={{ width: 30, height: 30, bgcolor: "action.selected", color: "text.secondary" }}>
        <Icon name={icon} size={15} color="currentColor" />
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {label}
        </Typography>
        <Typography variant="body2" noWrap>
          {value}
        </Typography>
      </Box>
    </Stack>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, px: 1.25, py: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
        {value}
      </Typography>
    </Box>
  );
}

function DriveSelect({
  label,
  value,
  drives,
  onChange
}: {
  label: string;
  value: string;
  drives: Drive[];
  onChange(value: string): void;
}) {
  return (
    <FormControl size="small" sx={{ minWidth: 260, flex: 1 }}>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {drives.map((drive) => (
          <MenuItem key={drive.id} value={drive.id}>
            {drive.displayName}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function SummaryCell({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "ok" | "warn" | "danger";
}) {
  const color = tone === "ok" ? "success.main" : tone === "warn" ? "warning.main" : "error.main";
  return (
    <Box sx={{ p: 2.25, borderRight: { md: 1 }, borderBottom: { xs: 1, md: 0 }, borderColor: "divider" }}>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="h4" color={color} sx={{ mt: 0.5, fontWeight: 500, lineHeight: 1 }}>
        {value}
      </Typography>
    </Box>
  );
}

function DrivePill({ drive }: { drive: Drive }) {
  return (
    <Chip
      variant="outlined"
      label={`${drive.displayName} · ${formatBytes(drive.usedBytes)}`}
      avatar={<Avatar sx={{ bgcolor: `${getDriveColor(drive.id)} !important` }} />}
    />
  );
}

function ComparePreflight({
  comparison,
  driveA,
  driveB,
  onRun
}: {
  comparison: ReturnType<typeof buildDriveComparison>;
  driveA: Drive | null;
  driveB: Drive | null;
  onRun(): void;
}) {
  const summary = summarizeComparison(comparison);
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        sx={{ alignItems: { xs: "flex-start", md: "center" }, justifyContent: "space-between", gap: 2, px: 3, py: 2.5 }}
      >
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0 }}>
            Preflight
          </Typography>
          <Typography variant="h5" component="h2">
            Ready to compare
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This dry run will not change either drive. It will generate a report from the current catalog state.
          </Typography>
        </Box>
        <Button onClick={onRun} startIcon={<Icon name="scan" size={16} color="currentColor" />} disabled={!driveA || !driveB}>
          Run Compare
        </Button>
      </Stack>
      <Divider />
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" } }}>
        <SummaryCell label="Projects evaluated" value={summary.total} tone="ok" />
        <SummaryCell label="Potential issues" value={summary.issues} tone={summary.issues > 0 ? "warn" : "ok"} />
        <SummaryCell label="Missing" value={summary.missing} tone={summary.missing > 0 ? "warn" : "ok"} />
        <SummaryCell label="Different" value={summary.different} tone={summary.different > 0 ? "danger" : "ok"} />
      </Box>
      <Alert severity="info" sx={{ borderRadius: 0 }}>
        Compare reports are based on imported catalog records. Run a fresh drive scan first if a mirror was recently changed in Finder.
      </Alert>
    </Paper>
  );
}

function CompareReportSummary({
  summary,
  driveA,
  driveB
}: {
  summary: ReturnType<typeof summarizeComparison>;
  driveA: Drive | null;
  driveB: Drive | null;
}) {
  const severity = summary.issues > 0 ? "warning" : "success";
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <Alert severity={severity} sx={{ borderRadius: 0 }}>
        {summary.issues > 0
          ? `${summary.issues} issue${summary.issues === 1 ? "" : "s"} found between ${driveA?.displayName ?? "Drive A"} and ${driveB?.displayName ?? "Drive B"}.`
          : `${driveA?.displayName ?? "Drive A"} and ${driveB?.displayName ?? "Drive B"} match for the projects currently in the catalog.`}
      </Alert>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" } }}>
        <SummaryCell label="Evaluated" value={summary.total} tone="ok" />
        <SummaryCell label="Matching" value={summary.matches} tone="ok" />
        <SummaryCell label="Missing" value={summary.missing} tone={summary.missing > 0 ? "warn" : "ok"} />
        <SummaryCell label="Different" value={summary.different} tone={summary.different > 0 ? "danger" : "ok"} />
      </Box>
    </Paper>
  );
}

function CompareSection({
  title,
  rows,
  emptyLabel,
  collapsed
}: {
  title: string;
  rows: CompareRow[];
  emptyLabel: string;
  collapsed?: boolean;
}) {
  const visibleRows = collapsed ? rows.slice(0, 20) : rows;
  return (
    <Paper component="section" variant="outlined">
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", px: 2.5, py: 1.75 }}>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        <Chip size="small" variant="outlined" label={rows.length} />
      </Stack>
      <Divider />
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2.5, py: 2.5 }}>
          {emptyLabel}
        </Typography>
      ) : (
        <List disablePadding role="list">
          {visibleRows.map((row) => (
            <CompareProjectRow key={`${row.status}-${row.key}`} row={row} />
          ))}
          {visibleRows.length < rows.length ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", borderTop: 1, borderColor: "divider", px: 2.5, py: 1.5 }}>
              Showing first {visibleRows.length} of {rows.length}.
            </Typography>
          ) : null}
        </List>
      )}
    </Paper>
  );
}

function CompareProjectRow({ row }: { row: CompareRow }) {
  const target = row.projectA ?? row.projectB;
  return (
    <ListItemButton
      component={Link}
      to={target ? `/projects/${target.id}` : "/projects"}
      role="listitem"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1fr) minmax(150px, 220px) minmax(150px, 220px) 130px" },
        gap: 1.5,
        px: 2.5,
        py: 1.5,
        borderBottom: 1,
        borderColor: "divider",
        "&:last-child": {
          borderBottom: 0
        }
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
          {row.label}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {row.detail}
        </Typography>
      </Box>
      <ProjectSide project={row.projectA} side="A" />
      <ProjectSide project={row.projectB} side="B" />
      <Box sx={{ display: "flex", justifyContent: { xs: "flex-start", md: "flex-end" } }}>
        <StatusChip status={row.status} label={row.reason} />
      </Box>
    </ListItemButton>
  );
}

function ProjectSide({ project, side }: { project: Project | null; side: "A" | "B" }) {
  if (!project) {
    return (
      <Typography variant="body2" color="text.disabled">
        Missing on {side}
      </Typography>
    );
  }
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary" noWrap>
        {project.folderName}
      </Typography>
      <Typography variant="caption" color="text.disabled" noWrap sx={{ display: "block" }}>
        {formatBytes(project.sizeBytes)}
      </Typography>
    </Box>
  );
}

function StatusChip({ status, label }: { status: CompareStatus; label: string }) {
  const color = status === "match" ? "success" : status === "different" ? "error" : "warning";
  return (
    <Chip
      size="small"
      variant={status === "match" ? "outlined" : "filled"}
      color={color}
      label={label}
      sx={{ minWidth: 82 }}
    />
  );
}

function summarizeComparison(comparison: ReturnType<typeof buildDriveComparison>) {
  const missing = comparison.onlyA.length + comparison.onlyB.length;
  const different = comparison.different.length;
  const matches = comparison.matches.length;
  return {
    total: matches + missing + different,
    matches,
    missing,
    different,
    issues: missing + different
  };
}

function buildDriveComparison(projects: Project[], drives: Drive[], driveAId: string, driveBId: string) {
  const driveAProjects = projects.filter((project) => project.currentDriveId === driveAId);
  const driveBProjects = projects.filter((project) => project.currentDriveId === driveBId);
  const mapA = groupByCompareKey(driveAProjects);
  const mapB = groupByCompareKey(driveBProjects);
  const keys = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
  );

  const rows: CompareRow[] = [];
  for (const key of keys) {
    const projectA = mapA.get(key)?.[0] ?? null;
    const projectB = mapB.get(key)?.[0] ?? null;
    const project = projectA ?? projectB;
    if (!project) continue;

    const label = getCompareLabel(project);
    const detail = getCompareDetail(project, drives);
    if (!projectA) {
      rows.push({ key, status: "onlyB", label, detail, projectA, projectB, reason: "Missing A" });
      continue;
    }
    if (!projectB) {
      rows.push({ key, status: "onlyA", label, detail, projectA, projectB, reason: "Missing B" });
      continue;
    }
    const sizeDiff =
      projectA.sizeBytes !== null && projectB.sizeBytes !== null && projectA.sizeBytes !== projectB.sizeBytes;
    const nameDiff = projectA.folderName !== projectB.folderName;
    if (sizeDiff || nameDiff) {
      rows.push({
        key,
        status: "different",
        label,
        detail,
        projectA,
        projectB,
        reason: sizeDiff ? "Size diff" : "Name diff"
      });
      continue;
    }
    rows.push({ key, status: "match", label, detail, projectA, projectB, reason: "Match" });
  }

  return {
    matches: rows.filter((row) => row.status === "match"),
    different: rows.filter((row) => row.status === "different"),
    onlyA: rows.filter((row) => row.status === "onlyA"),
    onlyB: rows.filter((row) => row.status === "onlyB")
  };
}

function groupByCompareKey(projects: Project[]) {
  const map = new Map<string, Project[]>();
  for (const project of projects) {
    const key = getCompareKey(project);
    const bucket = map.get(key) ?? [];
    bucket.push(project);
    map.set(key, bucket);
  }
  return map;
}

function getCompareKey(project: Project) {
  if (project.normalizedName) return normalizeCompareText(project.normalizedName);
  const date = project.correctedDate ?? project.parsedDate ?? "";
  const client = project.correctedClient ?? project.parsedClient ?? "";
  const name = project.correctedProject ?? project.parsedProject ?? "";
  if (date || client || name) {
    return normalizeCompareText(`${date}_${client}_${name}`);
  }
  return normalizeCompareText(project.folderName);
}

function getCompareLabel(project: Project) {
  const client = getDisplayClient(project);
  const name = getDisplayProject(project);
  return client && client !== "—" ? `${client} · ${name}` : name;
}

function getCompareDetail(project: Project, drives: Drive[]) {
  return `${formatParsedDate(project.correctedDate ?? project.parsedDate)} · ${getDriveName(drives, project.currentDriveId)}`;
}

function normalizeCompareText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
