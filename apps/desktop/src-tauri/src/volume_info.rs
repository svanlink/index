use std::process::Command;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeInfo {
    pub filesystem_type: String,
    pub volume_name: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
}

#[tauri::command]
pub fn get_volume_info(path: String) -> Option<VolumeInfo> {
    let diskutil = parse_diskutil_info(&path)?;
    let (total_bytes, free_bytes) = parse_df_bytes(&path)?;

    Some(VolumeInfo {
        filesystem_type: diskutil.0,
        volume_name: diskutil.1,
        total_bytes,
        free_bytes,
    })
}

/// Returns `(filesystem_type, volume_name)` from `diskutil info <path>`.
fn parse_diskutil_info(path: &str) -> Option<(String, String)> {
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
        if !filesystem_type.is_empty() && !volume_name.is_empty() {
            break;
        }
    }

    if filesystem_type.is_empty() {
        return None;
    }

    Some((filesystem_type, volume_name))
}

/// Returns `(total_bytes, free_bytes)` from `df -Pk <path>`.
fn parse_df_bytes(path: &str) -> Option<(u64, u64)> {
    let output = Command::new("df")
        .args(["-Pk", path])
        .output()
        .ok()?;

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
