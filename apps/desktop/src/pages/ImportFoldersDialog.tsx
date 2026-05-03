import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@drive-project-catalog/ui";
import type { VolumeFolderEntry } from "../app/volumeImportCommands";

// ---------------------------------------------------------------------------
// ImportFoldersDialog
// ---------------------------------------------------------------------------
//
// Preview modal for the "Import folders from volume" flow. The parent page
// picks a directory via the native dialog, invokes the Rust enumeration
// command, and then shows this component with the resulting list. The user
// confirms the import, cancels, or triggers a re-pick from this modal.
//
// Stateless by design: the parent owns loading/error/empty state. This
// component only visualises the list + drives keyboard shortcuts and button
// clicks.
// ---------------------------------------------------------------------------

export interface ImportFoldersDialogProps {
  sourcePath: string;
  /** Alphabetically-sorted list returned by `enumerateVolumeFolders`. */
  folders: VolumeFolderEntry[];
  /**
   * Absolute paths that already exist on the target drive. Folders in this
   * set are greyed out and labelled "already in catalog" so the user sees
   * upfront what the import will actually create.
   */
  existingPathsOnDrive: Set<string>;
  isImporting: boolean;
  onConfirm(): void;
  onCancel(): void;
  /**
   * Re-open the native picker without dismissing the modal.
   */
  onPickAgain(): void;
  /**
   * Optional banner rendered between the source-path line and the import
   * summary.
   */
  contextBanner?: ReactNode;
}

// Threshold above which the inline search input appears
const SEARCH_THRESHOLD = 7;

export function ImportFoldersDialog({
  sourcePath,
  folders,
  existingPathsOnDrive,
  isImporting,
  onConfirm,
  onCancel,
  onPickAgain,
  contextBanner
}: ImportFoldersDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");

  const { newFolders, duplicateFolders } = useMemo(() => {
    const newOnes: VolumeFolderEntry[] = [];
    const duplicates: VolumeFolderEntry[] = [];
    for (const folder of folders) {
      if (existingPathsOnDrive.has(folder.path)) {
        duplicates.push(folder);
      } else {
        newOnes.push(folder);
      }
    }
    return { newFolders: newOnes, duplicateFolders: duplicates };
  }, [folders, existingPathsOnDrive]);

  // D2: Inline search filter
  const searchTrimmed = search.trim().toLowerCase();
  const filteredNew = searchTrimmed
    ? newFolders.filter(
        (f) =>
          f.name.toLowerCase().includes(searchTrimmed) ||
          f.path.toLowerCase().includes(searchTrimmed)
      )
    : newFolders;
  const filteredDup = searchTrimmed
    ? duplicateFolders.filter(
        (f) =>
          f.name.toLowerCase().includes(searchTrimmed) ||
          f.path.toLowerCase().includes(searchTrimmed)
      )
    : duplicateFolders;

  const canConfirm = !isImporting && newFolders.length > 0;
  const showSearch = folders.length >= SEARCH_THRESHOLD;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
      if (event.key === "Enter" && canConfirm) {
        event.preventDefault();
        onConfirm();
      }
    }
    const dialog = dialogRef.current;
    dialog?.addEventListener("keydown", handleKeyDown);
    return () => dialog?.removeEventListener("keydown", handleKeyDown);
  }, [canConfirm, onCancel, onConfirm]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(17, 17, 17, 0.32)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        className="app-panel w-full max-w-[640px] overflow-hidden p-0"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-folders-dialog-title"
        tabIndex={-1}
      >
        {/* D3: Header — title + source path + close */}
        <header className="px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3
                id="import-folders-dialog-title"
                className="text-[16px] font-semibold tracking-[-0.015em]"
                style={{ color: "var(--ink)" }}
              >
                Review folders to import
              </h3>
              <p
                className="mono mt-1.5 truncate text-[12px]"
                style={{ color: "var(--ink-3)" }}
                title={sourcePath}
              >
                {sourcePath}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close (Escape)"
              className="btn btn-ghost btn-sm shrink-0"
              onClick={onCancel}
              disabled={isImporting}
              style={{ padding: "6px", minHeight: 0 }}
            >
              <Icon name="close" size={14} color="currentColor" />
            </button>
          </div>
          {contextBanner ? <div className="mt-3">{contextBanner}</div> : null}
        </header>

        <div className="px-6 pb-5">
          <ImportSummary
            newCount={newFolders.length}
            duplicateCount={duplicateFolders.length}
          />

          {/* D2: Inline search — only when list is long enough to warrant it */}
          {showSearch ? (
            <div className="mt-3">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter folders…"
                className="field-shell w-full bg-transparent px-3 py-2 text-[13px] outline-none"
                aria-label="Filter folders"
              />
            </div>
          ) : null}

          {folders.length === 0 ? (
            <div
              className="mt-4 rounded-[12px] px-4 py-4 text-[12.5px] leading-[1.5]"
              style={{ background: "var(--surface-inset)", color: "var(--ink-3)" }}
            >
              No folders were found at this location. Hidden files, system
              folders (<code className="mono" style={{ color: "var(--ink-2)" }}>.Spotlight-V100</code>,{" "}
              <code className="mono" style={{ color: "var(--ink-2)" }}>.Trashes</code>, …) and files are filtered automatically.
            </div>
          ) : (
            /* D1: Split sections — new vs. already-in-catalog */
            <div
              className="mt-4 max-h-[360px] overflow-y-auto rounded-[12px] border"
              style={{ borderColor: "var(--hairline)" }}
            >
              {/* New folders section */}
              {filteredNew.length > 0 ? (
                <>
                  {duplicateFolders.length > 0 ? (
                    <SectionHeader label={`To import — ${filteredNew.length}`} />
                  ) : null}
                  <ul className="flex flex-col">
                    {filteredNew.map((folder, index) => (
                      <FolderRow
                        key={folder.path}
                        folder={folder}
                        isLast={index === filteredNew.length - 1 && filteredDup.length === 0}
                        isDuplicate={false}
                      />
                    ))}
                  </ul>
                </>
              ) : searchTrimmed && newFolders.length > 0 ? (
                <p className="px-4 py-3 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                  No new folders match "{search}".
                </p>
              ) : null}

              {/* Already in catalog section */}
              {filteredDup.length > 0 ? (
                <>
                  <SectionHeader
                    label={`Already in catalog — ${filteredDup.length}`}
                    faded
                  />
                  <ul className="flex flex-col">
                    {filteredDup.map((folder, index) => (
                      <FolderRow
                        key={folder.path}
                        folder={folder}
                        isLast={index === filteredDup.length - 1}
                        isDuplicate
                      />
                    ))}
                  </ul>
                </>
              ) : null}

              {/* No results from search */}
              {searchTrimmed && filteredNew.length === 0 && filteredDup.length === 0 ? (
                <p className="px-4 py-3 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                  No folders match "{search}".
                </p>
              ) : null}
            </div>
          )}
        </div>

        <footer
          className="flex flex-wrap items-center justify-end gap-2 border-t px-6 py-3.5"
          style={{ borderColor: "var(--hairline)", background: "var(--surface-inset)" }}
        >
          <button
            type="button"
            className="btn btn-sm"
            onClick={onPickAgain}
            disabled={isImporting}
          >
            Pick different folder
          </button>
          <div className="flex-1" />
          <button
            type="button"
            className="btn btn-sm"
            onClick={onCancel}
            disabled={isImporting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {isImporting
              ? "Importing…"
              : newFolders.length === 0
                ? "Nothing to import"
                : `Import ${newFolders.length} folder${newFolders.length === 1 ? "" : "s"}`}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ label, faded = false }: { label: string; faded?: boolean }) {
  return (
    <div
      className="border-b px-4 py-2 text-[10.5px] font-medium uppercase tracking-[0.08em]"
      style={{
        borderColor: "var(--hairline)",
        background: "var(--surface-inset)",
        color: faded ? "var(--ink-4)" : "var(--ink-3)"
      }}
    >
      {label}
    </div>
  );
}

function FolderRow({
  folder,
  isLast,
  isDuplicate
}: {
  folder: VolumeFolderEntry;
  isLast: boolean;
  isDuplicate: boolean;
}) {
  return (
    <li
      className="flex items-center justify-between gap-3 px-4 py-2.5"
      style={{
        borderBottom: isLast ? undefined : "1px solid var(--hairline)",
        background: "transparent",
        opacity: isDuplicate ? 0.5 : 1
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Icon
          name="folder"
          size={14}
          color={isDuplicate ? "var(--ink-4)" : "var(--ink-3)"}
        />
        <div className="min-w-0">
          <p
            className="truncate text-[13px] font-medium"
            style={{ color: "var(--ink)" }}
            title={folder.name}
          >
            {folder.name}
          </p>
          <p
            className="mono truncate text-[11px]"
            style={{ color: "var(--ink-4)" }}
            title={folder.path}
          >
            {folder.path}
          </p>
        </div>
      </div>
      {isDuplicate ? (
        <span className="shrink-0 text-[11px]" style={{ color: "var(--ink-3)" }}>
          In catalog
        </span>
      ) : null}
    </li>
  );
}

/**
 * Summary line above the folder list. Splits the "new" and "skipped" counts
 * into a quiet definition-list pair.
 */
function ImportSummary({
  newCount,
  duplicateCount
}: {
  newCount: number;
  duplicateCount: number;
}) {
  if (newCount === 0 && duplicateCount === 0) {
    return null;
  }

  return (
    <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
      <div className="flex items-baseline gap-2">
        <dt
          className="text-[10.5px] font-medium uppercase tracking-[0.08em]"
          style={{ color: "var(--ink-4)" }}
        >
          To import
        </dt>
        <dd
          className="tnum text-[14px] font-semibold"
          style={{ color: newCount === 0 ? "var(--ink-3)" : "var(--ink)" }}
        >
          {newCount}
        </dd>
      </div>
      {duplicateCount > 0 ? (
        <div className="flex items-baseline gap-2">
          <dt
            className="text-[10.5px] font-medium uppercase tracking-[0.08em]"
            style={{ color: "var(--ink-4)" }}
          >
            Already in catalog
          </dt>
          <dd
            className="tnum text-[14px] font-semibold"
            style={{ color: "var(--ink-3)" }}
          >
            {duplicateCount}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
