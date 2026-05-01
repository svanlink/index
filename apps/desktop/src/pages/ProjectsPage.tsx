import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  AlertTitle,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import { Icon } from "@drive-project-catalog/ui";
import { useShortcut } from "../app/useShortcut";
import { filterProjectCatalog, UNASSIGNED_DRIVE_FILTER_VALUE } from "@drive-project-catalog/data";
import {
  categoryValues,
  folderTypeValues,
  getDisplayClient,
  getDisplayProject,
  type Category,
  type Drive,
  type FolderType,
  type Project
} from "@drive-project-catalog/domain";
import { buildBatchActionPreview, validateManualProjectForm } from "../app/catalogValidation";
import {
  copyTextToClipboard,
  openPathInFinder,
  showNativeContextMenu,
  showPathInFinder
} from "../app/nativeContextMenu";
import { useCatalogStore } from "../app/providers";
import {
  formatBytes,
  formatParsedDate,
  getDriveName,
  getProjectStatusBadges
} from "./dashboardHelpers";
import { getDriveColor } from "./driveColor";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FOLDER_TYPE_LABELS: Record<FolderType, string> = {
  client: "Client",
  personal_project: "Personal project",
  personal_folder: "Personal folder"
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectFormState {
  parsedDate: string;
  parsedClient: string;
  parsedProject: string;
  category: Category | "";
  sizeGigabytes: string;
  currentDriveId: string;
}

interface BatchState {
  assignDriveId: string;
  category: Category | "";
  targetDriveId: string;
}

type ProjectSortKey = "date-desc" | "date-asc" | "name-asc" | "name-desc" | "drive-asc" | "updated-desc";

const initialProjectForm: ProjectFormState = {
  parsedDate: "", parsedClient: "", parsedProject: "",
  category: "", sizeGigabytes: "", currentDriveId: ""
};
const initialBatchState: BatchState = { assignDriveId: "", category: "", targetDriveId: "" };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProjectsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    projects, drives, isLoading, isMutating,
    createProject, assignProjectsToDrive, setProjectsCategory, planProjectsMove, deleteProjects
  } = useCatalogStore();

  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(initialProjectForm);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchState, setBatchState] = useState<BatchState>(initialBatchState);
  const [feedback, setFeedback] = useState<{ tone: "success" | "warning" | "error" | "info"; title: string; messages: string[] } | null>(null);
  const [batchPreview, setBatchPreview] = useState<ReturnType<typeof buildBatchActionPreview> | null>(null);

  // Cmd+N — toggle create form (disabled while a mutation is in flight)
  useShortcut({ key: "n", meta: true, onTrigger: () => setIsCreateOpen((c) => !c), enabled: !isMutating });

  // Read filter params
  const categoryFilter = (searchParams.get("category") as Category | null) ?? "";
  const folderTypeFilter = (searchParams.get("folderType") as FolderType | null) ?? "";
  const driveFilter = searchParams.get("drive") ?? "";
  const targetDriveFilter = searchParams.get("targetDrive") ?? "";
  const showUnassigned = searchParams.get("unassigned") === "1";
  const showMissing = searchParams.get("missing") === "1";
  const showDuplicate = searchParams.get("duplicate") === "1";
  const showMovePending = searchParams.get("movePending") === "1";
  const sortParam = searchParams.get("sort");
  const sortKey: ProjectSortKey =
    sortParam === "date-asc" ||
    sortParam === "name-asc" ||
    sortParam === "name-desc" ||
    sortParam === "drive-asc" ||
    sortParam === "updated-desc"
      ? sortParam
      : "date-desc";
  const hasActiveFilters = !!(categoryFilter || folderTypeFilter || driveFilter || targetDriveFilter || showUnassigned || showMissing || showDuplicate || showMovePending);

  const statusCounts = useMemo(
    () => ({
      all: projects.length,
      unassigned: projects.filter((project) => project.currentDriveId == null).length,
      missing: projects.filter((project) => project.missingStatus === "missing").length,
      duplicate: projects.filter((project) => project.duplicateStatus === "duplicate").length,
      movePending: projects.filter((project) => project.moveStatus === "pending").length
    }),
    [projects]
  );

  const activeStatusTab =
    showUnassigned && !showMissing && !showDuplicate && !showMovePending
      ? "unassigned"
      : showMissing && !showUnassigned && !showDuplicate && !showMovePending
        ? "missing"
        : showDuplicate && !showUnassigned && !showMissing && !showMovePending
          ? "duplicate"
          : showMovePending && !showUnassigned && !showMissing && !showDuplicate
            ? "movePending"
            : "all";

  const statusTabs = [
    { id: "all", label: "All", count: statusCounts.all },
    { id: "unassigned", label: "Unassigned", count: statusCounts.unassigned },
    { id: "missing", label: "Missing", count: statusCounts.missing },
    { id: "duplicate", label: "Duplicates", count: statusCounts.duplicate },
    { id: "movePending", label: "Moves", count: statusCounts.movePending }
  ].filter((tab) => tab.id === "all" || tab.count > 0);

  const filteredProjects = useMemo(
    () => filterProjectCatalog(projects, drives, {
      search, category: categoryFilter || "", folderType: folderTypeFilter || "",
      currentDriveId: driveFilter || undefined, targetDriveId: targetDriveFilter || undefined,
      showUnassigned, showMissing, showDuplicate, showMovePending
    }),
    [categoryFilter, folderTypeFilter, driveFilter, drives, projects, search, showDuplicate, showMissing, showMovePending, showUnassigned, targetDriveFilter]
  );

  const visibleProjects = useMemo(
    () => sortProjects(filteredProjects, drives, sortKey),
    [drives, filteredProjects, sortKey]
  );

  const selectedProjects = useMemo(
    () => projects.filter((p) => selectedIds.includes(p.id)),
    [projects, selectedIds]
  );

  const manualProjectValidation = useMemo(
    () => validateManualProjectForm(projectForm),
    [projectForm]
  );

  const allVisibleSelected =
    visibleProjects.length > 0 && visibleProjects.every((p) => selectedIds.includes(p.id));

  // Auto-dismiss feedback
  useEffect(() => {
    if (!feedback) return;
    const id = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(id);
  }, [feedback]);

  useEffect(() => { setBatchPreview(null); }, [batchState, selectedIds]);

  useEffect(() => {
    const nextSearch = searchParams.get("q") ?? "";
    setSearch((current) => (current === nextSearch ? current : nextSearch));
  }, [searchParams]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateManualProjectForm(projectForm);
    if (validation.errors.length > 0) {
      setFeedback({ tone: "error", title: "Project creation blocked", messages: validation.errors });
      return;
    }
    try {
      const created = await createProject({
        parsedDate: projectForm.parsedDate.trim(),
        parsedClient: projectForm.parsedClient.trim(),
        parsedProject: projectForm.parsedProject.trim(),
        category: projectForm.category as Category,
        sizeBytes: projectForm.sizeGigabytes ? Math.round(Number(projectForm.sizeGigabytes) * 1_000_000_000) : null,
        currentDriveId: projectForm.currentDriveId || null
      });
      setProjectForm(initialProjectForm);
      setIsCreateOpen(false);
      navigate(`/projects/${created.id}`);
    } catch (error) {
      setFeedback({ tone: "error", title: "Project creation failed", messages: [error instanceof Error ? error.message : "Could not create the project."] });
    }
  }

  const openBatchPreview = useCallback((kind: Parameters<typeof buildBatchActionPreview>[0]["kind"]) => {
    const preview = buildBatchActionPreview({
      kind, selectedProjects, drives,
      assignDriveId: batchState.assignDriveId || null,
      category: batchState.category,
      targetDriveId: batchState.targetDriveId || null
    });
    if (preview.errors.length > 0) {
      setFeedback({ tone: "error", title: preview.title, messages: preview.errors });
      setBatchPreview(null);
      return;
    }
    setBatchPreview(preview);
  }, [batchState.assignDriveId, batchState.category, batchState.targetDriveId, drives, selectedProjects]);

  const confirmBatchPreview = useCallback(async () => {
    if (!batchPreview) return;
    try {
      if (batchPreview.kind === "assign-drive") {
        await assignProjectsToDrive(selectedIds, batchState.assignDriveId || null);
      } else if (batchPreview.kind === "set-category") {
        await setProjectsCategory(selectedIds, batchState.category as Category);
      } else if (batchPreview.kind === "delete") {
        await deleteProjects(selectedIds);
      } else {
        await planProjectsMove(selectedIds, batchState.targetDriveId);
      }
      setFeedback({
        tone: batchPreview.warnings.length > 0 ? "warning" : "success",
        title: batchPreview.kind === "assign-drive" ? "Drive assignment applied"
          : batchPreview.kind === "set-category" ? "Category update applied"
          : batchPreview.kind === "delete" ? "Projects deleted"
          : "Move plan applied",
        messages: batchPreview.warnings.length > 0
          ? [...batchPreview.confirmations, ...batchPreview.warnings]
          : batchPreview.confirmations
      });
      setSelectedIds([]);
      setBatchPreview(null);
    } catch (error) {
      setFeedback({ tone: "error", title: "Batch action failed", messages: [error instanceof Error ? error.message : "The batch action could not be completed."] });
    }
  }, [assignProjectsToDrive, batchPreview, batchState.assignDriveId, batchState.category, batchState.targetDriveId, deleteProjects, planProjectsMove, selectedIds, setProjectsCategory]);

  function updateQueryParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next);
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds((current) => current.filter((id) => !visibleProjects.some((p) => p.id === id)));
    } else {
      setSelectedIds((current) => {
        const next = new Set(current);
        visibleProjects.forEach((p) => next.add(p.id));
        return [...next];
      });
    }
  }

  function clearAllFilters() {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    setSearchParams(next);
  }

  function selectStatusTab(tabId: string) {
    const next = new URLSearchParams(searchParams);
    next.delete("unassigned");
    next.delete("missing");
    next.delete("duplicate");
    next.delete("movePending");

    if (tabId === "unassigned") next.set("unassigned", "1");
    if (tabId === "missing") next.set("missing", "1");
    if (tabId === "duplicate") next.set("duplicate", "1");
    if (tabId === "movePending") next.set("movePending", "1");

    setSearchParams(next);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const showChrome = projects.length > 0 && !isLoading;

  // Cold-start welcome — flat layout, no decorative panel. Per DESIGN.md §7
  // ("hairlines not shadows") and matching InboxWelcome / DrivesPage cold-
  // start. One icon tile, headline, description, two actions. Create-form
  // still reachable via Cmd+N or the secondary button.
  if (!isLoading && projects.length === 0 && !isCreateOpen) {
    return (
      <Paper variant="outlined" sx={{ p: 4, maxWidth: 620 }}>
        <Stack spacing={2.5}>
          <Avatar sx={{ bgcolor: "primary.main", width: 44, height: 44 }}>
            <Icon name="folder" size={22} color="currentColor" />
          </Avatar>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              No projects yet.
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Scan a connected drive to index its folders, or create a manual project
              to start building the catalog.
            </Typography>
          </Box>
          <Stack direction="row" sx={{ gap: 1 }}>
            <Button component={Link} to="/drives" startIcon={<Icon name="scan" size={16} />}>
              Scan a drive
            </Button>
            <Button variant="outlined" onClick={() => setIsCreateOpen(true)}>
              New project
            </Button>
          </Stack>
        </Stack>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* sr-only h1 for WCAG 2.4.6 and test identification. The top-nav
          breadcrumb names this section for sighted users; the h1 exists for
          screen readers and automated tests only. */}
      <h1 className="sr-only">Projects</h1>

      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>
        <Stack direction="row" sx={{ alignItems: "baseline", gap: 1.5 }}>
          <Typography variant="h5" component="h2">
            Project list
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {hasActiveFilters || search.trim()
              ? `${visibleProjects.length} of ${projects.length}`
              : `${projects.length}`}{" "}
            {projects.length === 1 ? "project" : "projects"}
          </Typography>
        </Stack>
        <Stack direction="row" sx={{ gap: 1 }}>
          <Button component={Link} to="/drives" variant="outlined" startIcon={<Icon name="scan" size={16} />}>
            Scan drive
          </Button>
          <Button startIcon={<Icon name="plus" size={16} />} onClick={() => setIsCreateOpen((c) => !c)}>
            {isCreateOpen ? "Discard" : "New project"}
          </Button>
        </Stack>
      </Stack>

      {feedback ? (
        <FeedbackAlert tone={feedback.tone} title={feedback.title} messages={feedback.messages} />
      ) : null}

      {isCreateOpen ? (
        <CreateProjectForm
          form={projectForm}
          drives={drives}
          validation={manualProjectValidation}
          isMutating={isMutating}
          onChange={setProjectForm}
          onSubmit={handleCreateProject}
          onCancel={() => setIsCreateOpen(false)}
        />
      ) : null}

      {showChrome ? (
        <Paper variant="outlined" sx={{ overflow: "hidden" }}>
          {statusTabs.length > 1 ? (
            <Tabs value={activeStatusTab} onChange={(_, value: string) => selectStatusTab(value)} variant="scrollable">
              {statusTabs.map((tab) => (
                <Tab key={tab.id} value={tab.id} label={`${tab.label} ${tab.count}`} />
              ))}
            </Tabs>
          ) : null}

          <Stack
            direction="row"
            sx={{ alignItems: "center", gap: 1.5, flexWrap: "wrap", p: 2, borderTop: statusTabs.length > 1 ? 1 : 0, borderColor: "divider" }}
          >
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id="project-type-filter-label">Type</InputLabel>
              <Select
                labelId="project-type-filter-label"
                label="Type"
                value={folderTypeFilter}
                onChange={(event) => updateQueryParam("folderType", event.target.value)}
              >
                <MenuItem value="">All types</MenuItem>
                {folderTypeValues.map((type) => (
                  <MenuItem key={type} value={type}>{FOLDER_TYPE_LABELS[type]}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="project-category-filter-label">Category</InputLabel>
              <Select
                labelId="project-category-filter-label"
                label="Category"
                value={categoryFilter}
                onChange={(event) => updateQueryParam("category", event.target.value)}
              >
                <MenuItem value="">All categories</MenuItem>
                {categoryValues.map((category) => (
                  <MenuItem key={category} value={category}>{category}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel id="project-drive-filter-label">Drive</InputLabel>
              <Select
                labelId="project-drive-filter-label"
                label="Drive"
                value={driveFilter}
                onChange={(event) => updateQueryParam("drive", event.target.value)}
              >
                <MenuItem value="">All drives</MenuItem>
                <MenuItem value={UNASSIGNED_DRIVE_FILTER_VALUE}>Unassigned</MenuItem>
                {drives.map((drive) => (
                  <MenuItem key={drive.id} value={drive.id}>{drive.displayName}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {hasActiveFilters ? (
              <Button variant="text" onClick={clearAllFilters}>
                Clear filters
              </Button>
            ) : null}

            <Box sx={{ flex: 1 }} />

            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel id="project-sort-label">Sort</InputLabel>
              <Select
                labelId="project-sort-label"
                label="Sort"
                value={sortKey}
                onChange={(event) => updateQueryParam("sort", event.target.value)}
              >
                <MenuItem value="date-desc">Date newest</MenuItem>
                <MenuItem value="date-asc">Date oldest</MenuItem>
                <MenuItem value="name-asc">Name A-Z</MenuItem>
                <MenuItem value="name-desc">Name Z-A</MenuItem>
                <MenuItem value="drive-asc">Drive A-Z</MenuItem>
                <MenuItem value="updated-desc">Recently updated</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </Paper>
      ) : null}

      {/* ── Batch action bar ── */}
      {selectedIds.length > 0 ? (
        <BatchActionBar
          selectedCount={selectedIds.length}
          drives={drives}
          state={batchState}
          preview={batchPreview}
          isMutating={isMutating}
          onChange={setBatchState}
          onPreview={openBatchPreview}
          onConfirm={() => void confirmBatchPreview()}
          onCancelPreview={() => setBatchPreview(null)}
          onClearSelection={() => setSelectedIds([])}
        />
      ) : null}

      {/* ── Project list ── */}
      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        {isLoading ? (
          <Box aria-busy="true" aria-label="Loading projects">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Stack key={index} direction="row" sx={{ alignItems: "center", gap: 2, px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
                <Skeleton variant="rounded" width={18} height={18} />
                <Skeleton variant="circular" width={32} height={32} />
                <Skeleton width="24%" />
                <Skeleton width="18%" />
                <Skeleton width="28%" />
                <Skeleton width="8%" />
              </Stack>
            ))}
          </Box>
        ) : visibleProjects.length === 0 ? (
          <Stack sx={{ alignItems: "center", gap: 1, px: 4, py: 8, textAlign: "center" }}>
            <Typography variant="subtitle1">No results</Typography>
            <Typography variant="body2" color="text.secondary">
              Try a broader search or clear the current filters.
            </Typography>
            <Button variant="text" onClick={clearAllFilters}>
              Clear filters
            </Button>
          </Stack>
        ) : (
          <>
            <TableContainer sx={{ maxHeight: "calc(100vh - 260px)" }}>
              <Table stickyHeader size="small" aria-label="Projects list">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        slotProps={{ input: { "aria-label": "Select all visible projects" } }}
                      />
                    </TableCell>
                    <TableCell>Project</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Stored in</TableCell>
                    <TableCell align="right">Size</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleProjects.map((project) => (
                    <ProjectTableRow
                      key={project.id}
                      project={project}
                      drives={drives}
                      isSelected={selectedIds.includes(project.id)}
                      onToggleSelected={toggleSelection}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Paper>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Project row
// ---------------------------------------------------------------------------

function ProjectTableRow({
  project,
  drives,
  isSelected,
  onToggleSelected
}: {
  project: Project;
  drives: Drive[];
  isSelected: boolean;
  onToggleSelected(id: string): void;
}) {
  const navigate = useNavigate();
  const displayName = getDisplayProject(project);
  const displayDate = formatParsedDate(project.correctedDate ?? project.parsedDate);
  const driveName = getDriveName(drives, project.currentDriveId);
  const driveColor = getDriveColor(project.currentDriveId);
  const statusBadges = getProjectStatusBadges(project).filter((badge) => badge !== "Normal");
  const openProjectPath = `/projects/${project.id}`;
  const title = getProjectDisplayTitle(project);
  const created = formatProjectDateTime(project.createdAt);
  const folderPath = project.folderPath ?? "No folder path";

  return (
    <TableRow
      hover
      selected={isSelected}
      sx={{ cursor: "default" }}
      onDoubleClick={() => navigate(openProjectPath)}
      onContextMenu={(event) => {
        void showNativeContextMenu(event, [
          { text: "Open Project", action: () => navigate(openProjectPath) },
          {
            text: "Show in Finder",
            enabled: Boolean(project.folderPath),
            action: () => void showPathInFinder(project.folderPath)
          },
          {
            text: "Open Folder",
            enabled: Boolean(project.folderPath),
            action: () => void openPathInFinder(project.folderPath)
          },
          { separator: true },
          { text: "Copy Project Name", action: () => void copyTextToClipboard(displayName) },
          {
            text: "Copy Folder Path",
            enabled: Boolean(project.folderPath),
            action: () => void copyTextToClipboard(project.folderPath ?? "")
          },
          { separator: true },
          {
            text: isSelected ? "Deselect Project" : "Select Project",
            action: () => onToggleSelected(project.id)
          }
        ]);
      }}
    >
      <TableCell padding="checkbox">
        <Checkbox
          checked={isSelected}
          onChange={() => onToggleSelected(project.id)}
          slotProps={{ input: { "aria-label": `Select ${project.folderName}` } }}
        />
      </TableCell>

      <TableCell sx={{ minWidth: 280, maxWidth: 420 }}>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1.5, minWidth: 0 }}>
          <Avatar sx={{ width: 32, height: 32, bgcolor: "primary.main", fontSize: 14 }}>
            {(title || "?")[0]?.toUpperCase() ?? "?"}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component={Link}
              to={openProjectPath}
              variant="body2"
              noWrap
              sx={{ display: "block", color: "text.primary", fontWeight: 500 }}
            >
              {title}
            </Typography>
          </Box>
        </Stack>
      </TableCell>

      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <Typography variant="body2">{displayDate}</Typography>
        <Typography variant="caption" color="text.secondary">
          project date
        </Typography>
      </TableCell>

      <TableCell sx={{ minWidth: 260, maxWidth: 360 }}>
        <Stack direction="row" sx={{ alignItems: "flex-start", gap: 1, minWidth: 0 }}>
          <Box
            sx={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              bgcolor: project.currentDriveId ? driveColor : "warning.main",
              mt: 0.7,
              flexShrink: 0
            }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap>
              {project.currentDriveId ? driveName : "Unassigned"}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
              {folderPath}
            </Typography>
          </Box>
        </Stack>
      </TableCell>

      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
        {formatBytes(project.sizeBytes)}
      </TableCell>

      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <Typography variant="body2">{created.date}</Typography>
        <Typography variant="caption" color="text.secondary">
          {created.time}
        </Typography>
      </TableCell>

      <TableCell sx={{ minWidth: 160 }}>
        <Stack direction="row" sx={{ gap: 0.5, flexWrap: "wrap" }}>
          {statusBadges.length > 0 ? (
            statusBadges.map((badge) => (
              <Chip key={badge} label={badge} size="small" variant="outlined" />
            ))
          ) : (
            <Chip label="Normal" size="small" color="success" variant="outlined" />
          )}
        </Stack>
      </TableCell>

      <TableCell align="right">
        <IconButton component={Link} to={openProjectPath} size="small" aria-label={`Open ${project.folderName}`}>
          <Icon name="chevron" size={16} />
        </IconButton>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function sortProjects(projects: Project[], drives: Drive[], sortKey: ProjectSortKey): Project[] {
  const sorted = [...projects];
  sorted.sort((left, right) => {
    const byName = compareText(getProjectSortName(left), getProjectSortName(right));
    if (sortKey === "name-asc") return byName || compareText(left.id, right.id);
    if (sortKey === "name-desc") return -byName || compareText(left.id, right.id);

    if (sortKey === "drive-asc") {
      return (
        compareText(getDriveName(drives, left.currentDriveId), getDriveName(drives, right.currentDriveId)) ||
        byName ||
        compareText(left.id, right.id)
      );
    }

    if (sortKey === "updated-desc") {
      return compareText(right.updatedAt, left.updatedAt) || byName || compareText(left.id, right.id);
    }

    const leftDate = getProjectSortDate(left);
    const rightDate = getProjectSortDate(right);
    const byDate =
      sortKey === "date-asc"
        ? compareText(leftDate, rightDate)
        : compareText(rightDate, leftDate);
    return byDate || byName || compareText(left.id, right.id);
  });
  return sorted;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function getProjectSortName(project: Project): string {
  return getProjectDisplayTitle(project);
}

function getProjectDisplayTitle(project: Project): string {
  if (project.folderType === "personal_folder") return project.folderName;

  const client = getDisplayClient(project);
  const name = getDisplayProject(project);
  if (client === "—") return name;
  if (name.toLocaleLowerCase().startsWith(client.toLocaleLowerCase())) return name;
  return `${client} ${name}`;
}

function getProjectSortDate(project: Project): string {
  const date = project.correctedDate ?? project.parsedDate ?? "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  if (/^\d{6}$/.test(date)) return `20${date.slice(0, 2)}-${date.slice(2, 4)}-${date.slice(4, 6)}`;
  return "";
}

function formatProjectDateTime(iso: string | null | undefined) {
  if (!iso) return { date: "—", time: "" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "" };
  return {
    date: date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
    time: date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  };
}

// ---------------------------------------------------------------------------
// Batch action bar
// ---------------------------------------------------------------------------

function BatchActionBar({
  selectedCount,
  drives,
  state,
  preview,
  isMutating,
  onChange,
  onPreview,
  onConfirm,
  onCancelPreview,
  onClearSelection
}: {
  selectedCount: number;
  drives: Drive[];
  state: BatchState;
  preview: ReturnType<typeof buildBatchActionPreview> | null;
  isMutating: boolean;
  onChange(s: BatchState): void;
  onPreview(kind: Parameters<typeof buildBatchActionPreview>[0]["kind"]): void;
  onConfirm(): void;
  onCancelPreview(): void;
  onClearSelection(): void;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      {preview ? (
        <Stack spacing={2}>
          <FeedbackAlert tone="info" title={preview.title} messages={[preview.summary, ...preview.confirmations]} />
          {preview.warnings.length > 0 ? (
            <FeedbackAlert tone="warning" title="Review warnings" messages={preview.warnings} />
          ) : null}
          <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
            <Button disabled={isMutating} onClick={onConfirm}>
              {isMutating ? "Applying…" : "Confirm action"}
            </Button>
            <Button variant="outlined" onClick={onCancelPreview}>
              Back
            </Button>
          </Stack>
        </Stack>
      ) : (
        <Stack direction="row" sx={{ alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <Chip color="primary" label={`${selectedCount} selected`} />
          <Button variant="text" onClick={onClearSelection}>
            Clear
          </Button>

          <Divider orientation="vertical" flexItem />

          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel id="batch-assign-drive-label">Assign drive</InputLabel>
            <Select
              labelId="batch-assign-drive-label"
              label="Assign drive"
              value={state.assignDriveId}
              onChange={(event) => onChange({ ...state, assignDriveId: event.target.value })}
            >
              <MenuItem value="">Unassigned</MenuItem>
              {drives.map((drive) => (
                <MenuItem key={drive.id} value={drive.id}>{drive.displayName}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="outlined" disabled={isMutating} onClick={() => onPreview("assign-drive")}>
            Review
          </Button>

          <Divider orientation="vertical" flexItem />

          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel id="batch-category-label">Category</InputLabel>
            <Select
              labelId="batch-category-label"
              label="Category"
              value={state.category}
              onChange={(event) => onChange({ ...state, category: event.target.value as Category | "" })}
            >
              <MenuItem value="">Choose category</MenuItem>
              {categoryValues.map((category) => (
                <MenuItem key={category} value={category}>{category}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="outlined" disabled={isMutating} onClick={() => onPreview("set-category")}>
            Review
          </Button>

          <Divider orientation="vertical" flexItem />

          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel id="batch-target-drive-label">Target drive</InputLabel>
            <Select
              labelId="batch-target-drive-label"
              label="Target drive"
              value={state.targetDriveId}
              onChange={(event) => onChange({ ...state, targetDriveId: event.target.value })}
            >
              <MenuItem value="">Target drive</MenuItem>
              {drives.map((drive) => (
                <MenuItem key={drive.id} value={drive.id}>{drive.displayName}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="outlined" disabled={isMutating} onClick={() => onPreview("plan-move")}>
            Review
          </Button>

          <Divider orientation="vertical" flexItem />

          <Button color="error" variant="outlined" disabled={isMutating} onClick={() => onPreview("delete")} startIcon={<Icon name="trash" size={16} />}>
            Delete
          </Button>
        </Stack>
      )}
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// Create project form
// ---------------------------------------------------------------------------

function CreateProjectForm({
  form,
  drives,
  validation,
  isMutating,
  onChange,
  onSubmit,
  onCancel
}: {
  form: ProjectFormState;
  drives: Drive[];
  validation: ReturnType<typeof validateManualProjectForm>;
  isMutating: boolean;
  onChange(next: ProjectFormState): void;
  onSubmit(e: FormEvent<HTMLFormElement>): void;
  onCancel(): void;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6">New manual project</Typography>
          <Typography variant="body2" color="text.secondary">
            Manual projects join the catalog immediately and can be assigned to a drive later.
          </Typography>
        </Box>

      {validation.errors.length > 0 ? (
        <FeedbackAlert tone="error" title="Creation requirements" messages={validation.errors} />
      ) : null}
      {validation.warnings.length > 0 ? (
        <FeedbackAlert tone="info" title="Note" messages={validation.warnings} />
      ) : null}

        <Box component="form" onSubmit={onSubmit}>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)", xl: "repeat(3, 1fr)" } }}>
            <TextField
              required
              label="Date (YYYY-MM-DD)"
              value={form.parsedDate}
              onChange={(event) => onChange({ ...form, parsedDate: event.target.value })}
              placeholder="2024-03-12"
              slotProps={{ htmlInput: { maxLength: 10 } }}
            />
            <TextField
              required
              label="Client"
              value={form.parsedClient}
              onChange={(event) => onChange({ ...form, parsedClient: event.target.value })}
              placeholder="Apple"
            />
            <TextField
              required
              label="Project"
              value={form.parsedProject}
              onChange={(event) => onChange({ ...form, parsedProject: event.target.value })}
              placeholder="ProductShoot"
            />
            <FormControl>
              <InputLabel id="new-project-category-label">Category</InputLabel>
              <Select
                labelId="new-project-category-label"
                label="Category"
                value={form.category}
                onChange={(event) => onChange({ ...form, category: event.target.value as Category | "" })}
              >
                <MenuItem value="">Choose category</MenuItem>
                {categoryValues.map((category) => (
                  <MenuItem key={category} value={category}>{category}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Size (GB)"
              type="number"
              value={form.sizeGigabytes}
              onChange={(event) => onChange({ ...form, sizeGigabytes: event.target.value })}
              placeholder="120"
              slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
            />
            <FormControl>
              <InputLabel id="new-project-drive-label">Drive</InputLabel>
              <Select
                labelId="new-project-drive-label"
                label="Drive"
                value={form.currentDriveId}
                onChange={(event) => onChange({ ...form, currentDriveId: event.target.value })}
              >
                <MenuItem value="">Unassigned</MenuItem>
                {drives.map((drive) => (
                  <MenuItem key={drive.id} value={drive.id}>{drive.displayName}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <Stack direction="row" sx={{ justifyContent: "flex-end", gap: 1, mt: 2.5 }}>
            <Button type="button" variant="outlined" onClick={onCancel}>
              Discard
            </Button>
            <Button type="submit" disabled={isMutating}>
              {isMutating ? "Saving…" : "Create project"}
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
}

function FeedbackAlert({
  tone,
  title,
  messages
}: {
  tone: "success" | "warning" | "error" | "info";
  title: string;
  messages: string[];
}) {
  return (
    <Alert severity={tone}>
      <AlertTitle>{title}</AlertTitle>
      {messages.length === 1 ? (
        <Typography variant="body2">{messages[0]}</Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, pl: 2 }}>
          {messages.map((message) => (
            <li key={message}>
              <Typography variant="body2" component="span">{message}</Typography>
            </li>
          ))}
        </Box>
      )}
    </Alert>
  );
}
