use serde::Serialize;
use std::{fs, path::PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameFolderResult {
    pub original_path: String,
    pub renamed_path: String,
    pub folder_name: String,
}

#[tauri::command]
pub fn rename_project_folder(
    folder_path: String,
    suggested_name: String,
) -> Result<RenameFolderResult, String> {
    let source = PathBuf::from(folder_path.trim());
    let folder_name = suggested_name.trim();

    if folder_name.is_empty() {
        return Err("The suggested folder name is empty.".to_string());
    }
    if folder_name == "." || folder_name == ".." || folder_name.contains('/') || folder_name.contains('\0') {
        return Err("The suggested folder name is not a safe single folder name.".to_string());
    }
    if !source.exists() {
        return Err(format!("The source folder does not exist: {}", source.display()));
    }
    if !source.is_dir() {
        return Err(format!("The source path is not a folder: {}", source.display()));
    }

    let parent = source
        .parent()
        .ok_or_else(|| "The source folder has no parent directory.".to_string())?;
    let destination = parent.join(folder_name);

    if destination == source {
        return Err("The folder already has the suggested name.".to_string());
    }
    if destination.exists() {
        return Err(format!(
            "A folder with the suggested name already exists: {}",
            destination.display()
        ));
    }

    fs::rename(&source, &destination).map_err(|error| {
        format!(
            "Could not rename {} to {}: {error}",
            source.display(),
            destination.display()
        )
    })?;

    Ok(RenameFolderResult {
        original_path: source.to_string_lossy().to_string(),
        renamed_path: destination.to_string_lossy().to_string(),
        folder_name: folder_name.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn renames_folder_within_same_parent() {
        let temp = tempdir().expect("tempdir");
        let source = temp.path().join("240401_Apple_ProductShoot");
        fs::create_dir(&source).expect("source");

        let result = rename_project_folder(
            source.to_string_lossy().to_string(),
            "2024-04-01_Apple - ProductShoot".to_string(),
        )
        .expect("rename");

        assert!(!source.exists());
        assert!(PathBuf::from(&result.renamed_path).exists());
        assert_eq!(result.folder_name, "2024-04-01_Apple - ProductShoot");
    }

    #[test]
    fn rejects_existing_destination() {
        let temp = tempdir().expect("tempdir");
        let source = temp.path().join("source");
        let destination = temp.path().join("destination");
        fs::create_dir(&source).expect("source");
        fs::create_dir(&destination).expect("destination");

        let error = rename_project_folder(
            source.to_string_lossy().to_string(),
            "destination".to_string(),
        )
        .expect_err("conflict");

        assert!(source.exists());
        assert!(destination.exists());
        assert!(error.contains("already exists"));
    }
}
