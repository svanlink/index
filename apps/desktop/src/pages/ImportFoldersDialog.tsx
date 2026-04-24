import { useEffect, useMemo, useRef, type ReactNode } from "react";
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
// clicks. That keeps the dedup preview (existingPathsOnDrive) trivially
// testable — just pass a different set and re-render.
// ---------------------------------------------------------------------------

export interface ImportFoldersDialogProps {
  sourcePath: string;
  /** Alphabetically-sorted list returned by `enumerateVolumeFolders`. */
  folders: VolumeFolderEntry[];
  /**
   * Absolute paths that already exist on the target drive. Folders in this
   * set are greyed out and labelled "already in catalog" so the user sees
   * upfront what the import will actually create. The repository dedups on
   * the same key, so this preview cannot drift from the persisted outcome.
   */
  existingPathsOnDrive: Set<string>;
  isImporting: boolean;
  onConfirm(): void;
  onCancel(): void;
  /**
   * Re-open the native picker without dismissing the modal. Useful when the
   * user realises they selected the wrong folder — saves one extra click
   * vs. cancel → reopen.
   */
  onPickAgain(): void;
  /**
   * Optional banner rendered between the source-path line and the import
   * summary. The top-level "Import from mounted volume" flow uses this to
   * tell the user which drive the folders will land on — whether it's an
   * existing catalog entry or a new drive about to be created. Keeping this
   * as a slot (rather than baking the drive concept into the dialog) lets
   * the per-drive-detail flow stay context-free.
   */
  contextBanner?: ReactNode;
}

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

  const canConfirm = !isImporting && newFolders.length > 0;

  // Escape to close, Enter to confirm — matches ConfirmModal's UX.
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

  // Auto-focus so keyboard events reach the handler above.
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
              aria-label="Close"
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

          {folders.length === 0 ? (
            <div
              className="mt-4 rounded-[12px] px-4 py-4 text-[12.5px] leading-[1.5]"
              style={{
                background: "var(--surface-inset)",
                color: "var(--ink-3)"
              }}
            >
              No folders were found at this location. Hidden files, system
              folders (<code className="mono" style={{ color: "var(--ink-2)" }}>.Spotlight-V100</code>,{" "}
              <code className="mono" style={{ color: "var(--ink-2)" }}>.Trashes</code>, …) and files are filtered automatically.
            </div>
          ) : (
            <div
              className="mt-4 max-h-[360px] overflow-y-auto rounded-[12px] border"
              style={{ borderColor: "var(--hairline)" }}
            >
              <ul className="flex flex-col">
                {folders.map((folder, index) => {
                  const isDuplicate = existingPathsOnDrive.has(folder.path);
                  const isLast = index === folders.length - 1;
                  return (
                    <li
                      key={folder.path}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                      style={{
                        borderBottom: isLast ? undefined : "1px solid var(--hairline)",
                        background: "transparent",
                        opacity: isDuplicate ? 0.52 : 1
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
                        <span
                          className="shrink-0 text-[11px]"
                          style={{ color: "var(--ink-3)" }}
                        >
                          In catalog
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
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

/**
 * Summary line above the folder list. Splits the "new" and "skipped" counts
 * into a quiet definition-list pair so scanning the state of the import is
 * a single glance rather than a paragraph of prose.
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
