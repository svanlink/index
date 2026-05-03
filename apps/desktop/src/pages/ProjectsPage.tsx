import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "@drive-project-catalog/ui";
import { useShortcut } from "../app/useShortcut";
import { filterProjectCatalog, UNASSIGNED_DRIVE_FILTER_VALUE } from "@drive-project-catalog/data";
import {
  categoryValues,
  folderTypeValues,
  type Category,
  type Drive,
  type FolderType
} from "@drive-project-catalog/domain";
import { validateManualProjectForm } from "../app/catalogValidation";
import { useCatalogStore } from "../app/providers";
import { FeedbackNotice, ProjectRowSkeleton, SectionCard } from "./pagePrimitives";
import { ProjectRow, ProjectTableHeader } from "./ProjectList";

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

const initialProjectForm: ProjectFormState = {
  parsedDate: "", parsedClient: "", parsedProject: "",
  category: "", sizeGigabytes: "", currentDriveId: ""
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ProjectsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    projects, drives, isLoading, isMutating,
    createProject
  } = useCatalogStore();

  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(initialProjectForm);
  const [feedback, setFeedback] = useState<{ tone: "success" | "warning" | "error" | "info"; title: string; messages: string[] } | null>(null);

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

  const manualProjectValidation = useMemo(
    () => validateManualProjectForm(projectForm),
    [projectForm]
  );

  // Auto-dismiss feedback
  useEffect(() => {
    if (!feedback) return;
    const id = window.setTimeout(() => setFeedback(null), 2800);
    return () => window.clearTimeout(id);
  }, [feedback]);

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

  function updateQueryParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next);
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
      <div style={{ paddingTop: 32 }}>
        <div
          className="flex items-center justify-center"
          style={{ marginBottom: 20, height: 44, width: 44, borderRadius: 10, background: "var(--surface-container-low)" }}
        >
          <Icon name="folder" size={20} color="var(--ink)" />
        </div>
        <h1
          style={{ fontSize: 22, fontWeight: 600, color: "var(--ink)", margin: 0, letterSpacing: "-0.01em", lineHeight: 1.2 }}
        >
          No projects yet.
        </h1>
        <p
          style={{ color: "var(--ink-2)", margin: "8px 0 0", fontSize: 14, lineHeight: 1.625, maxWidth: "48ch" }}
        >
          Scan a connected drive to index its folders, or create a manual project
          to start building the catalog.
        </p>
        <div className="flex items-center" style={{ marginTop: 24, gap: 8 }}>
          <Link to="/drives" className="btn btn-primary">
            <Icon name="scan" size={13} color="currentColor" />
            Scan a drive
          </Link>
          <button
            type="button"
            className="btn"
            onClick={() => setIsCreateOpen(true)}
          >
            New project
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 24, paddingTop: 8 }}>
      {/* sr-only h1 for WCAG 2.4.6 and test identification. The top-nav
          breadcrumb names this section for sighted users; the h1 exists for
          screen readers and automated tests only. */}
      <h1 className="sr-only">Projects</h1>
      {/* Action strip — AppShell chrome owns the "Projects" title. This page
          only offers the action that can't live in chrome: creating a manual
          project. The counts users actually need land in the status-tab
          counts below, not in a stat grid. */}
      {(projects.length > 0 || isCreateOpen) && !isLoading ? (
        <div className="flex items-center justify-end">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => setIsCreateOpen((c) => !c)}
          >
            <Icon name="plus" size={12} color="currentColor" />
            {isCreateOpen ? "Discard" : "New project"}
          </button>
        </div>
      ) : null}

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

      {showChrome ? (
        <div>
          {statusTabs.length > 1 ? (
            <div
              className="flex flex-wrap items-center"
              style={{ borderBottom: "1px solid var(--hairline)" }}
            >
              {statusTabs.map((tab) => {
                const isActive = activeStatusTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => selectStatusTab(tab.id)}
                    className="flex items-center"
                    style={{
                      gap: 6,
                      paddingBottom: 12,
                      paddingTop: 10,
                      paddingRight: 20,
                      fontSize: 14,
                      transition: "color 140ms var(--ease)",
                      borderBottom: isActive ? "2px solid var(--ink)" : "2px solid transparent",
                      color: isActive ? "var(--ink)" : "var(--ink-3)",
                      fontWeight: isActive ? 500 : 400,
                      marginBottom: -1
                    }}
                  >
                    <span>{tab.label}</span>
                    {tab.count > 0 ? (
                      <span
                        className="tnum"
                        style={{ fontSize: 12, color: isActive ? "var(--ink-3)" : "var(--ink-4)" }}
                      >
                        {tab.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center" style={{ gap: 8, paddingTop: 12 }}>
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

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="hover-underline"
                style={{ fontSize: 13, color: "var(--ink-3)" }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Project list ── */}
      <div className="card" style={{ overflow: "hidden" }}>
        {isLoading ? (
          <div aria-busy="true" aria-label="Loading projects">
            {[0, 1, 2, 3, 4, 5].map((i) => <ProjectRowSkeleton key={i} />)}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center text-center" style={{ gap: 8, padding: "64px 16px" }}>
            <span
              className="inline-flex items-center justify-center"
              style={{ marginBottom: 4, height: 44, width: 44, borderRadius: 10, background: "var(--surface-inset)" }}
              aria-hidden="true"
            >
              <Icon
                name={hasActiveFilters || search.trim() ? "search" : "folder"}
                size={20}
                color="var(--ink-3)"
              />
            </span>
            <p className="font-semibold" style={{ fontSize: 13, color: "var(--ink)" }}>
              {hasActiveFilters || search.trim() ? "No projects match" : "No projects yet"}
            </p>
            <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {hasActiveFilters || search.trim() ? (
                <>
                  Try a broader search or{" "}
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="hover-underline font-medium"
                    style={{ color: "var(--ink-2)", textUnderlineOffset: 2 }}
                  >
                    clear filters
                  </button>
                  .
                </>
              ) : (
                "Scan a connected drive to import projects, or add one manually."
              )}
            </p>
          </div>
        ) : (
          <>
            {/* Table controls strip */}
            <div
              className="flex items-center justify-end"
              style={{ gap: 16, borderBottom: "1px solid var(--hairline)", padding: "12px 16px" }}
            >
              <p className="tnum" style={{ fontSize: 12, color: "var(--ink-3)" }}>
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

            <ProjectTableHeader />
            {/* Things-3 flat list — each row is a click target, checkbox reveals on hover */}
            <div role="list">
              {filteredProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  drives={drives}
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
        <div style={{ marginBottom: 16 }}>
          <FeedbackNotice tone="error" title="Creation requirements" messages={validation.errors} />
        </div>
      ) : null}
      {validation.warnings.length > 0 ? (
        <div style={{ marginBottom: 16 }}>
          <FeedbackNotice tone="info" title="Note" messages={validation.warnings} />
        </div>
      ) : null}
      <form className="create-form-grid" onSubmit={onSubmit}>
        <FormField label="Date (YYYY-MM-DD)">
          <input required maxLength={10} value={form.parsedDate} onChange={(e) => onChange({ ...form, parsedDate: e.target.value })} className="field-shell w-full bg-transparent outline-none" placeholder="2024-03-12" />
        </FormField>
        <FormField label="Client">
          <input required value={form.parsedClient} onChange={(e) => onChange({ ...form, parsedClient: e.target.value })} className="field-shell w-full bg-transparent outline-none" placeholder="Apple" />
        </FormField>
        <FormField label="Project">
          <input required value={form.parsedProject} onChange={(e) => onChange({ ...form, parsedProject: e.target.value })} className="field-shell w-full bg-transparent outline-none" placeholder="ProductShoot" />
        </FormField>
        <FormField label="Category">
          <select value={form.category} onChange={(e) => onChange({ ...form, category: e.target.value as Category | "" })} className="field-shell w-full bg-transparent outline-none">
            <option value="">Choose category</option>
            {categoryValues.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FormField>
        <FormField label="Size (GB)">
          <input type="number" min="0" step="0.1" value={form.sizeGigabytes} onChange={(e) => onChange({ ...form, sizeGigabytes: e.target.value })} className="field-shell w-full bg-transparent outline-none" placeholder="120" />
        </FormField>
        <FormField label="Drive">
          <select value={form.currentDriveId} onChange={(e) => onChange({ ...form, currentDriveId: e.target.value })} className="field-shell w-full bg-transparent outline-none">
            <option value="">Unassigned</option>
            {drives.map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
          </select>
        </FormField>
        <div className="form-actions flex items-center justify-end" style={{ gap: 8 }}>
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
    <label className="flex flex-col" style={{ gap: 6 }}>
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
      className={`field-shell cursor-pointer bg-transparent outline-none${isActive ? " field-shell--active" : ""}`}
      style={{
        fontSize: 12,
        padding: "6px 12px",
        color: isActive ? "var(--ink)" : "var(--ink-3)"
      }}
      aria-label={placeholder}
    >
      {children}
    </select>
  );
}
