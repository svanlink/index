import { useCallback, useState } from "react";
import type { Drive, Project } from "@drive-project-catalog/domain";
import type { CreateDriveInput, ImportFoldersFromVolumeInput, ImportFoldersFromVolumeResult } from "@drive-project-catalog/data";
import { getVolumeInfo, isDesktopScanAvailable, type VolumeInfo } from "./scanCommands";
import {
  enumerateVolumeFolders,
  pickVolumeRoot,
  type VolumeFolderEntry
} from "./volumeImportCommands";
import type { FeedbackState } from "../pages/feedbackHelpers";

export interface UseImportFromVolumeReturn {
  importSourcePath: string | null;
  importFolders: VolumeFolderEntry[] | null;
  importVolumeInfo: VolumeInfo | null;
  isPickingImport: boolean;
  isImporting: boolean;
  matchedDrive: Drive | null;
  previewExistingPaths: Set<string>;
  previewDriveName: string;
  canUseImport: boolean;
  runImportFromVolume(): Promise<void>;
  closeImportDialog(): void;
  handleConfirmImportFromVolume(): Promise<void>;
}

interface UseImportFromVolumeOptions {
  drives: Drive[];
  projects: Project[];
  createDrive: (input: CreateDriveInput) => Promise<Drive>;
  importFoldersFromVolume: (input: ImportFoldersFromVolumeInput) => Promise<ImportFoldersFromVolumeResult>;
  navigate: (path: string) => void;
  setFeedback: (f: NonNullable<FeedbackState>) => void;
}

function deriveVolumeName(sourcePath: string, volumeInfo: VolumeInfo | null): string {
  if (volumeInfo?.volumeName) return volumeInfo.volumeName;
  const cleaned = sourcePath.replace(/\/+$/, "");
  const lastSlash = cleaned.lastIndexOf("/");
  const basename = lastSlash >= 0 ? cleaned.slice(lastSlash + 1) : cleaned;
  return basename.trim() || "Imported volume";
}

export function useImportFromVolume({
  drives,
  projects,
  createDrive,
  importFoldersFromVolume,
  navigate,
  setFeedback,
}: UseImportFromVolumeOptions): UseImportFromVolumeReturn {
  // State machine phases:
  //   idle:        importSourcePath === null
  //   enumerating: isPickingImport === true
  //   preview:     importSourcePath && importFolders !== null
  //   importing:   isImporting === true
  const [importSourcePath, setImportSourcePath] = useState<string | null>(null);
  const [importFolders, setImportFolders] = useState<VolumeFolderEntry[] | null>(null);
  const [importVolumeInfo, setImportVolumeInfo] = useState<VolumeInfo | null>(null);
  const [isPickingImport, setIsPickingImport] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const closeImportDialog = useCallback(() => {
    setImportSourcePath(null);
    setImportFolders(null);
    setImportVolumeInfo(null);
  }, []);

  const runImportFromVolume = useCallback(async () => {
    setIsPickingImport(true);
    try {
      const selection = await pickVolumeRoot(null);
      if (!selection) return;

      const [volumeInfo, folders] = await Promise.all([
        getVolumeInfo(selection),
        enumerateVolumeFolders(selection)
      ]);

      setImportSourcePath(selection);
      setImportFolders(folders);
      setImportVolumeInfo(volumeInfo);
    } catch (error) {
      closeImportDialog();
      setFeedback({
        tone: "error",
        title: "Could not read folders",
        messages: [error instanceof Error ? error.message : "The selected location could not be read."]
      });
    } finally {
      setIsPickingImport(false);
    }
  }, [closeImportDialog, setFeedback]);

  const handleConfirmImportFromVolume = useCallback(async () => {
    if (!importSourcePath || !importFolders) return;
    setIsImporting(true);
    try {
      const matched = drives.find((d) => importVolumeInfo && d.volumeName === importVolumeInfo.volumeName) ?? null;
      const driveToUse =
        matched ??
        (await createDrive({
          volumeName: deriveVolumeName(importSourcePath, importVolumeInfo),
          displayName: null,
          totalCapacityBytes: importVolumeInfo?.totalBytes ?? null
        }));

      const result = await importFoldersFromVolume({
        driveId: driveToUse.id,
        sourcePath: importSourcePath,
        folders: importFolders
      });

      closeImportDialog();
      navigate(`/drives/${driveToUse.id}`);

      if (result.importedCount === 0) {
        setFeedback({
          tone: "info",
          title: matched ? "No new folders imported" : "Drive added (no folders imported)",
          messages: [
            result.skippedCount > 0
              ? `${result.skippedCount} folder${result.skippedCount === 1 ? " was" : "s were"} already in the catalog and skipped.`
              : "The selected location had no importable folders."
          ]
        });
      } else {
        const parts = [
          matched
            ? `${result.importedCount} folder${result.importedCount === 1 ? "" : "s"} added to "${driveToUse.displayName}".`
            : `Created "${driveToUse.displayName}" and imported ${result.importedCount} folder${result.importedCount === 1 ? "" : "s"}.`
        ];
        if (result.skippedCount > 0) {
          parts.push(`${result.skippedCount} already in catalog were skipped.`);
        }
        setFeedback({
          tone: "success",
          title: matched ? "Folders imported" : "Drive imported",
          messages: parts
        });
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        title: "Import failed",
        messages: [error instanceof Error ? error.message : "The folders could not be imported."]
      });
    } finally {
      setIsImporting(false);
    }
  }, [importSourcePath, importFolders, importVolumeInfo, drives, createDrive, importFoldersFromVolume, closeImportDialog, navigate, setFeedback]);

  const matchedDrive = importVolumeInfo
    ? (drives.find((d) => d.volumeName === importVolumeInfo.volumeName) ?? null)
    : null;

  const previewExistingPaths = (() => {
    if (!matchedDrive) return new Set<string>();
    const set = new Set<string>();
    for (const project of projects) {
      if (project.currentDriveId === matchedDrive.id && project.folderPath) {
        set.add(project.folderPath);
      }
    }
    return set;
  })();

  const previewDriveName = importVolumeInfo
    ? importVolumeInfo.volumeName
    : importSourcePath
      ? deriveVolumeName(importSourcePath, null)
      : "";

  const canUseImport = isDesktopScanAvailable();

  return {
    importSourcePath,
    importFolders,
    importVolumeInfo,
    isPickingImport,
    isImporting,
    matchedDrive,
    previewExistingPaths,
    previewDriveName,
    canUseImport,
    runImportFromVolume,
    closeImportDialog,
    handleConfirmImportFromVolume,
  };
}
