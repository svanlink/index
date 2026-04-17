mod scan_engine;
mod volume_import;
mod volume_info;

use scan_engine::{
    cancel_scan, get_scan_snapshot, list_scan_snapshots, start_scan, AppScanState,
};
use volume_import::enumerate_volume_folders;
use volume_info::get_volume_info;
use serde::Serialize;

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
        name: "Drive Project Catalog",
        surface: "desktop",
        phase: "release-readiness",
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(AppScanState::default())
        .invoke_handler(tauri::generate_handler![
            app_info,
            start_scan,
            cancel_scan,
            get_scan_snapshot,
            list_scan_snapshots,
            get_volume_info,
            enumerate_volume_folders
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
