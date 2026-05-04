mod constants;
mod scan_engine;
mod volume_import;
mod volume_info;

use log::info;
use scan_engine::{cancel_scan, get_scan_snapshot, list_scan_snapshots, start_scan, AppScanState};
use serde::Serialize;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};
use volume_import::enumerate_volume_folders;
use volume_info::get_volume_info;

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
        phase: "v1",
    }
}

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
        .setup(|app| {
            info!("Catalog desktop starting (v1)");
            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                if let Some(window) = app.get_webview_window("main") {
                    apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None)
                        .expect("Failed to apply vibrancy — requires macOS 10.14+");
                }
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
            enumerate_volume_folders
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
