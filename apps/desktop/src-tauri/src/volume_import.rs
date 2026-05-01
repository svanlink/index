//! # Volume Import — Read-Only Folder Enumeration
//!
//! This module enumerates the immediate child directories of a user-selected
//! path (typically a mounted volume such as `/Volumes/<drive>`) so the desktop
//! app can preview which folder names a user intends to import into the
//! catalog. The caller then chooses whether to persist the selection.
//!
//! ## Safety contract
//!
//! Like `scan_engine.rs`, this module is **read-only with respect to the
//! filesystem**. It may only:
//!
//! - Read directory entries (`fs::read_dir`)
//! - Read entry file types (`DirEntry::file_type`)
//!
//! It must **never** rename, move, copy, delete, or create anything on disk.
//! Folder corrections and imports happen purely as database metadata through
//! the repository layer — nothing here touches the volume.
//!
//! ## Depth
//!
//! Enumeration is strictly a single-level sweep: only the immediate children
//! of `root_path` are returned. Nested subdirectories are not walked, mirroring
//! the scan engine's `MAX_SCAN_DEPTH = 1` contract. This keeps semantics
//! predictable and avoids surprising the user with a large recursive listing.
//!
//! ## Filtering
//!
//! - Any entry whose name starts with `.` is skipped (macOS hidden files,
//!   `.Spotlight-V100`, `.Trashes`, `.fseventsd`, …).
//! - A small deny-list of well-known system / recovery folders is also
//!   skipped — kept in sync with `scan_engine.rs::IGNORED_SYSTEM_FOLDERS`.
//! - Symlinks are skipped (`file_type().is_dir()` returns `false` for
//!   symlinks because it reports the link type, not the target).
//! - Only directories are returned; files are ignored silently.
//!
//! ## Ordering
//!
//! Results are sorted by `name` using ASCII-case-insensitive comparison so
//! the preview UI shows a stable, human-friendly alphabetic list regardless
//! of the filesystem's native enumeration order (APFS, HFS+, and ExFAT all
//! differ here).

#![cfg_attr(not(test), deny(clippy::disallowed_methods))]

use serde::Serialize;
use std::{fs, path::Path};

/// System / recovery folders skipped across every OS. Kept in lock-step with
/// `scan_engine.rs::IGNORED_SYSTEM_FOLDERS` so the scan and import paths agree
/// on what counts as "not a project folder."
const IGNORED_SYSTEM_FOLDERS: &[&str] = &[
    // Windows
    "$RECYCLE.BIN",
    "System Volume Information",
    // macOS
    ".Spotlight-V100",
    ".Trashes",
    ".fseventsd",
    // Camera / memory card system folders
    "DCIM",
    "MISC",
    // Unix filesystem recovery
    "LOST+FOUND",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeFolderEntry {
    /// Folder name as reported by the OS (the last path component).
    pub name: String,
    /// Absolute path on disk for this folder. The caller persists this as the
    /// project's `folderPath` so later imports from the same location dedup
    /// cleanly on a stable key.
    pub path: String,
}

#[tauri::command]
pub fn enumerate_volume_folders(path: String) -> Result<Vec<VolumeFolderEntry>, String> {
    let root_path = Path::new(&path);

    if !root_path.exists() {
        return Err(format!(
            "The selected path is not available: {path}. If this is an external volume, reconnect it and try again."
        ));
    }
    if !root_path.is_dir() {
        return Err(format!("The selected path is not a directory: {path}"));
    }

    let entries =
        fs::read_dir(root_path).map_err(|error| format!("Could not read {path}: {error}"))?;

    let mut folders: Vec<VolumeFolderEntry> = Vec::new();

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            // Skip entries we cannot read rather than failing the whole listing —
            // a single bad directory entry should not blank the preview.
            Err(_) => continue,
        };

        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => continue,
        };

        // Only real directories. `file_type().is_dir()` is false for symlinks
        // (it reports the link type, not the target), which matches the scan
        // engine's intentional symlink skip.
        if !file_type.is_dir() {
            continue;
        }

        let folder_name = entry.file_name().to_string_lossy().to_string();
        if should_ignore_directory(&folder_name) {
            continue;
        }

        folders.push(VolumeFolderEntry {
            name: folder_name,
            path: entry.path().to_string_lossy().to_string(),
        });
    }

    // ASCII-case-insensitive ordering so "Archive" and "archive" sit next to
    // each other. Non-ASCII characters fall back to their byte order, which is
    // acceptable for a preview list — users can still scan the list visually.
    folders.sort_by(|a, b| {
        a.name
            .to_ascii_lowercase()
            .cmp(&b.name.to_ascii_lowercase())
    });

    Ok(folders)
}

fn should_ignore_directory(name: &str) -> bool {
    name.starts_with('.') || IGNORED_SYSTEM_FOLDERS.contains(&name)
}

#[cfg(test)]
#[allow(clippy::disallowed_methods)] // test fixtures legitimately create temp directories
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn returns_only_immediate_child_directories_sorted() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path();

        fs::create_dir(root.join("Zeta")).unwrap();
        fs::create_dir(root.join("alpha")).unwrap();
        fs::create_dir(root.join("Beta")).unwrap();
        fs::write(root.join("loose-file.txt"), b"x").unwrap();

        // A nested directory that must NOT appear in results.
        let nested_parent = root.join("Beta");
        fs::create_dir(nested_parent.join("inner")).unwrap();

        let result = enumerate_volume_folders(root.to_string_lossy().to_string()).unwrap();

        let names: Vec<_> = result.iter().map(|entry| entry.name.as_str()).collect();
        assert_eq!(names, vec!["alpha", "Beta", "Zeta"]);

        // Paths are absolute and resolvable.
        for entry in &result {
            assert!(
                Path::new(&entry.path).is_dir(),
                "returned path should be a real directory"
            );
        }
    }

    #[test]
    fn filters_hidden_and_system_folders() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path();

        fs::create_dir(root.join(".Spotlight-V100")).unwrap();
        fs::create_dir(root.join(".Trashes")).unwrap();
        fs::create_dir(root.join(".fseventsd")).unwrap();
        fs::create_dir(root.join(".hidden")).unwrap();
        fs::create_dir(root.join("DCIM")).unwrap();
        fs::create_dir(root.join("LOST+FOUND")).unwrap();
        fs::create_dir(root.join("$RECYCLE.BIN")).unwrap();
        fs::create_dir(root.join("RealFolder")).unwrap();

        let result = enumerate_volume_folders(root.to_string_lossy().to_string()).unwrap();
        let names: Vec<_> = result.iter().map(|entry| entry.name.as_str()).collect();
        assert_eq!(names, vec!["RealFolder"]);
    }

    #[test]
    fn errors_on_missing_path() {
        let temp = tempdir().expect("tempdir");
        let missing = temp.path().join("definitely-not-here");
        let result = enumerate_volume_folders(missing.to_string_lossy().to_string());
        assert!(result.is_err());
        let message = result.unwrap_err();
        assert!(
            message.contains("not available"),
            "error should mention unavailability, got: {message}"
        );
    }

    #[test]
    fn errors_on_file_instead_of_directory() {
        let temp = tempdir().expect("tempdir");
        let file_path = temp.path().join("a-file.txt");
        fs::write(&file_path, b"x").unwrap();
        let result = enumerate_volume_folders(file_path.to_string_lossy().to_string());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not a directory"));
    }

    #[test]
    fn returns_empty_list_for_empty_directory() {
        let temp = tempdir().expect("tempdir");
        let result = enumerate_volume_folders(temp.path().to_string_lossy().to_string()).unwrap();
        assert!(result.is_empty());
    }
}
