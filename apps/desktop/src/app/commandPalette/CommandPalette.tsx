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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm"
      style={{ paddingTop: "20vh" }}
      onClick={close}
    >
      <div
        className="w-[600px] max-w-[90vw] overflow-hidden rounded-xl border shadow-2xl"
        style={{
          background: "var(--color-surface)",
          borderColor: "var(--color-border)"
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-2 px-4 py-3 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <Icon name="search" size={16} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, drives, or actions"
            autoFocus
            aria-label="Command palette search"
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "var(--color-text)" }}
          />
        </div>

        {/* Project results */}
        {isSearching && hasProjectResults && (
          <section>
            <div
              className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider"
              style={{ color: "var(--color-text-muted, var(--color-text))", opacity: 0.5 }}
            >
              Projects
            </div>
            <ul aria-label="Project results">
              {projectResults.map((project) => {
                const drive = drives.find((d) => d.id === project.currentDriveId);
                const name = getDisplayProject(project);
                const date = getDisplayDate(project);
                const driveName = drive?.displayName ?? "Unassigned";

                return (
                  <li key={project.id}>
                    <div className="flex items-center gap-1 px-4 hover:bg-white/5">
                      <button
                        type="button"
                        onClick={() => {
                          navigate(`/projects/${project.id}`);
                          close();
                        }}
                        className="flex flex-1 items-center gap-3 py-2.5 text-left min-w-0"
                        style={{ color: "var(--color-text)" }}
                      >
                        <Icon name="folder" size={14} />
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-[13px]">{name}</span>
                          <span
                            className="block truncate text-[11px]"
                            style={{ opacity: 0.55 }}
                          >
                            {driveName}
                            {date ? ` · ${date}` : ""}
                          </span>
                        </span>
                      </button>
                      {project.folderPath ? (
                        <button
                          type="button"
                          aria-label="Show in Finder"
                          title="Show in Finder"
                          onClick={(e) => {
                            e.stopPropagation();
                            void showPathInFinder(project.folderPath);
                            close();
                          }}
                          className="shrink-0 rounded p-1 opacity-0 hover:opacity-100 focus:opacity-100"
                          style={{ color: "var(--color-text)" }}
                        >
                          <Icon name="folderOpen" size={13} />
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Drive results */}
        {isSearching && hasDriveResults && (
          <section>
            <div
              className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider border-t"
              style={{
                color: "var(--color-text-muted, var(--color-text))",
                opacity: 0.5,
                borderColor: "var(--color-border)"
              }}
            >
              Drives
            </div>
            <ul aria-label="Drive results">
              {driveResults.map((drive) => {
                const count = projects.filter((p) => p.currentDriveId === drive.id).length;

                return (
                  <li key={drive.id}>
                    <button
                      type="button"
                      onClick={() => {
                        navigate(`/drives/${drive.id}`);
                        close();
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5"
                      style={{ color: "var(--color-text)" }}
                    >
                      <Icon name="hardDrive" size={14} />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-[13px]">{drive.displayName}</span>
                        <span
                          className="block truncate text-[11px]"
                          style={{ opacity: 0.55 }}
                        >
                          {count} {count === 1 ? "project" : "projects"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* No results state */}
        {noResults && (
          <div
            className="px-4 py-6 text-center text-[13px]"
            style={{ opacity: 0.5, color: "var(--color-text)" }}
          >
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {/* Default state: pinned actions + recent (shown when not searching) */}
        {!isSearching && (
          <>
            <ul aria-label="Pinned actions" className="py-1">
              {PINNED_ACTIONS.map((action) => (
                <li key={action.id}>
                  <button
                    type="button"
                    onClick={() => {
                      action.onSelect(navigate);
                      close();
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] hover:bg-white/5"
                    style={{ color: "var(--color-text)" }}
                  >
                    <Icon name={action.icon} size={16} />
                    <span>{action.label}</span>
                  </button>
                </li>
              ))}
            </ul>

            {recentProjects.length > 0 && (
              <section>
                <div
                  className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider border-t"
                  style={{
                    color: "var(--color-text-muted, var(--color-text))",
                    opacity: 0.5,
                    borderColor: "var(--color-border)"
                  }}
                >
                  Recent
                </div>
                <ul aria-label="Recent projects">
                  {recentProjects.map((project) => {
                    const drive = drives.find((d) => d.id === project.currentDriveId);
                    const name = getDisplayProject(project);
                    const date = getDisplayDate(project);
                    const driveName = drive?.displayName ?? "Unassigned";

                    return (
                      <li key={project.id}>
                        <button
                          type="button"
                          onClick={() => {
                            navigate(`/projects/${project.id}`);
                            close();
                          }}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5"
                          style={{ color: "var(--color-text)" }}
                        >
                          <Icon name="clock" size={14} />
                          <span className="flex-1 min-w-0">
                            <span className="block truncate text-[13px]">{name}</span>
                            <span
                              className="block truncate text-[11px]"
                              style={{ opacity: 0.55 }}
                            >
                              {driveName}
                              {date ? ` · ${date}` : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
