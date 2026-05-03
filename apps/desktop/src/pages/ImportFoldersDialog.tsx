import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@drive-project-catalog/ui";
import type { VolumeFolderEntry } from "../app/volumeImportCommands";
import { useFocusTrap } from "../app/useFocusTrap";

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

  // Focus containment: Tab cycles within the dialog; focus restores on unmount.
  useFocusTrap(dialogRef);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      // Enter only auto-confirms when the dialog container itself is focused
      // (i.e. no descendant button/input holds focus). This prevents Enter on
      // the Cancel button from accidentally triggering the import.
      if (event.key === "Enter" && canConfirm && event.target === dialogRef.current) {
        event.preventDefault();
        onConfirm();
      }
    }
    const dialog = dialogRef.current;
    dialog?.addEventListener("keydown", handleKeyDown);
    return () => dialog?.removeEventListener("keydown", handleKeyDown);
  }, [canConfirm, onCancel, onConfirm]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ padding: 16, background: "rgba(17, 17, 17, 0.22)", backdropFilter: "blur(20px) saturate(1.6)" }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        className="app-panel sheet w-full"
        style={{ maxWidth: 640, overflow: "hidden", padding: 0 }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-folders-dialog-title"
        aria-describedby="import-folders-dialog-source"
        tabIndex={-1}
      >
        {/* D3: Header — title + source path + close */}
        <header style={{ padding: "20px 24px 16px" }}>
          <div className="flex items-start justify-between" style={{ gap: 16 }}>
            <div className="min-w-0 flex-1">
              <h3
                id="import-folders-dialog-title"
                className="font-semibold"
                style={{ fontSize: 16, letterSpacing: "-0.015em", color: "var(--ink)" }}
              >
                Review folders to import
              </h3>
              <div className="flex min-w-0 items-baseline" style={{ marginTop: 6, gap: 8 }}>
                <p
                  id="import-folders-dialog-source"
                  className="mono min-w-0 flex-1 truncate"
                  style={{ fontSize: 12, color: "var(--ink-3)" }}
                  title={sourcePath}
                >
                  {sourcePath}
                </p>
                <button
                  type="button"
                  className="shrink-0"
                  style={{ fontSize: 12, color: "var(--action)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                  onClick={onPickAgain}
                  disabled={isImporting}
                >
                  Change folder
                </button>
              </div>
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
          {contextBanner ? <div style={{ marginTop: 12 }}>{contextBanner}</div> : null}
        </header>

        <div style={{ padding: "0 24px 20px" }}>
          <ImportSummary
            newCount={newFolders.length}
            duplicateCount={duplicateFolders.length}
          />

          {/* D2: Inline search — only when list is long enough to warrant it */}
          {showSearch ? (
            <div style={{ marginTop: 12 }}>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter folders…"
                className="field-shell w-full bg-transparent outline-none"
                style={{ fontSize: 13 }}
                aria-label="Filter folders"
              />
            </div>
          ) : null}

          {folders.length === 0 ? (
            <div
              style={{ marginTop: 16, borderRadius: 12, padding: 16, fontSize: 12, lineHeight: 1.5, background: "var(--surface-inset)", color: "var(--ink-3)" }}
            >
              No folders were found at this location. Hidden files, system
              folders (<code className="mono" style={{ color: "var(--ink-2)" }}>.Spotlight-V100</code>,{" "}
              <code className="mono" style={{ color: "var(--ink-2)" }}>.Trashes</code>, …) and files are filtered automatically.
            </div>
          ) : (
            /* D1: Split sections — new vs. already-in-catalog */
            <div
              className="overflow-y-auto"
              style={{ marginTop: 16, maxHeight: 360, borderRadius: 12, border: "1px solid var(--hairline)" }}
              role="region"
              aria-label="Folders to import"
              tabIndex={0}
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
                <p style={{ padding: "12px 16px", fontSize: 12, color: "var(--ink-3)" }}>
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
                <p style={{ padding: "12px 16px", fontSize: 12, color: "var(--ink-3)" }}>
                  No folders match "{search}".
                </p>
              ) : null}
            </div>
          )}
        </div>

        <footer
          className="flex flex-wrap items-center justify-end"
          style={{ gap: 8, borderTop: "1px solid var(--hairline)", padding: "14px 24px", background: "var(--surface-inset)" }}
        >
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
      style={{
        borderBottom: "1px solid var(--hairline)",
        padding: "8px 16px",
        fontSize: 10.5,
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
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
      className="flex items-center justify-between"
      style={{
        gap: 12,
        padding: "10px 16px",
        borderBottom: isLast ? undefined : "1px solid var(--hairline)",
        background: "transparent",
        opacity: isDuplicate ? 0.5 : 1
      }}
    >
      <div className="flex min-w-0 flex-1 items-center" style={{ gap: 10 }}>
        <Icon
          name="folder"
          size={14}
          color={isDuplicate ? "var(--ink-4)" : "var(--ink-3)"}
        />
        <div className="min-w-0">
          <p
            className="truncate font-medium"
            style={{ fontSize: 13, color: "var(--ink)" }}
            title={folder.name}
          >
            {folder.name}
          </p>
          <p
            className="mono truncate"
            style={{ fontSize: 12, color: "var(--ink-4)" }}
            title={folder.path}
          >
            {folder.path}
          </p>
        </div>
      </div>
      {isDuplicate ? (
        <span className="shrink-0" style={{ fontSize: 12, color: "var(--ink-3)" }}>
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
    <dl className="flex flex-wrap items-baseline" style={{ columnGap: 24, rowGap: 8 }}>
      <div className="flex items-baseline" style={{ gap: 8 }}>
        <dt
          style={{ fontSize: 10.5, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)" }}
        >
          To import
        </dt>
        <dd
          className="tnum font-semibold"
          style={{ fontSize: 14, color: newCount === 0 ? "var(--ink-3)" : "var(--ink)" }}
        >
          {newCount}
        </dd>
      </div>
      {duplicateCount > 0 ? (
        <div className="flex items-baseline" style={{ gap: 8 }}>
          <dt
            style={{ fontSize: 10.5, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)" }}
          >
            Already in catalog
          </dt>
          <dd
            className="tnum font-semibold"
            style={{ fontSize: 14, color: "var(--ink-3)" }}
          >
            {duplicateCount}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
