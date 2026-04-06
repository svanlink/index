use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
};
use tauri::State;

const MAX_SCAN_DEPTH: usize = 2;
const CANCELLED_ERROR: &str = "scan cancelled";
const IGNORED_SYSTEM_FOLDERS: &[&str] = &[
    "$RECYCLE.BIN",
    "System Volume Information",
    ".Spotlight-V100",
    ".Trashes",
    ".fseventsd",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedProjectFolder {
    pub parsed_date: String,
    pub parsed_client: String,
    pub parsed_project: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProjectRecord {
    pub id: String,
    pub folder_name: String,
    pub folder_path: String,
    pub relative_path: String,
    pub parsed_date: String,
    pub parsed_client: String,
    pub parsed_project: String,
    pub source_drive_name: String,
    pub scan_timestamp: String,
    pub size_status: String,
    pub size_bytes: Option<u64>,
    pub size_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSnapshot {
    pub scan_id: String,
    pub root_path: String,
    pub drive_name: String,
    pub status: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub folders_scanned: u64,
    pub matches_found: u64,
    pub error: Option<String>,
    pub size_jobs_pending: usize,
    pub projects: Vec<ScanProjectRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStartRequest {
    pub root_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStartResponse {
    pub scan_id: String,
    pub status: String,
}

#[derive(Default)]
pub struct AppScanState {
    next_scan_number: AtomicU64,
    sessions: Mutex<HashMap<String, Arc<ScanSession>>>,
}

struct ScanSession {
    cancelled: AtomicBool,
    snapshot: Mutex<ScanSnapshot>,
}

impl AppScanState {
    fn next_scan_id(&self) -> String {
        let next = self.next_scan_number.fetch_add(1, Ordering::Relaxed) + 1;
        format!("scan-{next}")
    }

    fn insert_session(&self, scan_id: String, session: Arc<ScanSession>) {
        let mut sessions = self.sessions.lock().expect("scan state poisoned");
        sessions.insert(scan_id, session);
    }

    fn get_session(&self, scan_id: &str) -> Option<Arc<ScanSession>> {
        let sessions = self.sessions.lock().expect("scan state poisoned");
        sessions.get(scan_id).cloned()
    }

    fn list_snapshots(&self) -> Vec<ScanSnapshot> {
        let sessions = self.sessions.lock().expect("scan state poisoned");
        let mut snapshots: Vec<_> = sessions.values().map(|session| session.snapshot()).collect();
        snapshots.sort_by(|left, right| right.started_at.cmp(&left.started_at));
        snapshots
    }
}

impl ScanSession {
    fn new(scan_id: String, root_path: String, drive_name: String) -> Self {
        Self {
            cancelled: AtomicBool::new(false),
            snapshot: Mutex::new(ScanSnapshot {
                scan_id,
                root_path,
                drive_name,
                status: "running".to_string(),
                started_at: timestamp_now(),
                finished_at: None,
                folders_scanned: 0,
                matches_found: 0,
                error: None,
                size_jobs_pending: 0,
                projects: Vec::new(),
            }),
        }
    }

    fn snapshot(&self) -> ScanSnapshot {
        self.snapshot.lock().expect("scan snapshot poisoned").clone()
    }

    fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
        let mut snapshot = self.snapshot.lock().expect("scan snapshot poisoned");
        if snapshot.status == "running" {
            snapshot.status = "cancelled".to_string();
            snapshot.finished_at = Some(timestamp_now());
        }
    }

    fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }

    fn increment_folders_scanned(&self) {
        let mut snapshot = self.snapshot.lock().expect("scan snapshot poisoned");
        snapshot.folders_scanned += 1;
    }

    fn register_match(
        &self,
        folder_name: String,
        folder_path: String,
        relative_path: String,
        parsed: ParsedProjectFolder,
        source_drive_name: String,
    ) -> String {
        let mut snapshot = self.snapshot.lock().expect("scan snapshot poisoned");
        snapshot.matches_found += 1;
        snapshot.size_jobs_pending += 1;
        let project_id = format!("{}-project-{}", snapshot.scan_id, snapshot.matches_found);

        snapshot.projects.push(ScanProjectRecord {
            id: project_id.clone(),
            folder_name,
            folder_path,
            relative_path,
            parsed_date: parsed.parsed_date,
            parsed_client: parsed.parsed_client,
            parsed_project: parsed.parsed_project,
            source_drive_name,
            scan_timestamp: timestamp_now(),
            size_status: "pending".to_string(),
            size_bytes: None,
            size_error: None,
        });

        project_id
    }

    fn finish_size_job(&self, project_id: &str, result: Result<u64, String>) {
        let mut snapshot = self.snapshot.lock().expect("scan snapshot poisoned");
        if snapshot.size_jobs_pending > 0 {
            snapshot.size_jobs_pending -= 1;
        }

        if let Some(project) = snapshot.projects.iter_mut().find(|project| project.id == project_id) {
            match result {
                Ok(size_bytes) => {
                    project.size_status = "ready".to_string();
                    project.size_bytes = Some(size_bytes);
                    project.size_error = None;
                }
                Err(error) => {
                    project.size_status = "failed".to_string();
                    project.size_bytes = None;
                    project.size_error = Some(error);
                }
            }
        }
    }

    fn mark_completed(&self) {
        let mut snapshot = self.snapshot.lock().expect("scan snapshot poisoned");
        if snapshot.status == "running" {
            snapshot.status = "completed".to_string();
            snapshot.finished_at = Some(timestamp_now());
        }
    }

    fn mark_cancelled(&self) {
        let mut snapshot = self.snapshot.lock().expect("scan snapshot poisoned");
        snapshot.status = "cancelled".to_string();
        if snapshot.finished_at.is_none() {
            snapshot.finished_at = Some(timestamp_now());
        }
        if snapshot.error.is_none() {
            snapshot.error = Some(CANCELLED_ERROR.to_string());
        }
    }

    fn mark_failed(&self, error: String) {
        let mut snapshot = self.snapshot.lock().expect("scan snapshot poisoned");
        snapshot.status = "failed".to_string();
        snapshot.error = Some(error);
        snapshot.finished_at = Some(timestamp_now());
    }
}

#[tauri::command]
pub fn start_scan(
    request: ScanStartRequest,
    state: State<'_, AppScanState>,
) -> Result<ScanStartResponse, String> {
    let root_path = PathBuf::from(&request.root_path);
    if !root_path.exists() {
        return Err(format!("scan root does not exist: {}", request.root_path));
    }
    if !root_path.is_dir() {
        return Err(format!("scan root is not a directory: {}", request.root_path));
    }

    let scan_id = state.next_scan_id();
    let drive_name = derive_drive_name(&root_path);
    let session = Arc::new(ScanSession::new(
        scan_id.clone(),
        root_path.to_string_lossy().to_string(),
        drive_name.clone(),
    ));
    state.insert_session(scan_id.clone(), Arc::clone(&session));

    thread::spawn(move || {
        match execute_scan(root_path, drive_name, Arc::clone(&session)) {
            Ok(()) => {
                if session.is_cancelled() {
                    session.mark_cancelled();
                } else {
                    session.mark_completed();
                }
            }
            Err(error) if error == CANCELLED_ERROR => {
                session.mark_cancelled();
            }
            Err(error) => {
                session.mark_failed(error);
            }
        }
    });

    Ok(ScanStartResponse {
        scan_id,
        status: "running".to_string(),
    })
}

#[tauri::command]
pub fn cancel_scan(scan_id: String, state: State<'_, AppScanState>) -> Result<ScanSnapshot, String> {
    let session = state
        .get_session(&scan_id)
        .ok_or_else(|| format!("unknown scan id: {scan_id}"))?;
    session.cancel();
    Ok(session.snapshot())
}

#[tauri::command]
pub fn get_scan_snapshot(scan_id: String, state: State<'_, AppScanState>) -> Result<ScanSnapshot, String> {
    let session = state
        .get_session(&scan_id)
        .ok_or_else(|| format!("unknown scan id: {scan_id}"))?;
    Ok(session.snapshot())
}

#[tauri::command]
pub fn list_scan_snapshots(state: State<'_, AppScanState>) -> Vec<ScanSnapshot> {
    state.list_snapshots()
}

fn execute_scan(root_path: PathBuf, drive_name: String, session: Arc<ScanSession>) -> Result<(), String> {
    scan_directory(&root_path, &root_path, 0, &drive_name, &session)?;
    Ok(())
}

fn scan_directory(
    root_path: &Path,
    current_path: &Path,
    current_depth: usize,
    drive_name: &str,
    session: &Arc<ScanSession>,
) -> Result<(), String> {
    if session.is_cancelled() {
        return Err(CANCELLED_ERROR.to_string());
    }

    let entries = fs::read_dir(current_path)
        .map_err(|error| format!("failed to read directory {}: {error}", current_path.display()))?;

    for entry in entries {
        if session.is_cancelled() {
            return Err(CANCELLED_ERROR.to_string());
        }

        let entry = entry.map_err(|error| format!("failed to read directory entry: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("failed to read file type for {}: {error}", entry.path().display()))?;
        if !file_type.is_dir() || file_type.is_symlink() {
            continue;
        }

        let folder_name = entry.file_name().to_string_lossy().to_string();
        if should_ignore_directory(&folder_name) {
            continue;
        }

        let child_depth = current_depth + 1;
        if child_depth > MAX_SCAN_DEPTH {
            continue;
        }

        session.increment_folders_scanned();
        let child_path = entry.path();

        if let Some(parsed) = parse_project_folder_name(&folder_name) {
            let relative_path = child_path
                .strip_prefix(root_path)
                .unwrap_or(&child_path)
                .to_string_lossy()
                .to_string();
            let project_id = session.register_match(
                folder_name,
                child_path.to_string_lossy().to_string(),
                relative_path,
                parsed,
                drive_name.to_string(),
            );
            spawn_size_calculation(Arc::clone(session), project_id, child_path);
            continue;
        }

        if child_depth < MAX_SCAN_DEPTH {
            scan_directory(root_path, &child_path, child_depth, drive_name, session)?;
        }
    }

    Ok(())
}

fn spawn_size_calculation(session: Arc<ScanSession>, project_id: String, path: PathBuf) {
    thread::spawn(move || {
        let result = calculate_directory_size(&path, &session);
        session.finish_size_job(&project_id, result);
    });
}

fn calculate_directory_size(path: &Path, session: &ScanSession) -> Result<u64, String> {
    if session.is_cancelled() {
        return Err(CANCELLED_ERROR.to_string());
    }

    let entries = fs::read_dir(path).map_err(|error| format!("failed to size {}: {error}", path.display()))?;
    let mut total_size = 0_u64;

    for entry in entries {
        if session.is_cancelled() {
            return Err(CANCELLED_ERROR.to_string());
        }

        let entry = entry.map_err(|error| format!("failed to size entry in {}: {error}", path.display()))?;
        let metadata = entry
            .metadata()
            .map_err(|error| format!("failed to read metadata for {}: {error}", entry.path().display()))?;

        if metadata.is_file() {
            total_size += metadata.len();
        } else if metadata.is_dir() {
            total_size += calculate_directory_size(&entry.path(), session)?;
        }
    }

    Ok(total_size)
}

fn should_ignore_directory(name: &str) -> bool {
    name.starts_with('.') || IGNORED_SYSTEM_FOLDERS.contains(&name)
}

fn parse_project_folder_name(name: &str) -> Option<ParsedProjectFolder> {
    let mut parts = name.split('_');
    let parsed_date = parts.next()?;
    let parsed_client = parts.next()?;
    let parsed_project = parts.next()?;

    if parts.next().is_some() {
        return None;
    }
    if parsed_date.len() != 6 || !parsed_date.chars().all(|character| character.is_ascii_digit()) {
        return None;
    }
    if parsed_client.is_empty() || parsed_project.is_empty() {
        return None;
    }

    Some(ParsedProjectFolder {
        parsed_date: parsed_date.to_string(),
        parsed_client: parsed_client.to_string(),
        parsed_project: parsed_project.to_string(),
    })
}

fn derive_drive_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| path.to_string_lossy().to_string())
}

fn timestamp_now() -> String {
    Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn parses_strict_project_folder_names() {
        let parsed = parse_project_folder_name("240401_Apple_ProductShoot").expect("expected strict match");
        assert_eq!(parsed.parsed_date, "240401");
        assert_eq!(parsed.parsed_client, "Apple");
        assert_eq!(parsed.parsed_project, "ProductShoot");

        assert!(parse_project_folder_name("240401_Apple").is_none());
        assert!(parse_project_folder_name("240401_Apple_Product_Shoot").is_none());
        assert!(parse_project_folder_name("24A401_Apple_ProductShoot").is_none());
        assert!(parse_project_folder_name("240401__ProductShoot").is_none());
    }

    #[test]
    fn ignores_hidden_and_system_folders() {
        assert!(should_ignore_directory(".hidden"));
        assert!(should_ignore_directory(".Spotlight-V100"));
        assert!(!should_ignore_directory("240401_Apple_ProductShoot"));
    }

    #[test]
    fn scans_with_depth_limit_and_background_size_results() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path();

        fs::create_dir(root.join(".hidden")).expect("hidden dir");
        fs::create_dir(root.join(".hidden").join("240101_Hidden_Project")).expect("hidden nested");

        let direct_project = root.join("240401_Apple_ProductShoot");
        fs::create_dir(&direct_project).expect("direct project");
        fs::write(direct_project.join("capture.mov"), vec![0_u8; 128]).expect("direct file");
        fs::create_dir(direct_project.join("nested")).expect("nested direct");
        fs::write(direct_project.join("nested").join("grade.cube"), vec![0_u8; 32]).expect("nested file");

        let nested_container = root.join("Archive");
        fs::create_dir(&nested_container).expect("nested container");
        let depth_two_project = nested_container.join("240320_Nike_Ad");
        fs::create_dir(&depth_two_project).expect("depth two project");
        fs::write(depth_two_project.join("edit.prproj"), vec![0_u8; 64]).expect("depth two file");

        let too_deep = root.join("Deep");
        fs::create_dir(&too_deep).expect("deep");
        let level_two = too_deep.join("LevelTwo");
        fs::create_dir(&level_two).expect("level two");
        let level_three_project = level_two.join("240228_Too_Deep");
        fs::create_dir(&level_three_project).expect("level three project");
        fs::write(level_three_project.join("ignore.bin"), vec![0_u8; 16]).expect("too deep file");

        let session = Arc::new(ScanSession::new(
            "scan-test".to_string(),
            root.to_string_lossy().to_string(),
            "Drive A".to_string(),
        ));

        execute_scan(root.to_path_buf(), "Drive A".to_string(), Arc::clone(&session)).expect("scan should succeed");

        for _ in 0..50 {
            if session.snapshot().size_jobs_pending == 0 {
                break;
            }
            thread::sleep(std::time::Duration::from_millis(10));
        }

        let snapshot = session.snapshot();
        assert_eq!(snapshot.status, "running");
        assert_eq!(snapshot.matches_found, 2);
        assert_eq!(snapshot.projects.len(), 2);
        assert!(snapshot.projects.iter().all(|project| project.size_status == "ready"));
        assert!(snapshot.projects.iter().any(|project| project.folder_name == "240401_Apple_ProductShoot"));
        assert!(snapshot.projects.iter().any(|project| project.folder_name == "240320_Nike_Ad"));
        assert!(!snapshot.projects.iter().any(|project| project.folder_name == "240228_Too_Deep"));

        let direct = snapshot
            .projects
            .iter()
            .find(|project| project.folder_name == "240401_Apple_ProductShoot")
            .expect("direct project");
        assert_eq!(direct.size_bytes, Some(160));
    }

    #[test]
    fn size_calculation_stops_when_cancelled() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path();
        fs::create_dir(root.join("240401_Apple_ProductShoot")).expect("project");
        fs::write(root.join("240401_Apple_ProductShoot").join("capture.mov"), vec![0_u8; 128]).expect("file");

        let session = Arc::new(ScanSession::new(
            "scan-cancel".to_string(),
            root.to_string_lossy().to_string(),
            "Drive A".to_string(),
        ));
        session.cancelled.store(true, Ordering::Relaxed);

        let result = calculate_directory_size(&root.join("240401_Apple_ProductShoot"), &session);
        assert_eq!(result.unwrap_err(), CANCELLED_ERROR.to_string());
    }
}
