use std::process::Command;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeInfo {
    pub filesystem_type: String,
    pub volume_name: String,
    /// Volume UUID as reported by `diskutil info`. `None` when the volume does
    /// not expose a UUID (e.g. FAT32 without a partition UUID) or when parsing
    /// fails. Used by the drive-import flow to establish a stable identity for
    /// volumes whose display names may change across remounts.
    pub volume_uuid: Option<String>,
    pub total_bytes: u64,
    pub free_bytes: u64,
}

#[tauri::command]
pub fn get_volume_info(path: String) -> Option<VolumeInfo> {
    let diskutil = parse_diskutil_info(&path)?;
    let (total_bytes, free_bytes) = parse_df_bytes(&path)?;

    Some(VolumeInfo {
        filesystem_type: diskutil.filesystem_type,
        volume_name: diskutil.volume_name,
        volume_uuid: diskutil.volume_uuid,
        total_bytes,
        free_bytes,
    })
}

struct DiskutilInfo {
    filesystem_type: String,
    volume_name: String,
    /// `None` when the volume has no UUID or diskutil does not report one.
    volume_uuid: Option<String>,
}

/// Parses `diskutil info <path>` output into a `DiskutilInfo`.
///
/// Returns `None` only when `diskutil` fails or `File System Personality` is
/// absent (the minimum viable field). `volume_name` and `volume_uuid` may be
/// empty / `None` independently without causing a `None` return.
fn parse_diskutil_info(path: &str) -> Option<DiskutilInfo> {
    let output = Command::new("diskutil")
        .args(["info", path])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut filesystem_type = String::new();
    let mut volume_name = String::new();
    let mut volume_uuid: Option<String> = None;

    for line in text.lines() {
        if filesystem_type.is_empty() {
            if let Some(rest) = line.split_once("File System Personality:") {
                filesystem_type = rest.1.trim().to_string();
            }
        }
        if volume_name.is_empty() {
            if let Some(rest) = line.split_once("Volume Name:") {
                volume_name = rest.1.trim().to_string();
            }
        }
        if volume_uuid.is_none() {
            if let Some(rest) = line.split_once("Volume UUID:") {
                let uuid = rest.1.trim().to_string();
                if !uuid.is_empty() {
                    volume_uuid = Some(uuid);
                }
            }
        }
        if !filesystem_type.is_empty() && !volume_name.is_empty() && volume_uuid.is_some() {
            break;
        }
    }

    if filesystem_type.is_empty() {
        return None;
    }

    Some(DiskutilInfo {
        filesystem_type,
        volume_name,
        volume_uuid,
    })
}

/// Returns `(total_bytes, free_bytes)` from `df -Pk <path>`.
fn parse_df_bytes(path: &str) -> Option<(u64, u64)> {
    let output = Command::new("df").args(["-Pk", path]).output().ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout);
    // Skip the header line; the second line contains the data row.
    let data_line = text.lines().nth(1)?;
    let mut cols = data_line.split_whitespace();
    let _filesystem = cols.next()?;
    let total_1k: u64 = cols.next()?.parse().ok()?;
    let _used_1k = cols.next()?;
    let free_1k: u64 = cols.next()?.parse().ok()?;

    Some((total_1k * 1024, free_1k * 1024))
}
