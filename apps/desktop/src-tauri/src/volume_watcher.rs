//! # Volume Watcher
//!
//! Monitors `/Volumes` for newly mounted drives using the `notify` crate
//! (FSEvents backend on macOS). When a new top-level directory appears,
//! the watcher waits a short debounce for the mount to stabilise, then:
//!
//! 1. Counts the top-level folders on the new volume (read-only)
//! 2. Emits a `volume-mounted` Tauri event to the frontend
//! 3. Shows a native macOS notification — clicking it raises the app
//!
//! The frontend listens for `volume-mounted` and offers quick navigation
//! to the new drive's detail page.
//!
//! ## Read-only
//!
//! Like the scan engine, this module never writes to the filesystem —
//! the crate-wide `.clippy.toml` `disallowed_methods` lint applies unchanged.

#![cfg_attr(not(test), deny(clippy::disallowed_methods))]

use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

/// Root directory to watch. macOS mounts every volume here.
const VOLUMES_ROOT: &str = "/Volumes";

/// Wait this long after a new directory appears before inspecting it —
/// FSEvents fires on the bare mount point before the disk is traversable.
const MOUNT_STABILIZE_DELAY_MS: u64 = 2500;

/// Payload emitted to the frontend when a new volume mounts.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VolumeMountEvent {
    pub volume_name: String,
    pub volume_path: String,
    pub folder_count: u64,
    pub detected_at: String,
}

/// Opaque handle — keeps the `RecommendedWatcher` alive for the app lifetime.
/// Dropping it unregisters the FSEvents stream.
pub struct VolumeWatcherHandle {
    _watcher: RecommendedWatcher,
}

/// Starts the volume watcher. Call once from `tauri::Builder::setup`.
/// The returned handle must be held for the lifetime of the app.
pub fn start_volume_watcher(app: AppHandle) -> Result<VolumeWatcherHandle, String> {
    let volumes_path = PathBuf::from(VOLUMES_ROOT);
    if !volumes_path.exists() {
        return Err(format!("{VOLUMES_ROOT} does not exist"));
    }

    // Seed the "seen" set with what's already mounted so we don't fire
    // notifications for every volume on app start.
    let initial = scan_current_volumes(&volumes_path);
    let seen = Arc::new(Mutex::new(initial));
    let seen_for_watcher = Arc::clone(&seen);
    let app_for_watcher = app.clone();

    let mut watcher =
        notify::recommended_watcher(move |event_result: Result<Event, notify::Error>| {
            match event_result {
                Ok(event) => handle_event(&event, &seen_for_watcher, &app_for_watcher),
                Err(e) => log::warn!("volume watcher notify error: {e}"),
            }
        })
        .map_err(|e| format!("failed to create watcher: {e}"))?;

    watcher
        .watch(&volumes_path, RecursiveMode::NonRecursive)
        .map_err(|e| format!("failed to watch {VOLUMES_ROOT}: {e}"))?;

    Ok(VolumeWatcherHandle { _watcher: watcher })
}

fn scan_current_volumes(volumes_path: &Path) -> HashSet<String> {
    let mut set = HashSet::new();
    if let Ok(entries) = fs::read_dir(volumes_path) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() || file_type.is_symlink() {
                    if let Some(name) = entry.file_name().to_str() {
                        set.insert(name.to_string());
                    }
                }
            }
        }
    }
    set
}

fn handle_event(event: &Event, seen: &Arc<Mutex<HashSet<String>>>, app: &AppHandle) {
    if !matches!(
        event.kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Any
    ) {
        return;
    }

    for path in &event.paths {
        // Only react to immediate children of /Volumes
        if path.parent() != Some(Path::new(VOLUMES_ROOT)) {
            continue;
        }

        let Some(name) = path.file_name().and_then(|n| n.to_str()).map(str::to_owned) else {
            continue;
        };

        // Skip macOS hidden bookkeeping entries
        if name.starts_with('.') {
            continue;
        }

        // Dedupe: if we already fired a notification for this volume name, skip.
        let newly_seen = {
            let mut set = seen.lock().unwrap();
            if set.contains(&name) {
                false
            } else {
                set.insert(name.clone());
                true
            }
        };
        if !newly_seen {
            continue;
        }
        log::info!("volume mount candidate detected: {name}");

        // Defer the actual inspection to a worker thread so the FSEvents
        // callback returns quickly.
        let path_clone = path.clone();
        let name_clone = name.clone();
        let app_clone = app.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(MOUNT_STABILIZE_DELAY_MS));
            notify_volume_mounted(&app_clone, &name_clone, &path_clone);
        });
    }
}

fn notify_volume_mounted(app: &AppHandle, name: &str, path: &Path) {
    if !path.exists() {
        // Mount vanished during the stabilise delay — eject race condition.
        log::info!("volume mount candidate vanished before inspection: {name}");
        return;
    }

    let folder_count = count_top_level_folders(path);
    let payload = VolumeMountEvent {
        volume_name: name.to_string(),
        volume_path: path.to_string_lossy().into_owned(),
        folder_count,
        detected_at: chrono::Utc::now().to_rfc3339(),
    };

    // Emit to frontend — the UI listens and can navigate / offer a review CTA.
    if let Err(e) = app.emit("volume-mounted", &payload) {
        log::warn!("volume-mounted event emit failed: {e}");
    } else {
        log::info!("volume-mounted event emitted: {name} ({folder_count} folders)");
    }

    // Native macOS notification
    let body = if folder_count == 0 {
        "No folders detected at root.".to_string()
    } else {
        format!(
            "{folder_count} folder{plural} detected. Click to review.",
            plural = if folder_count == 1 { "" } else { "s" }
        )
    };

    if let Err(e) = app
        .notification()
        .builder()
        .title(format!("New drive: {name}"))
        .body(body)
        .show()
    {
        log::warn!("volume-mounted notification failed: {e}");
    }
}

fn count_top_level_folders(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .flatten()
        .filter(|entry| entry.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .map(|n| !n.starts_with('.'))
                .unwrap_or(false)
        })
        .count() as u64
}
