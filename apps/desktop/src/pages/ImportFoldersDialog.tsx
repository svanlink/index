import { useEffect, useMemo, useRef, type ReactNode } from "react";
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

  const importSummary =
    newFolders.length === 0
      ? "All folders here are already in the catalog."
      : `${newFolders.length} new folder${newFolders.length === 1 ? "" : "s"} will be added.${
          duplicateFolders.length > 0
            ? ` ${duplicateFolders.length} already in catalog will be skipped.`
            : ""
        }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0, 0, 0, 0.25)" }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        className="app-panel w-full max-w-2xl p-5"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-folders-dialog-title"
        tabIndex={-1}
      >
        <h3
          id="import-folders-dialog-title"
          className="text-[15px] font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          Review folders to import
        </h3>
        <p
          className="mt-1 text-[12px] break-all"
          style={{ color: "var(--color-text-muted)" }}
        >
          From <span className="font-medium" style={{ color: "var(--color-text)" }}>{sourcePath}</span>
        </p>
        {contextBanner ? <div className="mt-2">{contextBanner}</div> : null}
        <p className="mt-2 text-[13px] leading-snug" style={{ color: "var(--color-text-muted)" }}>
          {importSummary}
        </p>

        {folders.length === 0 ? (
          <div
            className="mt-4 rounded-md border px-3 py-4 text-[13px]"
            style={{
              borderColor: "var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text-muted)"
            }}
          >
            No folders were found at this location. Hidden files, system
            folders (<code>.Spotlight-V100</code>, <code>.Trashes</code>, …)
            and files are filtered automatically.
          </div>
        ) : (
          <div
            className="mt-4 max-h-80 overflow-y-auto rounded-md border"
            style={{ borderColor: "var(--color-border)" }}
          >
            <ul>
              {folders.map((folder) => {
                const isDuplicate = existingPathsOnDrive.has(folder.path);
                return (
                  <li
                    key={folder.path}
                    className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0"
                    style={{
                      borderColor: "var(--color-border)",
                      background: "var(--color-surface)",
                      opacity: isDuplicate ? 0.55 : 1
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-[13px] font-medium"
                        style={{ color: "var(--color-text)" }}
                        title={folder.name}
                      >
                        {folder.name}
                      </p>
                      <p
                        className="truncate text-[11px]"
                        style={{ color: "var(--color-text-muted)" }}
                        title={folder.path}
                      >
                        {folder.path}
                      </p>
                    </div>
                    {isDuplicate ? (
                      <span
                        className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
                        style={{
                          borderColor: "var(--color-border)",
                          color: "var(--color-text-soft)"
                        }}
                      >
                        Already in catalog
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className="button-secondary"
            onClick={onPickAgain}
            disabled={isImporting}
          >
            Pick different folder
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={onCancel}
            disabled={isImporting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {isImporting
              ? "Importing…"
              : newFolders.length === 0
                ? "Nothing to import"
                : `Import ${newFolders.length} folder${newFolders.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
