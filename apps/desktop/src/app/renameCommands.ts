import { invoke } from "@tauri-apps/api/core";

export interface RenameFolderResult {
  originalPath: string;
  renamedPath: string;
  folderName: string;
}

export async function renameProjectFolder(
  folderPath: string,
  suggestedName: string
): Promise<RenameFolderResult> {
  return invoke<RenameFolderResult>("rename_project_folder", {
    folderPath,
    suggestedName
  });
}
