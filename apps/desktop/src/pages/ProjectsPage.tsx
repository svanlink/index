import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { validateManualProjectForm } from "../app/catalogValidation";
import { useCatalogStore } from "../app/providers";
import {
  formatBytes,
  formatParsedDate,
  getDriveName,
  getProjectStatusBadges
} from "./dashboardHelpers";
import { FeedbackNotice, ProjectRowSkeleton, SectionCard, StatusBadge } from "./pagePrimitives";
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
      <div className="pt-8">
        <div
          className="mb-5 flex h-11 w-11 items-center justify-center rounded-[10px]"
          style={{ background: "var(--surface-container-low)" }}
        >
          <Icon name="folder" size={20} color="var(--ink)" />
        </div>
        <h1
          className="text-[22px] font-semibold"
          style={{ color: "var(--ink)", margin: 0, letterSpacing: "-0.01em", lineHeight: 1.2 }}
        >
          No projects yet.
        </h1>
        <p
          className="mt-2 max-w-[48ch] text-[14px] leading-relaxed"
          style={{ color: "var(--ink-2)", margin: "8px 0 0" }}
        >
          Scan a connected drive to index its folders, or create a manual project
          to start building the catalog.
        </p>
        <div className="mt-6 flex items-center gap-2">
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
    <div className="space-y-6 pt-2">
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
              className="flex flex-wrap items-center gap-0"
              style={{ borderBottom: "1px solid var(--hairline)" }}
            >
              {statusTabs.map((tab) => {
                const isActive = activeStatusTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => selectStatusTab(tab.id)}
                    className="flex items-center gap-1.5 pb-3 pt-[10px] pr-5 text-[14px] transition-colors"
                    style={{
                      borderBottom: isActive ? "2px solid var(--ink)" : "2px solid transparent",
                      color: isActive ? "var(--ink)" : "var(--ink-3)",
                      fontWeight: isActive ? 500 : 400,
                      marginBottom: -1
                    }}
                  >
                    <span>{tab.label}</span>
                    {tab.count > 0 ? (
                      <span
                        className="tnum text-[12px]"
                        style={{ color: isActive ? "var(--ink-3)" : "var(--ink-4)" }}
                      >
                        {tab.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-3">
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
                className="text-[13px] transition-colors"
                style={{ color: "var(--ink-3)" }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Project list ── */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div aria-busy="true" aria-label="Loading projects">
            {[0, 1, 2, 3, 4, 5].map((i) => <ProjectRowSkeleton key={i} />)}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div
            className="flex flex-col items-center gap-1 px-4 py-16 text-center"
          >
            <p
              className="text-[13.5px] font-semibold"
              style={{ color: "var(--ink)" }}
            >
              No results
            </p>
            <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              Try a broader search or{" "}
              <button
                type="button"
                onClick={clearAllFilters}
                className="font-medium underline-offset-2 hover:underline"
                style={{ color: "var(--ink-2)" }}
              >
                clear filters
              </button>
              .
            </p>
          </div>
        ) : (
          <>
            {/* Table controls strip */}
            <div
              className="flex items-center justify-end gap-4 border-b px-4 py-3"
              style={{ borderColor: "var(--hairline)" }}
            >
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
  drives
}: {
  project: Project;
  drives: Drive[];
}) {
  const displayName = getDisplayProject(project);
  const displayClient = getDisplayClient(project);
  const displayDate = formatParsedDate(project.correctedDate ?? project.parsedDate);
  const isPersonalFolder = project.folderType === "personal_folder";
  const statusBadges = getProjectStatusBadges(project).filter((b: string) => b !== "Normal");
  const currentDrive = project.currentDriveId ? drives.find((d) => d.id === project.currentDriveId) : null;
  const driveName = getDriveName(currentDrive);
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
      className="proj-row group grid items-center gap-3 border-b px-4 py-3"
      style={{
        gridTemplateColumns: "minmax(0,1fr) minmax(170px,220px) 88px minmax(140px,180px) 16px",
        borderColor: "var(--hairline)",
        boxShadow: statusAccent
      }}
    >
      {/* Project — avatar + title + subtitle */}
      <Link
        to={`/projects/${project.id}`}
        className="flex min-w-0 items-center gap-3"
        aria-label={`Open ${project.folderName}`}
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[11.5px] font-semibold"
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
        {project.sizeBytes != null ? formatBytes(project.sizeBytes) : "—"}
      </div>

      {/* Status chips — stack to the right */}
      <div className="flex flex-wrap justify-end gap-1 overflow-hidden">
        {statusBadges.map((b: string) => (
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
        <FormField label="Date (YYYY-MM-DD)">
          <input required maxLength={10} value={form.parsedDate} onChange={(e) => onChange({ ...form, parsedDate: e.target.value })} className="field-shell w-full bg-transparent px-3 py-2 outline-none" placeholder="2024-03-12" />
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
