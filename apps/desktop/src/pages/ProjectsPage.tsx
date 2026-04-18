import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "@drive-project-catalog/ui";
import { useShortcut } from "../app/useShortcut";
import { buildProjectSearchSuggestions, filterProjectCatalog, UNASSIGNED_DRIVE_FILTER_VALUE } from "@drive-project-catalog/data";
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
import { useCatalogStore } from "../app/providers";
import {
  formatBytes,
  formatParsedDate,
  getDriveName,
  getProjectStatusBadges
} from "./dashboardHelpers";
import { EmptyState, FeedbackNotice, ProjectRowSkeleton, SearchField, SectionCard, StatusBadge } from "./pagePrimitives";
import { getDriveColor } from "./driveColor";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_FILTERS = [
  { label: "Unassigned", key: "showUnassigned", param: "unassigned" },
  { label: "Missing", key: "showMissing", param: "missing" },
  { label: "Duplicates", key: "showDuplicate", param: "duplicate" },
  { label: "Move pending", key: "showMovePending", param: "movePending" }
] as const;

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
  const hasActiveFilters = !!(categoryFilter || folderTypeFilter || driveFilter || targetDriveFilter || showUnassigned || showMissing || showDuplicate || showMovePending);

  const filteredProjects = useMemo(
    () => filterProjectCatalog(projects, drives, {
      search, category: categoryFilter || "", folderType: folderTypeFilter || "",
      currentDriveId: driveFilter || undefined, targetDriveId: targetDriveFilter || undefined,
      showUnassigned, showMissing, showDuplicate, showMovePending
    }),
    [categoryFilter, folderTypeFilter, driveFilter, drives, projects, search, showDuplicate, showMissing, showMovePending, showUnassigned, targetDriveFilter]
  );

  const selectedProjects = useMemo(
    () => projects.filter((p) => selectedIds.includes(p.id)),
    [projects, selectedIds]
  );

  const manualProjectValidation = useMemo(
    () => validateManualProjectForm(projectForm),
    [projectForm]
  );

  const searchSuggestions = useMemo(
    () => buildProjectSearchSuggestions(projects, drives, search, {
      category: categoryFilter || "", currentDriveId: driveFilter || undefined,
      targetDriveId: targetDriveFilter || undefined,
      showUnassigned, showMissing, showDuplicate, showMovePending
    }),
    [categoryFilter, driveFilter, drives, projects, search, showDuplicate, showMissing, showMovePending, showUnassigned, targetDriveFilter]
  );

  const allVisibleSelected =
    filteredProjects.length > 0 && filteredProjects.every((p) => selectedIds.includes(p.id));

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

  function toggleStatusFilter(param: string) {
    const next = new URLSearchParams(searchParams);
    if (next.get(param) === "1") next.delete(param);
    else next.set(param, "1");
    setSearchParams(next);
  }

  function updateQueryParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next);
  }

  function updateSearchValue(value: string) {
    setSearch(value);
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set("q", value); else next.delete("q");
    setSearchParams(next, { replace: true });
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds((current) => current.filter((id) => !filteredProjects.some((p) => p.id === id)));
    } else {
      setSelectedIds((current) => {
        const next = new Set(current);
        filteredProjects.forEach((p) => next.add(p.id));
        return [...next];
      });
    }
  }

  function clearAllFilters() {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    setSearchParams(next);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Catalog</div>
          <h1 className="h-title mt-1">Projects</h1>
          {!isLoading ? (
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              {projects.length} {projects.length === 1 ? "project" : "projects"} across {drives.length} {drives.length === 1 ? "drive" : "drives"}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setIsCreateOpen((c) => !c)}
        >
          <Icon name="plus" size={12} />
          {isCreateOpen ? "Discard" : "New project"}
        </button>
      </div>

      {feedback ? (
        <FeedbackNotice tone={feedback.tone} title={feedback.title} messages={feedback.messages} />
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

      {/* ── Toolbar: search, dropdowns, status pills — single visual unit ── */}
      <div className="border-b pb-3" style={{ borderColor: "var(--hairline)" }}>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search — takes available space */}
          <div className="min-w-[200px] flex-1">
            <SearchField
              value={search}
              onChange={updateSearchValue}
              placeholder="Search by name, client, date, drive…"
              suggestions={searchSuggestions}
              onSelectSuggestion={updateSearchValue}
              resultCount={search.trim() ? filteredProjects.length : undefined}
            />
          </div>

          {/* Divider */}
          <div className="hidden h-7 w-px xl:block" style={{ background: "var(--hairline)" }} />

          {/* Dropdowns — compact inline */}
          <CompactSelect
            value={folderTypeFilter}
            onChange={(v) => updateQueryParam("folderType", v)}
            placeholder="All types"
          >
            <option value="">All types</option>
            {folderTypeValues.map((t) => (
              <option key={t} value={t}>{FOLDER_TYPE_LABELS[t]}</option>
            ))}
          </CompactSelect>

          <CompactSelect
            value={categoryFilter}
            onChange={(v) => updateQueryParam("category", v)}
            placeholder="All categories"
          >
            <option value="">All categories</option>
            {categoryValues.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </CompactSelect>

          <CompactSelect
            value={driveFilter}
            onChange={(v) => updateQueryParam("drive", v)}
            placeholder="All drives"
          >
            <option value="">All drives</option>
            <option value={UNASSIGNED_DRIVE_FILTER_VALUE}>Unassigned</option>
            {drives.map((d) => (
              <option key={d.id} value={d.id}>{d.displayName}</option>
            ))}
          </CompactSelect>

          {/* Divider */}
          <div className="hidden h-7 w-px xl:block" style={{ background: "var(--hairline)" }} />

          {/* Status pills — inline with everything else */}
          {STATUS_FILTERS.map((f) => {
            const active =
              f.param === "unassigned" ? showUnassigned
              : f.param === "missing" ? showMissing
              : f.param === "duplicate" ? showDuplicate
              : showMovePending;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => toggleStatusFilter(f.param)}
                className={active ? "chip chip-accent" : "chip chip-ghost"}
                style={{ cursor: "pointer" }}
              >
                {f.label}
              </button>
            );
          })}

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearAllFilters}
              className="ml-auto text-[12px] font-medium transition-colors"
              style={{ color: "var(--ink-3)" }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

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
      <div className="overflow-hidden">
        {isLoading ? (
          <div aria-busy="true" aria-label="Loading projects">
            {[0, 1, 2, 3, 4, 5].map((i) => <ProjectRowSkeleton key={i} />)}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="py-4">
            <EmptyState
              title={projects.length === 0 ? "No projects yet" : "No results"}
              description={
                projects.length === 0
                  ? "Run a scan to index a drive, or create a manual project to start building the catalog."
                  : "Try a broader search or remove an active filter."
              }
            />
          </div>
        ) : (
          <>
            {/* Table controls strip */}
            <div
              className="flex items-center justify-between gap-4 border-b px-2 py-2"
              style={{ borderColor: "var(--hairline)" }}
            >
              <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium" style={{ color: "var(--ink-3)" }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  aria-label="Select all visible"
                  className="accent-[color:var(--accent)]"
                />
                {allVisibleSelected ? "Deselect all" : "Select all"}
              </label>
              <p className="tnum text-[11px]" style={{ color: "var(--ink-3)" }}>
                {hasActiveFilters || search.trim() ? (
                  <>
                    <span className="font-semibold" style={{ color: "var(--ink-2)" }}>{filteredProjects.length}</span>
                    {" of "}
                    <span className="font-semibold" style={{ color: "var(--ink-2)" }}>{projects.length}</span>
                    {" "}
                    {projects.length === 1 ? "project" : "projects"}
                  </>
                ) : (
                  <>
                    <span className="font-semibold" style={{ color: "var(--ink-2)" }}>{projects.length}</span>
                    {" "}
                    {projects.length === 1 ? "project" : "projects"}
                  </>
                )}
              </p>
            </div>

            {/* Things-3 flat list — each row is a click target, checkbox reveals on hover */}
            <div role="list">
              {filteredProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  drives={drives}
                  isSelected={selectedIds.includes(project.id)}
                  onToggleSelected={toggleSelection}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project row
// ---------------------------------------------------------------------------

function ProjectRow({
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
  const displayName = getDisplayProject(project);
  const displayClient = getDisplayClient(project);
  const displayDate = formatParsedDate(project.correctedDate ?? project.parsedDate);
  const isPersonalFolder = project.folderType === "personal_folder";
  const statusBadges = getProjectStatusBadges(project).filter((b) => b !== "Normal");
  const driveName = getDriveName(drives, project.currentDriveId);
  const driveColor = getDriveColor(project.currentDriveId);
  const targetDrive = project.targetDriveId
    ? drives.find((d) => d.id === project.targetDriveId)
    : null;
  const targetDriveName = targetDrive?.displayName ?? null;
  const targetDriveColor = targetDrive ? getDriveColor(targetDrive.id) : null;

  const isMissing = project.missingStatus === "missing";
  const isDuplicate = project.duplicateStatus === "duplicate";
  const statusAccent = isMissing
    ? "inset 3px 0 0 var(--danger)"
    : isDuplicate
      ? "inset 3px 0 0 var(--warn)"
      : undefined;

  // Primary line: `Client · Name` for structured entries, folder name for
  // personal_folder. The primary line keeps the density users want in a
  // flat list — one horizontal scan answers "what is this?"
  const primaryLine = isPersonalFolder ? project.folderName : displayClient !== "—" ? displayClient : displayName;
  const secondaryLine = isPersonalFolder
    ? project.folderPath || ""
    : displayClient !== "—"
      ? displayName
      : project.folderName !== displayName
        ? project.folderName
        : "";

  // Cat/category accent color for the left avatar. Soft category colors so the
  // primary drive-color dot stays the most saturated on the row.
  const avatarPalette: Record<string, { bg: string; color: string }> = {
    photo: { bg: "var(--info-soft)", color: "var(--info)" },
    video: { bg: "var(--accent-soft)", color: "var(--accent-ink)" },
    design: { bg: "var(--ok-soft)", color: "var(--ok)" },
    mixed: { bg: "var(--warn-soft)", color: "var(--warn)" },
    personal: { bg: "var(--danger-soft)", color: "var(--danger)" }
  };
  const avatar =
    avatarPalette[project.category ?? ""] ?? {
      bg: "var(--surface-inset)",
      color: "var(--ink-3)"
    };
  const avatarLetter = (primaryLine || "?")[0]?.toUpperCase() ?? "?";

  return (
    <div
      role="listitem"
      className={`proj-row group grid items-center gap-4 border-b px-2 py-2.5 ${isSelected ? "bg-[color:var(--accent-soft)]" : ""}`}
      style={{
        gridTemplateColumns: "28px 1fr 220px 70px 140px 16px",
        borderColor: "var(--hairline)",
        boxShadow: statusAccent
      }}
      aria-selected={isSelected}
    >
      {/* Checkbox column — shows on hover or when row is already selected */}
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelected(project.id)}
          aria-label={`Select ${project.folderName}`}
          className={`accent-[color:var(--accent)] transition-opacity ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
        />
      </div>

      {/* Project — avatar + title + subtitle */}
      <Link
        to={`/projects/${project.id}`}
        className="flex min-w-0 items-center gap-3"
        aria-label={`Open ${project.folderName}`}
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold"
          style={{ background: avatar.bg, color: avatar.color }}
        >
          {avatarLetter}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[13px] font-medium leading-snug"
            style={{ color: "var(--ink)" }}
          >
            {primaryLine}
            {!isPersonalFolder && displayClient !== "—" && displayName ? (
              <span className="ml-1" style={{ color: "var(--ink-3)", fontWeight: 400 }}>
                · {displayName}
              </span>
            ) : null}
          </div>
          {secondaryLine || displayDate !== "—" ? (
            <div className="mt-0.5 flex gap-2 text-[11px]" style={{ color: "var(--ink-3)" }}>
              {displayDate !== "—" ? (
                <span className="tnum shrink-0">{displayDate}</span>
              ) : null}
              {displayDate !== "—" && secondaryLine ? (
                <span style={{ color: "var(--ink-4)" }}>·</span>
              ) : null}
              {secondaryLine ? (
                <span className="truncate">{secondaryLine}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </Link>

      {/* Drive — drive-dot + name, with optional "→ target" for pending moves */}
      <div className="min-w-0 text-[12.5px]">
        {project.currentDriveId ? (
          <div className="flex items-center gap-2">
            <span
              className="drive-dot"
              style={{ "--drive-color": driveColor, width: 8, height: 8 } as CSSProperties}
            />
            <span className="truncate" style={{ color: "var(--ink-2)" }}>
              {driveName}
            </span>
            {targetDriveName && project.moveStatus === "pending" ? (
              <>
                <Icon name="arrowRight" size={10} color="var(--ink-4)" />
                <span
                  className="drive-dot"
                  style={{ "--drive-color": targetDriveColor ?? "var(--ink-3)", width: 7, height: 7 } as CSSProperties}
                />
                <span className="truncate" style={{ color: "var(--ink-3)" }}>
                  {targetDriveName}
                </span>
              </>
            ) : null}
          </div>
        ) : (
          <span style={{ color: "var(--warn)" }}>Unassigned</span>
        )}
      </div>

      {/* Size — right-aligned tabular numbers */}
      <div className="tnum text-right text-[12.5px]" style={{ color: "var(--ink-2)" }}>
        {formatBytes(project.sizeBytes)}
      </div>

      {/* Status chips — stack to the right */}
      <div className="flex flex-wrap justify-end gap-1 overflow-hidden">
        {statusBadges.map((b) => (
          <StatusBadge key={b} label={b} />
        ))}
      </div>

      {/* Chevron */}
      <Link
        to={`/projects/${project.id}`}
        className="link-card flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        style={{ color: "var(--ink-4)" }}
        aria-label={`Open ${project.folderName}`}
        tabIndex={-1}
      >
        <Icon name="chevron" size={12} />
      </Link>
    </div>
  );
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
    <div
      className="card overflow-hidden px-4 py-3"
      style={{ borderColor: "var(--ink)" }}
    >
      {preview ? (
        <div className="space-y-3">
          <FeedbackNotice tone="info" title={preview.title} messages={[preview.summary, ...preview.confirmations]} />
          {preview.warnings.length > 0 ? (
            <FeedbackNotice tone="warning" title="Review warnings" messages={preview.warnings} />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm btn-primary" disabled={isMutating} onClick={onConfirm}>
              {isMutating ? "Applying…" : "Confirm action"}
            </button>
            <button type="button" className="btn btn-sm" onClick={onCancelPreview}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {/* Selection count */}
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: "var(--ink)" }}
            >
              {selectedCount}
            </span>
            <span className="text-[12.5px] font-medium" style={{ color: "var(--ink)" }}>
              selected
            </span>
            <button
              type="button"
              className="text-[11px] transition hover:opacity-75"
              style={{ color: "var(--ink-3)" }}
              onClick={onClearSelection}
            >
              Clear
            </button>
          </div>

          <div className="h-4 w-px" style={{ background: "var(--hairline)" }} />

          {/* Assign drive */}
          <BatchAction
            label="Assign drive"
            onReview={() => onPreview("assign-drive")}
            disabled={isMutating}
          >
            <select
              value={state.assignDriveId}
              onChange={(e) => onChange({ ...state, assignDriveId: e.target.value })}
              className="field-shell cursor-pointer bg-transparent px-2.5 py-1.5 text-[12.5px] outline-none"
            >
              <option value="">Unassigned</option>
              {drives.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
            </select>
          </BatchAction>

          <div className="h-4 w-px" style={{ background: "var(--hairline)" }} />

          {/* Set category */}
          <BatchAction
            label="Set category"
            onReview={() => onPreview("set-category")}
            disabled={isMutating}
          >
            <select
              value={state.category}
              onChange={(e) => onChange({ ...state, category: e.target.value as Category | "" })}
              className="field-shell cursor-pointer bg-transparent px-2.5 py-1.5 text-[12.5px] outline-none"
            >
              <option value="">Choose category</option>
              {categoryValues.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </BatchAction>

          <div className="h-4 w-px" style={{ background: "var(--hairline)" }} />

          {/* Plan move */}
          <BatchAction
            label="Plan move"
            onReview={() => onPreview("plan-move")}
            disabled={isMutating}
          >
            <select
              value={state.targetDriveId}
              onChange={(e) => onChange({ ...state, targetDriveId: e.target.value })}
              className="field-shell cursor-pointer bg-transparent px-2.5 py-1.5 text-[12.5px] outline-none"
            >
              <option value="">Target drive</option>
              {drives.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
            </select>
          </BatchAction>

          <div className="h-4 w-px" style={{ background: "var(--hairline)" }} />

          {/* Delete — destructive standalone action, no parameter needed */}
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => onPreview("delete")}
            disabled={isMutating}
          >
            <Icon name="trash" size={11} />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function BatchAction({
  label,
  children,
  onReview,
  disabled
}: {
  label: string;
  children: ReactNode;
  onReview(): void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium" style={{ color: "var(--ink-3)" }}>
        {label}
      </span>
      {children}
      <button
        type="button"
        className="btn btn-sm"
        disabled={disabled}
        onClick={onReview}
      >
        Review
      </button>
    </div>
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
    <SectionCard
      title="New manual project"
      description="Manual projects join the catalog immediately and can be assigned to a drive later."
    >
      {validation.errors.length > 0 ? (
        <div className="mb-4">
          <FeedbackNotice tone="error" title="Creation requirements" messages={validation.errors} />
        </div>
      ) : null}
      {validation.warnings.length > 0 ? (
        <div className="mb-4">
          <FeedbackNotice tone="info" title="Note" messages={validation.warnings} />
        </div>
      ) : null}
      <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={onSubmit}>
        <FormField label="Date (YYMMDD)">
          <input required maxLength={6} value={form.parsedDate} onChange={(e) => onChange({ ...form, parsedDate: e.target.value })} className="field-shell w-full bg-transparent px-3 py-2 outline-none" placeholder="240401" />
        </FormField>
        <FormField label="Client">
          <input required value={form.parsedClient} onChange={(e) => onChange({ ...form, parsedClient: e.target.value })} className="field-shell w-full bg-transparent px-3 py-2 outline-none" placeholder="Apple" />
        </FormField>
        <FormField label="Project">
          <input required value={form.parsedProject} onChange={(e) => onChange({ ...form, parsedProject: e.target.value })} className="field-shell w-full bg-transparent px-3 py-2 outline-none" placeholder="ProductShoot" />
        </FormField>
        <FormField label="Category">
          <select value={form.category} onChange={(e) => onChange({ ...form, category: e.target.value as Category | "" })} className="field-shell w-full bg-transparent px-3 py-2 outline-none">
            <option value="">Choose category</option>
            {categoryValues.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FormField>
        <FormField label="Size (GB)">
          <input type="number" min="0" step="0.1" value={form.sizeGigabytes} onChange={(e) => onChange({ ...form, sizeGigabytes: e.target.value })} className="field-shell w-full bg-transparent px-3 py-2 outline-none" placeholder="120" />
        </FormField>
        <FormField label="Drive">
          <select value={form.currentDriveId} onChange={(e) => onChange({ ...form, currentDriveId: e.target.value })} className="field-shell w-full bg-transparent px-3 py-2 outline-none">
            <option value="">Unassigned</option>
            {drives.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
          </select>
        </FormField>
        <div className="md:col-span-2 xl:col-span-3 flex items-center justify-end gap-2">
          <button type="button" className="btn btn-sm" onClick={onCancel}>Discard</button>
          <button type="submit" className="btn btn-sm btn-primary" disabled={isMutating}>{isMutating ? "Saving…" : "Create project"}</button>
        </div>
      </form>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}

function CompactSelect({
  value,
  onChange,
  placeholder,
  children
}: {
  value: string;
  onChange(v: string): void;
  placeholder: string;
  children: ReactNode;
}) {
  const isActive = value !== "";
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`field-shell cursor-pointer bg-transparent px-3 py-1.5 text-[12.5px] outline-none${isActive ? " field-shell--active" : ""}`}
      style={{
        color: isActive ? "var(--ink)" : "var(--ink-3)"
      }}
      aria-label={placeholder}
    >
      {children}
    </select>
  );
}

