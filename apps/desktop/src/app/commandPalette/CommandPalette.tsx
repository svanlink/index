import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "@drive-project-catalog/ui";
import { getDisplayProject, getDisplayDate } from "@drive-project-catalog/domain";
import { useCatalogStore } from "../providers";
import { showPathInFinder } from "../nativeContextMenu";
import { useCommandPalette } from "./CommandPaletteContext";
import { useCommandPaletteSearch, MIN_QUERY_LENGTH } from "./useCommandPaletteSearch";

interface PaletteAction {
  id: string;
  label: string;
  icon: IconName;
  onSelect: (navigate: ReturnType<typeof useNavigate>) => void;
}

const PINNED_ACTIONS: ReadonlyArray<PaletteAction> = [
  {
    id: "register-drive",
    label: "Register Drive",
    icon: "hardDrive",
    onSelect: (navigate) => {
      navigate("/drives", { state: { openCreate: true } });
    }
  },
  {
    id: "import-folders",
    label: "Import Folders",
    icon: "folder",
    onSelect: (navigate) => {
      navigate("/drives", { state: { openImport: true } });
    }
  }
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-4 py-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em]"
      style={{ color: "var(--ink-4)" }}
    >
      {children}
    </div>
  );
}

function ResultRow({
  icon,
  primary,
  secondary,
  onClick,
  accessory
}: {
  icon: IconName;
  primary: string;
  secondary?: string;
  onClick(): void;
  accessory?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 px-2">
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 items-center gap-3 rounded-[8px] px-2 py-2.5 text-left min-w-0 transition-colors"
        style={{ color: "var(--ink)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-inset)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
      >
        <Icon name={icon} size={14} color="var(--ink-3)" />
        <span className="flex-1 min-w-0">
          <span className="block truncate text-[13px]" style={{ color: "var(--ink)" }}>{primary}</span>
          {secondary ? (
            <span className="block truncate text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              {secondary}
            </span>
          ) : null}
        </span>
      </button>
      {accessory}
    </div>
  );
}

function SectionDivider() {
  return <div className="border-t" style={{ borderColor: "var(--hairline)" }} />;
}

// ---------------------------------------------------------------------------
// CommandPalette
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const { projects, drives } = useCatalogStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const { projectResults, driveResults } = useCommandPaletteSearch(projects, drives, query);

  const recentProjects = useMemo(
    () =>
      [...projects]
        .filter((p) => Boolean(p.openedAt))
        .sort((a, b) => (b.openedAt ?? "").localeCompare(a.openedAt ?? ""))
        .slice(0, 5),
    [projects]
  );

  // Reset query when palette closes
  useEffect(() => {
    if (!isOpen) setQuery("");
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const isSearching = query.length >= MIN_QUERY_LENGTH;
  const hasProjectResults = projectResults.length > 0;
  const hasDriveResults = driveResults.length > 0;
  const noResults = isSearching && !hasProjectResults && !hasDriveResults;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center"
      style={{
        background: "rgba(17, 17, 17, 0.28)",
        backdropFilter: "blur(4px)",
        paddingTop: "20vh"
      }}
      onClick={close}
    >
      <div
        className="w-[600px] max-w-[90vw] overflow-hidden rounded-[14px] border"
        style={{
          background: "var(--surface)",
          borderColor: "var(--hairline)",
          boxShadow: "0 8px 40px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.08)"
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-2.5 px-4 py-3"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <Icon name="search" size={15} color="var(--ink-3)" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, drives, or actions…"
            autoFocus
            aria-label="Command palette search"
            className="flex-1 bg-transparent text-[13.5px] outline-none"
            style={{ color: "var(--ink)" }}
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear"
              className="btn btn-ghost btn-sm shrink-0"
              style={{ padding: "4px", minHeight: 0 }}
              onClick={() => setQuery("")}
            >
              <Icon name="close" size={11} color="var(--ink-3)" />
            </button>
          ) : null}
        </div>

        {/* Result list */}
        <div className="max-h-[420px] overflow-y-auto py-1.5">

          {/* Project results */}
          {isSearching && hasProjectResults ? (
            <section>
              <SectionLabel>Projects</SectionLabel>
              <ul aria-label="Project results">
                {projectResults.map((project) => {
                  const drive = drives.find((d) => d.id === project.currentDriveId);
                  const name = getDisplayProject(project);
                  const date = getDisplayDate(project);
                  const driveName = drive?.displayName ?? "Unassigned";
                  const secondary = date ? `${driveName} · ${date}` : driveName;

                  return (
                    <li key={project.id}>
                      <ResultRow
                        icon="folder"
                        primary={name}
                        secondary={secondary}
                        onClick={() => { navigate(`/projects/${project.id}`); close(); }}
                        accessory={project.folderPath ? (
                          <button
                            type="button"
                            aria-label="Show in Finder"
                            title="Show in Finder"
                            onClick={(e) => {
                              e.stopPropagation();
                              void showPathInFinder(project.folderPath);
                              close();
                            }}
                            className="btn btn-ghost btn-sm shrink-0 opacity-0 group-focus-within:opacity-100"
                            style={{ padding: "4px", minHeight: 0, color: "var(--ink-3)" }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = ""; }}
                            onFocus={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                            onBlur={(e) => { (e.currentTarget as HTMLElement).style.opacity = ""; }}
                          >
                            <Icon name="folderOpen" size={13} color="currentColor" />
                          </button>
                        ) : null}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* Drive results */}
          {isSearching && hasDriveResults ? (
            <section>
              {hasProjectResults ? <SectionDivider /> : null}
              <SectionLabel>Drives</SectionLabel>
              <ul aria-label="Drive results">
                {driveResults.map((drive) => {
                  const count = projects.filter((p) => p.currentDriveId === drive.id).length;
                  return (
                    <li key={drive.id}>
                      <ResultRow
                        icon="hardDrive"
                        primary={drive.displayName}
                        secondary={`${count} ${count === 1 ? "project" : "projects"}`}
                        onClick={() => { navigate(`/drives/${drive.id}`); close(); }}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* No results state */}
          {noResults ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                No results for &ldquo;{query}&rdquo;
              </p>
            </div>
          ) : null}

          {/* Default state: pinned actions + recent */}
          {!isSearching ? (
            <>
              <ul aria-label="Pinned actions">
                {PINNED_ACTIONS.map((action) => (
                  <li key={action.id}>
                    <ResultRow
                      icon={action.icon}
                      primary={action.label}
                      onClick={() => { action.onSelect(navigate); close(); }}
                    />
                  </li>
                ))}
              </ul>

              {recentProjects.length > 0 ? (
                <section>
                  <SectionDivider />
                  <SectionLabel>Recent</SectionLabel>
                  <ul aria-label="Recent projects">
                    {recentProjects.map((project) => {
                      const drive = drives.find((d) => d.id === project.currentDriveId);
                      const name = getDisplayProject(project);
                      const date = getDisplayDate(project);
                      const driveName = drive?.displayName ?? "Unassigned";
                      const secondary = date ? `${driveName} · ${date}` : driveName;

                      return (
                        <li key={project.id}>
                          <ResultRow
                            icon="clock"
                            primary={name}
                            secondary={secondary}
                            onClick={() => { navigate(`/projects/${project.id}`); close(); }}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
