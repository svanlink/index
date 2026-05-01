//! # Archive Engine
//!
//! Implements the "Finalize & Archive" workflow:
//!
//! 1. Validate the source folder exists and is readable
//! 2. Walk every file, compute SHA-256, record size, build a manifest
//! 3. Write the manifest as `.archive-manifest.json` into the folder
//! 4. Move the folder to the archive root (rename within-device,
//!    copy + remove across-device)
//! 5. Mark the archived tree immutable via `chflags -R uchg`
//!
//! ## Write escape hatch
//!
//! Unlike the scan engine, this module **writes to disk**. The crate-wide
//! `.clippy.toml` bans `std::fs::write`, `std::fs::rename`, `std::fs::copy`,
//! `std::fs::remove_dir_all`, etc. — those bans exist to protect the import
//! path, which is read-only by contract. The archive path is a deliberate,
//! explicit user-initiated mutation, so we lift the lint at module scope.
//!
//! Any new write operation added here should be justified in a commit message
//! and covered by tests.

#![allow(clippy::disallowed_methods)]

use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::Command,
};

const MANIFEST_FILE_NAME: &str = ".archive-manifest.json";
const HASH_CHUNK_BYTES: usize = 64 * 1024;
/// POSIX `EXDEV` — `rename` across filesystems is not allowed.
const EXDEV: i32 = 18;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEntry {
    pub relative_path: String,
    pub sha256: String,
    pub size_bytes: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveManifest {
    pub generated_at: String,
    pub folder_name: String,
    pub total_files: u64,
    pub total_bytes: u64,
    pub entries: Vec<ManifestEntry>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveResult {
    pub original_path: String,
    pub archived_path: String,
    pub manifest_path: String,
    pub total_files: u64,
    pub total_bytes: u64,
    pub locked: bool,
}

/// Tauri command — archive a project folder.
///
/// `folder_path` is the absolute source folder. `archive_root` is the
/// directory into which the folder will be moved. `lock_after_archive`
/// defaults to `true` and controls whether `chflags uchg` is applied.
#[tauri::command]
pub async fn archive_project(
    folder_path: String,
    archive_root: String,
    lock_after_archive: Option<bool>,
) -> Result<ArchiveResult, String> {
    let lock = lock_after_archive.unwrap_or(true);
    tauri::async_runtime::spawn_blocking(move || archive_blocking(folder_path, archive_root, lock))
        .await
        .map_err(|e| format!("archive task join error: {e}"))?
}

fn archive_blocking(
    folder_path: String,
    archive_root: String,
    lock_after_archive: bool,
) -> Result<ArchiveResult, String> {
    log::info!("archive requested: lock_after_archive={lock_after_archive}");
    let source = PathBuf::from(&folder_path);
    if !source.is_dir() {
        log::warn!("archive rejected: source is not a directory");
        return Err(format!("source folder is not a directory: {folder_path}"));
    }

    let archive_root_path = PathBuf::from(&archive_root);
    if !archive_root_path.is_dir() {
        log::warn!("archive rejected: archive root is not a directory");
        return Err(format!("archive root is not a directory: {archive_root}"));
    }

    let folder_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("source folder has no valid name")?
        .to_string();

    let destination = archive_root_path.join(&folder_name);
    if destination.exists() {
        log::warn!("archive rejected: destination already exists");
        return Err(format!(
            "destination already exists: {}",
            destination.display()
        ));
    }

    // Build manifest from the source location (before move, so a failure here
    // doesn't leave the folder half-moved).
    let manifest = build_manifest(&source, &folder_name)?;
    let manifest_in_source = source.join(MANIFEST_FILE_NAME);
    write_manifest(&manifest_in_source, &manifest)?;

    // Move. Try `rename` first — it's atomic and fast on same-device.
    // On cross-device (`EXDEV`), fall back to recursive copy + remove.
    if let Err(rename_err) = fs::rename(&source, &destination) {
        if rename_err.raw_os_error() == Some(EXDEV) {
            log::info!("archive crossing filesystem boundary; falling back to copy/remove");
            copy_dir_recursive(&source, &destination)?;
            fs::remove_dir_all(&source).map_err(|e| {
                format!(
                    "folder copied to archive but original cleanup failed at {}: {e}",
                    source.display()
                )
            })?;
        } else {
            return Err(format!(
                "rename {} → {} failed: {rename_err}",
                source.display(),
                destination.display()
            ));
        }
    }

    let manifest_path_final = destination.join(MANIFEST_FILE_NAME);

    let locked = if lock_after_archive {
        set_immutable(&destination)?
    } else {
        false
    };

    log::info!(
        "archive completed: folder={folder_name} files={} bytes={} locked={locked}",
        manifest.total_files,
        manifest.total_bytes
    );

    Ok(ArchiveResult {
        original_path: folder_path,
        archived_path: destination.to_string_lossy().into_owned(),
        manifest_path: manifest_path_final.to_string_lossy().into_owned(),
        total_files: manifest.total_files,
        total_bytes: manifest.total_bytes,
        locked,
    })
}

fn build_manifest(source: &Path, folder_name: &str) -> Result<ArchiveManifest, String> {
    let mut entries: Vec<ManifestEntry> = Vec::new();
    let mut total_bytes: u64 = 0;
    walk_files(source, source, &mut entries, &mut total_bytes)?;

    entries.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    Ok(ArchiveManifest {
        generated_at: Utc::now().to_rfc3339(),
        folder_name: folder_name.to_string(),
        total_files: entries.len() as u64,
        total_bytes,
        entries,
    })
}

fn walk_files(
    root: &Path,
    dir: &Path,
    entries: &mut Vec<ManifestEntry>,
    total_bytes: &mut u64,
) -> Result<(), String> {
    let read_dir = fs::read_dir(dir).map_err(|e| format!("read_dir {}: {e}", dir.display()))?;
    for entry in read_dir {
        let entry = entry.map_err(|e| format!("dir entry error: {e}"))?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|e| format!("file_type {}: {e}", path.display()))?;

        // Skip symlinks to avoid loops and cross-mount surprises.
        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            walk_files(root, &path, entries, total_bytes)?;
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let relative = path
            .strip_prefix(root)
            .map_err(|_| format!("strip_prefix failed for {}", path.display()))?
            .to_string_lossy()
            .into_owned();

        // Don't hash the manifest we're about to write.
        if relative == MANIFEST_FILE_NAME {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|e| format!("metadata {}: {e}", path.display()))?;
        let size_bytes = metadata.len();
        let sha256 = hash_file(&path)?;

        *total_bytes += size_bytes;
        entries.push(ManifestEntry {
            relative_path: relative,
            sha256,
            size_bytes,
        });
    }
    Ok(())
}

fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| format!("open {}: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; HASH_CHUNK_BYTES];
    loop {
        let n = file
            .read(&mut buffer)
            .map_err(|e| format!("read {}: {e}", path.display()))?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn write_manifest(path: &Path, manifest: &ArchiveManifest) -> Result<(), String> {
    let json =
        serde_json::to_string_pretty(manifest).map_err(|e| format!("serialize manifest: {e}"))?;
    fs::write(path, json).map_err(|e| format!("write manifest {}: {e}", path.display()))
}

fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination)
        .map_err(|e| format!("create_dir_all {}: {e}", destination.display()))?;

    let entries =
        fs::read_dir(source).map_err(|e| format!("read_dir {}: {e}", source.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("dir entry error: {e}"))?;
        let src_path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|e| format!("file_type {}: {e}", src_path.display()))?;
        let dest_path = destination.join(entry.file_name());

        if file_type.is_symlink() {
            continue;
        } else if file_type.is_dir() {
            copy_dir_recursive(&src_path, &dest_path)?;
        } else if file_type.is_file() {
            fs::copy(&src_path, &dest_path).map_err(|e| {
                format!("copy {} → {}: {e}", src_path.display(), dest_path.display())
            })?;
        }
    }
    Ok(())
}

fn set_immutable(path: &Path) -> Result<bool, String> {
    // `chflags -R uchg` recursively applies the user immutable flag.
    let output = Command::new("chflags")
        .arg("-R")
        .arg("uchg")
        .arg(path)
        .output()
        .map_err(|e| format!("chflags invocation failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("chflags exited non-zero: {stderr}"));
    }
    Ok(true)
}

/// Tauri command — unlock a previously archived folder (clears the immutable flag).
/// This does NOT restore the folder to its original location — it only removes
/// the lock so the user can delete or modify contents.
#[tauri::command]
pub async fn unlock_archive(folder_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(&folder_path);
        if !path.exists() {
            return Err(format!("folder does not exist: {folder_path}"));
        }
        let output = Command::new("chflags")
            .arg("-R")
            .arg("nouchg")
            .arg(&path)
            .output()
            .map_err(|e| format!("chflags invocation failed: {e}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("chflags exited non-zero: {stderr}"));
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("unlock task join error: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn manifest_hashes_files_in_sorted_order() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        fs::write(root.join("b.txt"), b"hello").unwrap();
        fs::write(root.join("a.txt"), b"world").unwrap();
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::write(root.join("sub/c.txt"), b"!").unwrap();

        let manifest = build_manifest(root, "test").unwrap();
        assert_eq!(manifest.total_files, 3);
        assert_eq!(manifest.total_bytes, 11);
        assert_eq!(manifest.entries[0].relative_path, "a.txt");
        assert_eq!(manifest.entries[1].relative_path, "b.txt");
        assert!(manifest.entries[2].relative_path.ends_with("c.txt"));
    }

    #[test]
    fn hash_of_known_content_is_stable() {
        let tmp = TempDir::new().unwrap();
        let file = tmp.path().join("x");
        fs::write(&file, b"abc").unwrap();
        let hash = hash_file(&file).unwrap();
        // sha256("abc")
        assert_eq!(
            hash,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
