import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { filterProjectCatalog } from "@drive-project-catalog/data";
import {
  categoryValues,
  getDisplayClient,
  getDisplayProject,
  type Category,
  type Drive,
  type Project
} from "@drive-project-catalog/domain";
import { PageHeader } from "@drive-project-catalog/ui";
import { buildBatchActionPreview, validateManualProjectForm } from "../app/catalogValidation";
import { useCatalogStore } from "../app/providers";
import {
  formatBytes,
  formatParsedDate,
  getDriveName,
  getProjectStatusBadges
} from "./dashboardHelpers";
import { EmptyState, FeedbackNotice, LoadingState, SectionCard, StatusBadge } from "./pagePrimitives";

const toggleFilters = [
  { label: "Unassigned", key: "showUnassigned" },
  { label: "Missing", key: "showMissing" },
  { label: "Duplicates", key: "showDuplicate" },
  { label: "Move pending", key: "showMovePending" }
] as const;

interface ProjectFormState {
  parsedDate: string;
  parsedClient: string;
  parsedProject: string;
  category: Category | "";
  sizeGigabytes: string;
  currentDriveId: string;
}

interface BatchActionState {
  assignDriveId: string;
  category: Category | "";
  targetDriveId: string;
}

const initialProjectForm: ProjectFormState = {
  parsedDate: "",
  parsedClient: "",
  parsedProject: "",
  category: "",
  sizeGigabytes: "",
  currentDriveId: ""
};

const initialBatchActionState: BatchActionState = {
  assignDriveId: "",
  category: "",
  targetDriveId: ""
};

export function ProjectsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    projects,
    drives,
    isLoading,
    isMutating,
    createProject,
    assignProjectsToDrive,
    setProjectsCategory,
    planProjectsMove
  } = useCatalogStore();
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(initialProjectForm);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [batchState, setBatchState] = useState<BatchActionState>(initialBatchActionState);
  const [feedback, setFeedback] = useState<{ tone: "success" | "warning" | "error" | "info"; title: string; messages: string[] } | null>(null);
  const [batchPreview, setBatchPreview] = useState<ReturnType<typeof buildBatchActionPreview> | null>(null);

  const categoryFilter = (searchParams.get("category") as Category | null) ?? "";
  const driveFilter = searchParams.get("drive") ?? "";
  const targetDriveFilter = searchParams.get("targetDrive") ?? "";
  const showUnassigned = searchParams.get("unassigned") === "1";
  const showMissing = searchParams.get("missing") === "1";
  const showDuplicate = searchParams.get("duplicate") === "1";
  const showMovePending = searchParams.get("movePending") === "1";

  const filteredProjects = useMemo(
    () =>
      filterProjectCatalog(projects, drives, {
        search,
        category: categoryFilter || "",
        currentDriveId: driveFilter || undefined,
        targetDriveId: targetDriveFilter || undefined,
        showUnassigned,
        showMissing,
        showDuplicate,
        showMovePending
      }),
    [categoryFilter, driveFilter, drives, projects, search, showDuplicate, showMissing, showMovePending, showUnassigned, targetDriveFilter]
  );
  const selectedProjects = useMemo(
    () => projects.filter((project) => selectedProjectIds.includes(project.id)),
    [projects, selectedProjectIds]
  );
  const manualProjectValidation = useMemo(
    () => validateManualProjectForm(projectForm),
    [projectForm]
  );

  const allVisibleSelected = filteredProjects.length > 0 && filteredProjects.every((project) => selectedProjectIds.includes(project.id));

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  useEffect(() => {
    setBatchPreview(null);
  }, [batchState, selectedProjectIds]);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateManualProjectForm(projectForm);

    if (validation.errors.length > 0) {
      setFeedback({
        tone: "error",
        title: "Project creation blocked",
        messages: validation.errors
      });
      return;
    }

    const createdProject = await createProject({
      parsedDate: projectForm.parsedDate.trim(),
      parsedClient: projectForm.parsedClient.trim(),
      parsedProject: projectForm.parsedProject.trim(),
      category: projectForm.category as Category,
      sizeBytes: projectForm.sizeGigabytes ? Math.round(Number(projectForm.sizeGigabytes) * 1_000_000_000) : null,
      currentDriveId: projectForm.currentDriveId || null
    });

    setProjectForm(initialProjectForm);
    setIsCreateOpen(false);
    navigate(`/projects/${createdProject.id}`);
  }

  function openBatchPreview(kind: Parameters<typeof buildBatchActionPreview>[0]["kind"]) {
    const preview = buildBatchActionPreview({
      kind,
      selectedProjects,
      drives,
      assignDriveId: batchState.assignDriveId || null,
      category: batchState.category,
      targetDriveId: batchState.targetDriveId || null
    });

    if (preview.errors.length > 0) {
      setFeedback({
        tone: "error",
        title: preview.title,
        messages: preview.errors
      });
      setBatchPreview(null);
      return;
    }

    setBatchPreview(preview);
  }

  async function confirmBatchPreview() {
    if (!batchPreview) {
      return;
    }

    try {
      if (batchPreview.kind === "assign-drive") {
        await assignProjectsToDrive(selectedProjectIds, batchState.assignDriveId || null);
      } else if (batchPreview.kind === "set-category") {
        await setProjectsCategory(selectedProjectIds, batchState.category as Category);
      } else {
        await planProjectsMove(selectedProjectIds, batchState.targetDriveId);
      }

      setFeedback({
        tone: batchPreview.warnings.length > 0 ? "warning" : "success",
        title: batchPreview.kind === "assign-drive"
          ? "Drive assignment applied"
          : batchPreview.kind === "set-category"
            ? "Category update applied"
            : "Move plan applied",
        messages: batchPreview.warnings.length > 0
          ? [...batchPreview.confirmations, ...batchPreview.warnings]
          : batchPreview.confirmations
      });
      setSelectedProjectIds([]);
      setBatchPreview(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Batch action failed",
        messages: [error instanceof Error ? error.message : "The batch action could not be completed."]
      });
    }
  }

  function toggleStatusFilter(key: "showUnassigned" | "showMissing" | "showDuplicate" | "showMovePending") {
    const next = new URLSearchParams(searchParams);
    if (next.get(keyToParam(key)) === "1") {
      next.delete(keyToParam(key));
    } else {
      next.set(keyToParam(key), "1");
    }
    setSearchParams(next);
  }

  function updateQueryParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next);
  }

  function toggleProjectSelection(projectId: string) {
    setSelectedProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId]
    );
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelectedProjectIds((current) => current.filter((id) => !filteredProjects.some((project) => project.id === id)));
      return;
    }

    setSelectedProjectIds((current) => {
      const next = new Set(current);
      filteredProjects.forEach((project) => next.add(project.id));
      return [...next];
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Projects"
        title="Project catalog"
        description="Browse real local project records, combine practical filters, then apply lightweight batch actions for everyday drive and metadata management."
        actions={
          <button
            type="button"
            className="button-secondary"
            onClick={() => setIsCreateOpen((current) => !current)}
          >
            {isCreateOpen ? "Close form" : "New project"}
          </button>
        }
      />

      {feedback ? (
        <FeedbackNotice tone={feedback.tone} title={feedback.title} messages={feedback.messages} />
      ) : null}

      {isCreateOpen ? (
        <SectionCard
          title="Create manual project"
          description="Manual projects become part of the same local catalog and can remain unassigned until you know the destination drive."
        >
          {manualProjectValidation.errors.length > 0 ? (
            <div className="mb-4">
              <FeedbackNotice tone="error" title="Creation requirements" messages={manualProjectValidation.errors} />
            </div>
          ) : null}
          {manualProjectValidation.warnings.length > 0 ? (
            <div className="mb-4">
              <FeedbackNotice tone="info" title="Creation outcome" messages={manualProjectValidation.warnings} />
            </div>
          ) : null}
          <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={handleCreateProject}>
            <FormField label="Date (YYMMDD)">
              <input required maxLength={6} value={projectForm.parsedDate} onChange={(event) => setProjectForm((current) => ({ ...current, parsedDate: event.target.value }))} className="field-shell w-full bg-transparent px-4 py-3 outline-none" placeholder="240401" />
            </FormField>
            <FormField label="Client">
              <input required value={projectForm.parsedClient} onChange={(event) => setProjectForm((current) => ({ ...current, parsedClient: event.target.value }))} className="field-shell w-full bg-transparent px-4 py-3 outline-none" placeholder="Apple" />
            </FormField>
            <FormField label="Project">
              <input required value={projectForm.parsedProject} onChange={(event) => setProjectForm((current) => ({ ...current, parsedProject: event.target.value }))} className="field-shell w-full bg-transparent px-4 py-3 outline-none" placeholder="ProductShoot" />
            </FormField>
            <FormField label="Category">
              <select value={projectForm.category} onChange={(event) => setProjectForm((current) => ({ ...current, category: event.target.value as Category | "" }))} className="field-shell w-full bg-transparent px-4 py-3 outline-none">
                <option value="">Choose category</option>
                {categoryValues.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Size (GB, optional)">
              <input type="number" min="0" step="0.1" value={projectForm.sizeGigabytes} onChange={(event) => setProjectForm((current) => ({ ...current, sizeGigabytes: event.target.value }))} className="field-shell w-full bg-transparent px-4 py-3 outline-none" placeholder="120" />
            </FormField>
            <FormField label="Drive (optional)">
              <select value={projectForm.currentDriveId} onChange={(event) => setProjectForm((current) => ({ ...current, currentDriveId: event.target.value }))} className="field-shell w-full bg-transparent px-4 py-3 outline-none">
                <option value="">Unassigned</option>
                {drives.map((drive) => (
                  <option key={drive.id} value={drive.id}>{drive.displayName}</option>
                ))}
              </select>
            </FormField>
            <div className="md:col-span-2 xl:col-span-3 flex items-center justify-end gap-3">
              <button type="button" className="button-secondary" onClick={() => setIsCreateOpen(false)}>Cancel</button>
              <button type="submit" className="button-success" disabled={isMutating}>{isMutating ? "Saving..." : "Create project"}</button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <SectionCard title="Project controls" description="Combine status, category, drive, and search filters to narrow the catalog without changing the underlying sort order.">
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr_1fr]">
          <label className="field-shell flex items-center gap-3 text-sm" style={{ color: "var(--color-text-soft)" }}>
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">Search</span>
            <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Client, project, date, drive, category" className="w-full bg-transparent outline-none placeholder:text-[color:var(--color-text-soft)]" style={{ color: "var(--color-text)" }} />
          </label>
          <FormField label="Category filter">
            <select value={categoryFilter} onChange={(event) => updateQueryParam("category", event.target.value)} className="field-shell w-full bg-transparent px-4 py-3 outline-none">
              <option value="">All categories</option>
              {categoryValues.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Drive filter">
            <select value={driveFilter} onChange={(event) => updateQueryParam("drive", event.target.value)} className="field-shell w-full bg-transparent px-4 py-3 outline-none">
              <option value="">All drives</option>
              <option value="__unassigned__">Unassigned</option>
              {drives.map((drive) => (
                <option key={drive.id} value={drive.id}>{drive.displayName}</option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {toggleFilters.map((filter) => {
            const active = filter.key === "showUnassigned"
              ? showUnassigned
              : filter.key === "showMissing"
                ? showMissing
                : filter.key === "showDuplicate"
                  ? showDuplicate
                  : showMovePending;

            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => toggleStatusFilter(filter.key)}
                className={[
                  "rounded-full border px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                  active ? "text-white" : "bg-white"
                ].join(" ")}
                style={
                  active
                    ? { borderColor: "var(--color-accent)", background: "var(--color-accent)" }
                    : { borderColor: "var(--color-border-strong)", color: "var(--color-text-muted)" }
                }
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Batch actions" description="Select multiple projects and apply a lightweight operational update without leaving the catalog list.">
        {batchPreview ? (
          <div className="mb-5 space-y-3">
            <FeedbackNotice tone="info" title={batchPreview.title} messages={[batchPreview.summary, ...batchPreview.confirmations]} />
            {batchPreview.warnings.length > 0 ? (
              <FeedbackNotice tone="warning" title="Review warnings" messages={batchPreview.warnings} />
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button type="button" className="button-success" disabled={isMutating} onClick={() => void confirmBatchPreview()}>
                {isMutating ? "Applying..." : "Confirm batch action"}
              </button>
              <button type="button" className="button-secondary" onClick={() => setBatchPreview(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-[18px] border px-4 py-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>Assign drive</p>
            <select value={batchState.assignDriveId} onChange={(event) => setBatchState((current) => ({ ...current, assignDriveId: event.target.value }))} className="field-shell mt-3 w-full bg-transparent px-4 py-3 outline-none">
              <option value="">Unassigned</option>
              {drives.map((drive) => (
                <option key={drive.id} value={drive.id}>{drive.displayName}</option>
              ))}
            </select>
            <button type="button" className="button-secondary mt-3 w-full" disabled={selectedProjectIds.length === 0 || isMutating} onClick={() => openBatchPreview("assign-drive")}>
              Review action
            </button>
          </div>
          <div className="rounded-[18px] border px-4 py-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>Set category</p>
            <select value={batchState.category} onChange={(event) => setBatchState((current) => ({ ...current, category: event.target.value as Category | "" }))} className="field-shell mt-3 w-full bg-transparent px-4 py-3 outline-none">
              <option value="">Choose category</option>
              {categoryValues.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <button type="button" className="button-secondary mt-3 w-full" disabled={selectedProjectIds.length === 0 || isMutating} onClick={() => openBatchPreview("set-category")}>
              Review action
            </button>
          </div>
          <div className="rounded-[18px] border px-4 py-4" style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--color-text-soft)" }}>Plan move</p>
            <select value={batchState.targetDriveId} onChange={(event) => setBatchState((current) => ({ ...current, targetDriveId: event.target.value }))} className="field-shell mt-3 w-full bg-transparent px-4 py-3 outline-none">
              <option value="">Choose target drive</option>
              {drives.map((drive) => (
                <option key={drive.id} value={drive.id}>{drive.displayName}</option>
              ))}
            </select>
            <button type="button" className="button-secondary mt-3 w-full" disabled={selectedProjectIds.length === 0 || isMutating} onClick={() => openBatchPreview("plan-move")}>
              Review action
            </button>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            {selectedProjectIds.length} selected · {filteredProjects.length} visible
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Projects list" description="Newest records first, with combined filters and batch-friendly selection controls.">
        {isLoading ? (
          <LoadingState label="Loading projects" />
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            title={projects.length === 0 ? "No projects yet" : "No projects match these filters"}
            description={
              projects.length === 0
                ? "Create a manual project or finish a scan ingestion cycle to start building the catalog."
                : "Try a broader search or remove one of the active filters."
            }
          />
        ) : (
          <div className="overflow-hidden rounded-[20px] border" style={{ borderColor: "var(--color-border)" }}>
            <table className="min-w-full text-left text-sm">
              <thead style={{ background: "var(--color-surface-subtle)", color: "var(--color-text-soft)" }}>
                <tr>
                  <th className="px-4 py-4">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select all visible projects" />
                  </th>
                  <th className="px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.16em]">Date</th>
                  <th className="px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.16em]">Client</th>
                  <th className="px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.16em]">Project</th>
                  <th className="px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.16em]">Size</th>
                  <th className="px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.16em]">Category</th>
                  <th className="px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.16em]">Current drive</th>
                  <th className="px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.16em]">Status</th>
                  <th className="px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.16em]">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {filteredProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    drives={drives}
                    isSelected={selectedProjectIds.includes(project.id)}
                    onToggleSelected={toggleProjectSelection}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ProjectRow({
  project,
  drives,
  isSelected,
  onToggleSelected
}: {
  project: Project;
  drives: Drive[];
  isSelected: boolean;
  onToggleSelected(projectId: string): void;
}) {
  return (
    <tr className="align-top transition hover:bg-[#f7f5f0]" style={{ borderTop: "1px solid var(--color-border)" }}>
      <td className="px-4 py-5">
        <input type="checkbox" checked={isSelected} onChange={() => onToggleSelected(project.id)} aria-label={`Select ${getDisplayProject(project)}`} />
      </td>
      <td className="px-4 py-5 font-medium" style={{ color: "var(--color-text-muted)" }}>{formatParsedDate(project.parsedDate)}</td>
      <td className="px-4 py-5" style={{ color: "var(--color-text-muted)" }}>{getDisplayClient(project)}</td>
      <td className="px-4 py-4">
        <Link to={`/projects/${project.id}`} className="font-medium transition hover:opacity-75" style={{ color: "var(--color-text)" }}>
          {getDisplayProject(project)}
        </Link>
        <p className="mt-1 text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--color-text-soft)" }}>
          {project.isManual ? "Manual" : "Scanned"}
        </p>
      </td>
      <td className="px-4 py-5 font-medium tabular-nums" style={{ color: "var(--color-text-muted)" }}>{formatBytes(project.sizeBytes)}</td>
      <td className="px-4 py-5 capitalize" style={{ color: "var(--color-text-muted)" }}>{project.category ?? "Uncategorized"}</td>
      <td className="px-4 py-5" style={{ color: "var(--color-text-muted)" }}>{getDriveName(drives, project.currentDriveId)}</td>
      <td className="px-4 py-4">
        <div className="flex flex-wrap gap-2">
          {getProjectStatusBadges(project).map((token) => (
            <StatusBadge key={token} label={token} />
          ))}
        </div>
      </td>
      <td className="px-4 py-4">
        <div className="flex flex-col gap-2">
          <Link to={`/projects/${project.id}`} className="button-secondary text-center text-xs">
            Open detail
          </Link>
          <Link to={`/projects/${project.id}`} className="button-secondary text-center text-xs">
            Plan move
          </Link>
        </div>
      </td>
    </tr>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--color-text-soft)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function keyToParam(key: (typeof toggleFilters)[number]["key"]) {
  return key === "showUnassigned"
    ? "unassigned"
    : key === "showMissing"
      ? "missing"
      : key === "showDuplicate"
        ? "duplicate"
        : "movePending";
}
