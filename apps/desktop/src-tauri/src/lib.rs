mod archive_engine;
mod rename_engine;
mod scan_engine;
mod volume_import;
mod volume_info;
mod volume_watcher;

use archive_engine::{archive_project, unlock_archive};
use log::{error, info, warn};
use rename_engine::rename_project_folder;
use scan_engine::{cancel_scan, get_scan_snapshot, list_scan_snapshots, start_scan, AppScanState};
use serde::Serialize;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};
use volume_import::enumerate_volume_folders;
use volume_info::get_volume_info;
use volume_watcher::{start_volume_watcher, VolumeWatcherHandle};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: &'static str,
    surface: &'static str,
    phase: &'static str,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "Catalog",
        surface: "desktop",
        phase: "release-readiness",
    }
}

/// Managed state that owns the volume-mount watcher handle for the app lifetime.
/// The `RecommendedWatcher` stops when dropped, so it must live inside Tauri's
/// managed state rather than as a local in `setup`.
#[derive(Default)]
struct AppVolumeWatcher(Mutex<Option<VolumeWatcherHandle>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .level(log::LevelFilter::Info)
                .target(Target::new(TargetKind::Stdout))
                .target(Target::new(TargetKind::LogDir {
                    file_name: Some("Catalog".to_string()),
                }))
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(AppScanState::default())
        .manage(AppVolumeWatcher::default())
        .setup(|app| {
            info!("Catalog desktop starting");
            let handle = app.handle().clone();
            match start_volume_watcher(handle) {
                Ok(watcher_handle) => {
                    let state = app.state::<AppVolumeWatcher>();
                    if let Ok(mut guard) = state.0.lock() {
                        *guard = Some(watcher_handle);
                        info!("volume watcher started");
                    } else {
                        error!("volume watcher mutex poisoned");
                    };
                }
                Err(e) => warn!("volume watcher failed to start: {e}"),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            start_scan,
            cancel_scan,
            get_scan_snapshot,
            list_scan_snapshots,
            get_volume_info,
            enumerate_volume_folders,
            archive_project,
            unlock_archive,
            rename_project_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
