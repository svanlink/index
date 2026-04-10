import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { EmptyState, FeedbackNotice, LoadingState, SearchField, SectionCard, StatusBadge } from "./pagePrimitives";

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
      <div className="flex items-center justify-between">
        <div />
        <button
          type="button"
          className="button-secondary"
          onClick={() => setIsCreateOpen((c) => !c)}
        >
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
      <div className="border-b pb-3" style={{ borderColor: "var(--color-border)" }}>
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
          <div className="hidden h-7 w-px xl:block" style={{ background: "var(--color-border)" }} />

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
          <div className="hidden h-7 w-px xl:block" style={{ background: "var(--color-border)" }} />

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
                className={`rounded border px-1.5 py-0.5 text-[11px] font-medium transition-colors ${active ? "" : "hover:bg-[color:var(--color-surface-subtle)]"}`}
                style={
                  active
                    ? { borderColor: "var(--color-accent)", background: "var(--color-accent)", color: "#f7f8fa" }
                    : { borderColor: "var(--color-border)", background: "var(--color-surface-subtle)", color: "var(--color-text-muted)" }
                }
              >
                {f.label}
              </button>
            );
          })}

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearAllFilters}
              className="ml-auto text-[12px] font-medium transition-colors hover:text-[color:var(--color-text)]"
              style={{ color: "var(--color-text-soft)" }}
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
          <div className="py-4">
            <LoadingState label="Loading projects…" />
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
              className="flex items-center justify-between gap-4 border-b px-4 py-1.5"
              style={{ borderColor: "var(--color-border)" }}
            >
              <label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium" style={{ color: "var(--color-text-soft)" }}>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  aria-label="Select all visible"
                  className="accent-[color:var(--color-accent)]"
                />
                {allVisibleSelected ? "Deselect all" : "Select all"}
              </label>
              <p className="text-[11px] tabular-nums" style={{ color: "var(--color-text-soft)" }}>
                <span className="font-semibold" style={{ color: "var(--color-text-muted)" }}>{filteredProjects.length}</span>
                {" "}
                {filteredProjects.length === 1 ? "entry" : "entries"}
                {hasActiveFilters ? " (filtered)" : ""}
              </p>
            </div>

            {/* Headerless table — rows are self-describing */}
            <table className="min-w-full text-left text-sm" role="grid">
              <tbody>
                {filteredProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    drives={drives}
                    isSelected={selectedIds.includes(project.id)}
                    onToggleSelected={toggleSelection}
                  />
                ))}
              </tbody>
            </table>
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

  return (
    <tr
      className={`group border-b transition-colors duration-75 ${isSelected ? "bg-[color:var(--color-accent-soft)] hover:bg-[#dbe3ec]" : "hover:bg-[#f7f5f0]"}`}
      style={{ borderColor: "var(--color-border)" }}
      aria-selected={isSelected}
    >
      {/* Checkbox */}
      <td className="w-10 py-2.5 pl-4 pr-1 align-middle">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelected(project.id)}
          aria-label={`Select ${project.folderName}`}
          className="accent-[color:var(--color-accent)]"
        />
      </td>

      {/* Identity — name + type pill + secondary context */}
      <td className="max-w-[320px] py-2.5 pl-2 pr-4 align-middle">
        <div className="flex min-w-0 items-center gap-2">
          <FolderTypePill folderType={project.folderType} />
          <div className="min-w-0 flex-1">
            <p className="min-w-0 truncate text-[13px] font-medium leading-snug" style={{ color: "var(--color-text)" }}>
              {displayName}
            </p>
            {/* Secondary line: folder name if different, or folder path for personal_folder */}
            {isPersonalFolder && project.folderPath ? (
              <p className="mt-px truncate text-[11px] italic" style={{ color: "var(--color-text-soft)" }}>
                {project.folderPath}
              </p>
            ) : displayName !== project.folderName ? (
              <p className="mt-px truncate text-[11px]" style={{ color: "var(--color-text-soft)" }}>
                {project.folderName}
              </p>
            ) : null}
          </div>
        </div>
      </td>

      {/* Client — only meaningful for structured entries */}
      <td className="w-[150px] px-3 py-2.5 align-middle">
        {!isPersonalFolder && displayClient !== "—" ? (
          <p className="truncate text-[13px]" style={{ color: "var(--color-text-muted)" }}>
            {displayClient}
          </p>
        ) : null}
      </td>

      {/* Date */}
      <td className="w-[90px] px-3 py-2.5 align-middle">
        {displayDate !== "—" ? (
          <p className="text-[12px] tabular-nums" style={{ color: "var(--color-text-soft)" }}>
            {displayDate}
          </p>
        ) : null}
      </td>

      {/* Drive */}
      <td className="w-[130px] px-3 py-2.5 align-middle">
        <p className="truncate text-[12px]" style={{ color: project.currentDriveId ? "var(--color-text-muted)" : "var(--color-text-soft)" }}>
          {driveName}
        </p>
        {project.targetDriveId && project.moveStatus === "pending" ? (
          <p className="mt-px text-[11px]" style={{ color: "var(--color-warning)" }}>
            → {getDriveName(drives, project.targetDriveId)}
          </p>
        ) : null}
      </td>

      {/* Size */}
      <td className="w-[80px] px-3 py-2.5 align-middle text-right tabular-nums text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        {formatBytes(project.sizeBytes)}
      </td>

      {/* Status badges */}
      <td className="w-[140px] px-3 py-2.5 align-middle">
        {statusBadges.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {statusBadges.map((b) => (
              <StatusBadge key={b} label={b} />
            ))}
          </div>
        ) : null}
      </td>

      {/* Open detail */}
      {/* S6/M8 — reveal is driven by CSS `focus-visible:` and `group-hover:`
          utilities instead of imperative `.style.opacity` mutations inside
          onFocus/onBlur. Keyboard focus reveal is preserved via
          `focus-visible:opacity-100`; hover reveal via `group-hover:`. */}
      <td className="w-10 py-2.5 pl-1 pr-4 align-middle">
        <Link
          to={`/projects/${project.id}`}
          className="link-card flex h-6 w-6 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-[color:var(--color-accent)]"
          style={{ color: "var(--color-text-soft)" }}
          aria-label={`Open ${project.folderName}`}
        >
          <ChevronRightIcon />
        </Link>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Folder type pill
// ---------------------------------------------------------------------------

function FolderTypePill({ folderType }: { folderType: FolderType }) {
  const styles: Record<FolderType, { border: string; bg: string; color: string }> = {
    client: {
      border: "var(--color-border-success)",
      bg: "var(--color-success-soft)",
      color: "var(--color-success-deep)"
    },
    personal_project: {
      border: "var(--color-border-info)",
      bg: "var(--color-accent-soft)",
      color: "var(--color-accent)"
    },
    personal_folder: {
      border: "var(--color-border)",
      bg: "var(--color-surface-subtle)",
      color: "var(--color-text-soft)"
    }
  };
  const s = styles[folderType];
  return (
    <span
      className="shrink-0 rounded border px-1.5 py-px text-[10px] font-medium"
      style={{ borderColor: s.border, background: s.bg, color: s.color }}
    >
      {FOLDER_TYPE_LABELS[folderType]}
    </span>
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
      className="app-panel overflow-hidden px-5 py-4"
      style={{ borderColor: "var(--color-accent)", borderWidth: 1 }}
    >
      {preview ? (
        <div className="space-y-3">
          <FeedbackNotice tone="info" title={preview.title} messages={[preview.summary, ...preview.confirmations]} />
          {preview.warnings.length > 0 ? (
            <FeedbackNotice tone="warning" title="Review warnings" messages={preview.warnings} />
          ) : null}
          <div className="flex flex-wrap gap-2.5">
            <button type="button" className="button-success" disabled={isMutating} onClick={onConfirm}>
              {isMutating ? "Applying…" : "Confirm action"}
            </button>
            <button type="button" className="button-secondary" onClick={onCancelPreview}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-4">
          {/* Selection count */}
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ background: "var(--color-accent)" }}
            >
              {selectedCount}
            </span>
            <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
              selected
            </span>
            <button
              type="button"
              className="text-[11px] uppercase tracking-[0.1em] transition hover:opacity-75"
              style={{ color: "var(--color-text-soft)" }}
              onClick={onClearSelection}
            >
              Clear
            </button>
          </div>

          <div className="h-5 w-px" style={{ background: "var(--color-border)" }} />

          {/* Assign drive */}
          <BatchAction
            label="Assign drive"
            onReview={() => onPreview("assign-drive")}
            disabled={isMutating}
          >
            <select
              value={state.assignDriveId}
              onChange={(e) => onChange({ ...state, assignDriveId: e.target.value })}
              className="field-shell bg-transparent py-2 text-sm outline-none"
              style={{ paddingLeft: "0.75rem", paddingRight: "0.75rem" }}
            >
              <option value="">Unassigned</option>
              {drives.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
            </select>
          </BatchAction>

          <div className="h-5 w-px" style={{ background: "var(--color-border)" }} />

          {/* Set category */}
          <BatchAction
            label="Set category"
            onReview={() => onPreview("set-category")}
            disabled={isMutating}
          >
            <select
              value={state.category}
              onChange={(e) => onChange({ ...state, category: e.target.value as Category | "" })}
              className="field-shell bg-transparent py-2 text-sm outline-none"
              style={{ paddingLeft: "0.75rem", paddingRight: "0.75rem" }}
            >
              <option value="">Choose category</option>
              {categoryValues.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </BatchAction>

          <div className="h-5 w-px" style={{ background: "var(--color-border)" }} />

          {/* Plan move */}
          <BatchAction
            label="Plan move"
            onReview={() => onPreview("plan-move")}
            disabled={isMutating}
          >
            <select
              value={state.targetDriveId}
              onChange={(e) => onChange({ ...state, targetDriveId: e.target.value })}
              className="field-shell bg-transparent py-2 text-sm outline-none"
              style={{ paddingLeft: "0.75rem", paddingRight: "0.75rem" }}
            >
              <option value="">Target drive</option>
              {drives.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
            </select>
          </BatchAction>

          <div className="h-5 w-px" style={{ background: "var(--color-border)" }} />

          {/* Delete — destructive standalone action, no parameter needed */}
          <div className="flex flex-col gap-1.5">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: "var(--color-danger, #b91c1c)" }}
            >
              Delete
            </span>
            <button
              type="button"
              className="button-secondary"
              onClick={() => onPreview("delete")}
              disabled={isMutating}
              style={{
                borderColor: "var(--color-danger, #b91c1c)",
                color: "var(--color-danger, #b91c1c)"
              }}
            >
              Review deletion
            </button>
          </div>
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
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--color-text-soft)" }}>
        {label}
      </span>
      {children}
      <button
        type="button"
        className="button-secondary py-2 text-xs"
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
          <input required maxLength={6} value={form.parsedDate} onChange={(e) => onChange({ ...form, parsedDate: e.target.value })} className="field-shell w-full bg-transparent px-4 py-3 outline-none" placeholder="240401" />
        </FormField>
        <FormField label="Client">
          <input required value={form.parsedClient} onChange={(e) => onChange({ ...form, parsedClient: e.target.value })} className="field-shell w-full bg-transparent px-4 py-3 outline-none" placeholder="Apple" />
        </FormField>
        <FormField label="Project">
          <input required value={form.parsedProject} onChange={(e) => onChange({ ...form, parsedProject: e.target.value })} className="field-shell w-full bg-transparent px-4 py-3 outline-none" placeholder="ProductShoot" />
        </FormField>
        <FormField label="Category">
          <select value={form.category} onChange={(e) => onChange({ ...form, category: e.target.value as Category | "" })} className="field-shell w-full bg-transparent px-4 py-3 outline-none">
            <option value="">Choose category</option>
            {categoryValues.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FormField>
        <FormField label="Size (GB)">
          <input type="number" min="0" step="0.1" value={form.sizeGigabytes} onChange={(e) => onChange({ ...form, sizeGigabytes: e.target.value })} className="field-shell w-full bg-transparent px-4 py-3 outline-none" placeholder="120" />
        </FormField>
        <FormField label="Drive">
          <select value={form.currentDriveId} onChange={(e) => onChange({ ...form, currentDriveId: e.target.value })} className="field-shell w-full bg-transparent px-4 py-3 outline-none">
            <option value="">Unassigned</option>
            {drives.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
          </select>
        </FormField>
        <div className="md:col-span-2 xl:col-span-3 flex items-center justify-end gap-3">
          <button type="button" className="button-secondary" onClick={onCancel}>Discard</button>
          <button type="submit" className="button-success" disabled={isMutating}>{isMutating ? "Saving…" : "Create project"}</button>
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
    <label className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-text-soft)" }}>
        {label}
      </span>
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
      className={`field-shell cursor-pointer bg-transparent py-2.5 text-sm outline-none${isActive ? " field-shell--active" : ""}`}
      style={{
        paddingLeft: "0.875rem",
        paddingRight: "0.875rem",
        color: isActive ? "var(--color-text)" : "var(--color-text-soft)"
      }}
      aria-label={placeholder}
    >
      {children}
    </select>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
