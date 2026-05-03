//! # Scan Engine — Import Safety Contract
//!
//! This module is **read-only with respect to the filesystem**. It may only:
//!
//! - Read directory entries (`fs::read_dir`)
//! - Read file metadata (`DirEntry::metadata`, `DirEntry::file_type`)
//! - Read file sizes (`metadata.len()`)
//!
//! It must **never**:
//!
//! - Rename, move, copy, or delete files or directories
//! - Write to any file or create any directory
//! - Change file permissions or attributes
//! - Normalize or auto-correct folder names on disk
//!
//! Folder name corrections are purely database metadata written only through
//! the explicit user edit flow in the UI. The `correctedClient` and
//! `correctedProject` fields never influence the filesystem.
//!
//! ## Enforcement
//!
//! The `.clippy.toml` at the crate root forbids the specific `std::fs` write
//! functions via `disallowed_methods`. This module additionally carries
//! `#[deny(clippy::disallowed_methods)]` so any accidental import of a write
//! function fails the build rather than producing a warning.
//!
//! The `#[cfg(test)]` module is explicitly exempted because tests need to
//! create temporary fixture directories.

#![cfg_attr(not(test), deny(clippy::disallowed_methods))]

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
    thread::{self, JoinHandle},
};
use tauri::State;

use crate::constants::IGNORED_SYSTEM_FOLDERS;

const MAX_SCAN_DEPTH: usize = 1;
const CANCELLED_ERROR: &str = "scan cancelled";

/// Classification result for a scanned folder name.
/// Every folder is classified — none are silently discarded.
#[derive(Debug, Clone)]
enum FolderClassification {
    /// New standard: `YYYY-MM-DD_ClientName - ProjectName`
    /// Legacy:       `YYMMDD_ClientName_ProjectName` (client ≠ "Internal")
    Client {
        date: String,
        client: String,
        project: String,
    },
    /// Legacy: `YYMMDD_Internal_ProjectName`
    PersonalProject { date: String, project: String },
    /// Anything that does not match the structured patterns
    PersonalFolder,
}

impl FolderClassification {
    fn folder_type_str(&self) -> &'static str {
        match self {
            FolderClassification::Client { .. } => "client",
            FolderClassification::PersonalProject { .. } => "personal_project",
            FolderClassification::PersonalFolder => "personal_folder",
        }
    }

    fn parsed_date(&self) -> Option<&str> {
        match self {
            FolderClassification::Client { date, .. }
            | FolderClassification::PersonalProject { date, .. } => Some(date.as_str()),
            FolderClassification::PersonalFolder => None,
        }
    }

    /// Returns the client name for `Client` folders.
    /// Always `None` for `PersonalProject` and `PersonalFolder`.
    fn parsed_client(&self) -> Option<&str> {
        match self {
            FolderClassification::Client { client, .. } => Some(client.as_str()),
            FolderClassification::PersonalProject { .. } | FolderClassification::PersonalFolder => {
                None
            }
        }
    }

    fn parsed_project(&self) -> Option<&str> {
        match self {
            FolderClassification::Client { project, .. }
            | FolderClassification::PersonalProject { project, .. } => Some(project.as_str()),
            FolderClassification::PersonalFolder => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProjectRecord {
    pub id: String,
    pub folder_name: String,
    pub folder_path: String,
    pub relative_path: String,
    pub folder_type: String,
    pub parsed_date: Option<String>,
    pub parsed_client: Option<String>,
    pub parsed_project: Option<String>,
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
    /// `"index_only"` — no size workers spawned; project `size_status` is `"unknown"`.
    /// `"index_with_size"` — a background size walk runs per top-level folder.
    pub scan_mode: String,
    pub projects: Vec<ScanProjectRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanStartRequest {
    pub root_path: String,
    /// Controls whether recursive size workers are spawned for each top-level
    /// folder. `"index_only"` (default when omitted) records folders only —
    /// fast, no sizes. `"index_with_size"` spawns a background size-walk per folder.
    pub scan_mode: Option<String>,
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

/// Lifecycle state for a scan session.
///
/// # Mutual exclusion (H5)
///
/// The `finalized` flag is the single source of truth for whether a terminal
/// status has been written to `snapshot`. It is always flipped via `swap()`
/// while the `snapshot` mutex is held, which guarantees that exactly one
/// terminal transition wins — even if `cancel()` and `mark_completed()` race
/// across threads.
///
/// The `cancel_requested` flag stays a fast-path `AtomicBool` so that the
/// scan's directory-walk hot loop can check cancellation without taking the
/// snapshot mutex on every entry.
///
/// # Size worker lifecycle (H8)
///
/// `size_workers` tracks every `JoinHandle` returned by
/// `spawn_size_calculation`. On `Drop`, we signal cancellation and join all
/// outstanding workers, so a closing window / dropped session cannot leak a
/// detached directory-walk thread that keeps reading the filesystem after the
/// session has been discarded. Tests can trigger the same cleanup
/// synchronously via `join_size_workers_for_test()`.
struct ScanSession {
    cancel_requested: AtomicBool,
    finalized: AtomicBool,
    /// Immutable after construction — read without a lock.
    scan_mode: String,
    snapshot: Mutex<ScanSnapshot>,
    size_workers: Mutex<Vec<JoinHandle<()>>>,
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

    fn list_snapshots(&self) -> Result<Vec<ScanSnapshot>, String> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|err| format!("scan state poisoned: {err}"))?;
        let mut snapshots: Vec<_> = sessions
            .values()
            .map(|session| session.snapshot())
            .collect();
        snapshots.sort_by(|left, right| right.started_at.cmp(&left.started_at));
        Ok(snapshots)
    }
}

impl ScanSession {
    fn new(scan_id: String, root_path: String, drive_name: String, scan_mode: String) -> Self {
        Self {
            cancel_requested: AtomicBool::new(false),
            finalized: AtomicBool::new(false),
            scan_mode: scan_mode.clone(),
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
                scan_mode,
                projects: Vec::new(),
            }),
            size_workers: Mutex::new(Vec::new()),
        }
    }

    fn snapshot(&self) -> ScanSnapshot {
        self.snapshot
            .lock()
            .expect("scan snapshot poisoned")
            .clone()
    }

    /// Cooperative cancellation request.
    ///
    /// Fast-path: if the session is already finalized (a terminal status was
    /// written by the scan thread), cancel is a no-op — a finalized session
    /// must never be mutated again.
    ///
    /// Otherwise sets `cancel_requested` so the scan's directory-walk loop
    /// will unwind on its next `is_cancelled()` check, and eagerly writes
    /// "cancelled" to the snapshot so the UI sees the transition immediately.
    /// The scan thread's subsequent `mark_*` call will attempt to write the
    /// final terminal status — and because that call performs
    /// `finalized.swap(true)` *inside* the snapshot lock, it is guaranteed
    /// to either win the race (overwriting "cancelled" with "completed" when
    /// the scan had already returned Ok), or lose and become a no-op.
    fn cancel(&self) {
        if self.finalized.load(Ordering::Acquire) {
            return;
        }

        self.cancel_requested.store(true, Ordering::Release);
        let mut snapshot = self.snapshot.lock().expect("scan snapshot poisoned");
        // Re-check under the snapshot lock: a concurrent mark_* may have
        // finalized the session between our fast-path check above and
        // acquiring the lock. If so, leave the terminal status intact.
        if self.finalized.load(Ordering::Acquire) {
            return;
        }
        if snapshot.status == "running" {
            snapshot.status = "cancelled".to_string();
            snapshot.finished_at = Some(timestamp_now());
        }
    }

    fn is_cancelled(&self) -> bool {
        self.cancel_requested.load(Ordering::Acquire)
    }

    #[cfg(test)]
    fn is_finalized(&self) -> bool {
        self.finalized.load(Ordering::Acquire)
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
        classification: &FolderClassification,
        source_drive_name: String,
    ) -> String {
        let index_only = self.scan_mode == "index_only";
        let mut snapshot = self.snapshot.lock().expect("scan snapshot poisoned");
        snapshot.matches_found += 1;
        // In "index" mode we never spawn a size worker, so size_jobs_pending
        // stays at zero and size_status is "unknown" rather than "pending".
        if !index_only {
            snapshot.size_jobs_pending += 1;
        }
        let project_id = format!("{}-project-{}", snapshot.scan_id, snapshot.matches_found);

        snapshot.projects.push(ScanProjectRecord {
            id: project_id.clone(),
            folder_name,
            folder_path,
            relative_path,
            folder_type: classification.folder_type_str().to_string(),
            parsed_date: classification.parsed_date().map(str::to_string),
            parsed_client: classification.parsed_client().map(str::to_string),
            parsed_project: classification.parsed_project().map(str::to_string),
            source_drive_name,
            scan_timestamp: timestamp_now(),
            size_status: if index_only {
                "unknown".to_string()
            } else {
                "pending".to_string()
            },
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

        if let Some(project) = snapshot
            .projects
            .iter_mut()
            .find(|project| project.id == project_id)
        {
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
        } else {
            log::error!(
                "finish_size_job: no project record found for id={project_id} — size result discarded; this is an internal bug"
            );
        }
    }

    /// Mark the session as completed.
    ///
    /// The `finalized.swap(true)` call runs *inside* the snapshot lock, so
    /// it serialises with any concurrent `mark_cancelled` / `mark_failed` /
    /// `cancel` that is also trying to acquire the lock. Only the first
    /// caller wins; subsequent callers become no-ops.
    ///
    /// When `execute_scan` returns `Ok(())`, the scan genuinely finished
    /// traversing every target folder — so "completed" always wins over a
    /// "cancelled" that a racing `cancel()` may have written just before
    /// we took the lock.
    fn mark_completed(&self) {
        let mut snapshot = self.snapshot.lock().expect("scan snapshot poisoned");
        if self.finalized.swap(true, Ordering::AcqRel) {
            return;
        }
        snapshot.status = "completed".to_string();
        snapshot.finished_at = Some(timestamp_now());
    }

    fn mark_cancelled(&self) {
        let mut snapshot = self.snapshot.lock().expect("scan snapshot poisoned");
        if self.finalized.swap(true, Ordering::AcqRel) {
            return;
        }
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
        if self.finalized.swap(true, Ordering::AcqRel) {
            return;
        }
        snapshot.status = "failed".to_string();
        snapshot.error = Some(error);
        snapshot.finished_at = Some(timestamp_now());
    }

    /// Register a spawned size worker so it can be joined on Drop (H8).
    fn register_size_worker(&self, handle: JoinHandle<()>) {
        self.size_workers
            .lock()
            .expect("size workers poisoned")
            .push(handle);
    }

    /// Drain and join every outstanding size worker.
    ///
    /// Used by `Drop` for real cleanup and by tests to synchronously wait
    /// for all spawned workers to finish without relying on polling
    /// `size_jobs_pending`.
    fn drain_and_join_size_workers(&self) {
        let handles: Vec<JoinHandle<()>> = {
            let mut guard = self.size_workers.lock().expect("size workers poisoned");
            std::mem::take(&mut *guard)
        };
        for handle in handles {
            // Best-effort join: we must not panic during Drop. But we do log
            // the panic payload so the failure is visible in crash logs and
            // can be correlated with a stuck "pending" size on a project record.
            if let Err(panic_val) = handle.join() {
                let msg = panic_val
                    .downcast_ref::<&str>()
                    .copied()
                    .or_else(|| panic_val.downcast_ref::<String>().map(|s| s.as_str()))
                    .unwrap_or("<non-string panic payload>");
                log::error!("size worker thread panicked: {msg}; affected project size will remain stuck at 'pending'");
            }
        }
    }
}

impl Drop for ScanSession {
    /// H8: ensure detached size workers never outlive the session. Setting
    /// `cancel_requested` before joining causes any worker still inside
    /// `calculate_directory_size` to bail out of its hot loop on the next
    /// `is_cancelled()` check, so the join completes promptly instead of
    /// blocking on a full disk walk.
    fn drop(&mut self) {
        self.cancel_requested.store(true, Ordering::Release);
        self.drain_and_join_size_workers();
    }
}

#[tauri::command]
pub fn start_scan(
    request: ScanStartRequest,
    state: State<'_, AppScanState>,
) -> Result<ScanStartResponse, String> {
    let root_path = PathBuf::from(&request.root_path);
    if !root_path.exists() {
        log::warn!("scan rejected: root does not exist: {}", request.root_path);
        return Err(format!("scan root does not exist: {}", request.root_path));
    }
    if !root_path.is_dir() {
        log::warn!(
            "scan rejected: root is not a directory: {}",
            request.root_path
        );
        return Err(format!(
            "scan root is not a directory: {}",
            request.root_path
        ));
    }

    let scan_id = state.next_scan_id();
    let drive_name = derive_drive_name(&root_path);
    let scan_mode = request
        .scan_mode
        .unwrap_or_else(|| "index_only".to_string());
    log::info!(
        "scan started: id={scan_id} drive={drive_name} mode={scan_mode} root={}",
        root_path.display()
    );
    let session = Arc::new(ScanSession::new(
        scan_id.clone(),
        root_path.to_string_lossy().to_string(),
        drive_name.clone(),
        scan_mode,
    ));
    state.insert_session(scan_id.clone(), Arc::clone(&session));

    thread::spawn(move || {
        // The scan thread is the sole writer of terminal status. Each mark_*
        // method atomically flips `finalized` under the snapshot lock, so
        // concurrent `cancel()` calls either race in before this point (and
        // get overwritten by mark_completed when execute_scan actually
        // succeeded) or arrive after (and become no-ops). See H5.
        match execute_scan(root_path, drive_name, Arc::clone(&session)) {
            Ok(()) => {
                let snapshot = session.snapshot();
                log::info!(
                    "scan completed: id={} folders={} matches={} size_jobs_pending={}",
                    snapshot.scan_id,
                    snapshot.folders_scanned,
                    snapshot.matches_found,
                    snapshot.size_jobs_pending
                );
                session.mark_completed();
            }
            Err(error) if error == CANCELLED_ERROR => {
                let snapshot = session.snapshot();
                log::info!("scan cancelled: id={}", snapshot.scan_id);
                session.mark_cancelled();
            }
            Err(error) => {
                let snapshot = session.snapshot();
                log::error!("scan failed: id={} error={error}", snapshot.scan_id);
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
pub fn cancel_scan(
    scan_id: String,
    state: State<'_, AppScanState>,
) -> Result<ScanSnapshot, String> {
    let session = state
        .get_session(&scan_id)
        .ok_or_else(|| format!("unknown scan id: {scan_id}"))?;
    log::info!("scan cancellation requested: id={scan_id}");
    session.cancel();
    Ok(session.snapshot())
}

#[tauri::command]
pub fn get_scan_snapshot(
    scan_id: String,
    state: State<'_, AppScanState>,
) -> Result<ScanSnapshot, String> {
    let session = state
        .get_session(&scan_id)
        .ok_or_else(|| format!("unknown scan id: {scan_id}"))?;
    Ok(session.snapshot())
}

#[tauri::command]
pub fn list_scan_snapshots(
    state: State<'_, AppScanState>,
) -> Result<Vec<ScanSnapshot>, String> {
    state
        .list_snapshots()
        .map_err(|err| format!("list_scan_snapshots: scan state lock poisoned: {err}"))
}

fn execute_scan(
    root_path: PathBuf,
    drive_name: String,
    session: Arc<ScanSession>,
) -> Result<(), String> {
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

    let entries = fs::read_dir(current_path).map_err(|error| {
        format!(
            "failed to read directory {}: {error}",
            current_path.display()
        )
    })?;

    for entry in entries {
        if session.is_cancelled() {
            return Err(CANCELLED_ERROR.to_string());
        }

        let entry = entry.map_err(|error| format!("failed to read directory entry: {error}"))?;
        let file_type = entry.file_type().map_err(|error| {
            format!(
                "failed to read file type for {}: {error}",
                entry.path().display()
            )
        })?;
        if !file_type.is_dir() {
            // Symlinks are also skipped: DirEntry::file_type() returns the symlink type itself,
            // not the target, so symlinks to directories have is_dir() == false here.
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
        let classification = classify_folder_name(&folder_name);

        let relative_path = child_path
            .strip_prefix(root_path)
            .unwrap_or_else(|_| {
                // Should be structurally impossible: child_path comes from read_dir
                // of root_path, so it is always a descendant. If this fires it
                // indicates a symlink or race condition; log so we can diagnose.
                log::warn!(
                    "strip_prefix failed: {} is not under {} — storing absolute path as relative_path",
                    child_path.display(),
                    root_path.display()
                );
                &child_path
            })
            .to_string_lossy()
            .to_string();

        let project_id = session.register_match(
            folder_name,
            child_path.to_string_lossy().to_string(),
            relative_path,
            &classification,
            drive_name.to_string(),
        );
        // Spawn a recursive size worker only in "index_with_sizes" mode.
        // In "index" mode the project record carries size_status = "unknown"
        // and size_jobs_pending stays at zero, keeping the scan fast.
        if session.scan_mode != "index_only" {
            spawn_size_calculation(Arc::clone(session), project_id, child_path.clone());
        }

        // Intentionally no recursion: the scanner is a single-level sweep of the drive
        // root. Every top-level entry becomes a project record; nothing below is walked.
        // Keeps semantics predictable for the user and avoids depth-sensitive edge cases.
    }

    Ok(())
}

fn spawn_size_calculation(session: Arc<ScanSession>, project_id: String, path: PathBuf) {
    // H8: track the join handle on the session so Drop can wait for every
    // outstanding size worker. The worker holds its own Arc clone of the
    // session so it stays alive until the calc completes; the tracking Arc
    // is the one the rest of the app keeps for status queries.
    let worker_session = Arc::clone(&session);
    let handle = thread::spawn(move || {
        let result = calculate_directory_size(&path, &worker_session);
        worker_session.finish_size_job(&project_id, result);
    });
    session.register_size_worker(handle);
}

/// Maximum number of filesystem entries visited across the entire recursive walk
/// for a single project folder. Prevents runaway walks on extremely large trees.
/// When the ceiling is hit the function returns the partial size accumulated so
/// far — it does not error and does not return zero.
const MAX_SIZE_WALK_ENTRIES: u64 = 500_000;

fn calculate_directory_size(path: &Path, session: &ScanSession) -> Result<u64, String> {
    let mut entry_count = 0_u64;
    calculate_directory_size_inner(path, session, &mut entry_count)
}

fn calculate_directory_size_inner(
    path: &Path,
    session: &ScanSession,
    entry_count: &mut u64,
) -> Result<u64, String> {
    if session.is_cancelled() {
        return Err(CANCELLED_ERROR.to_string());
    }

    let entries = fs::read_dir(path)
        .map_err(|error| format!("failed to size {}: {error}", path.display()))?;
    let mut total_size = 0_u64;

    for entry in entries {
        if session.is_cancelled() {
            return Err(CANCELLED_ERROR.to_string());
        }

        *entry_count += 1;
        if *entry_count >= MAX_SIZE_WALK_ENTRIES {
            // Return partial size rather than erroring — the ceiling is a
            // safeguard against pathological trees, not a hard failure.
            // WARNING: the returned value is smaller than the real size.
            // The project record will show size_status="ready" with a partial
            // byte count. This is a known limitation; the UI does not yet
            // distinguish partial from complete sizes.
            // TODO: surface a "partial" SizeStatus variant so the UI can
            // render an approximate indicator instead of a precise number.
            log::warn!(
                "size walk ceiling ({MAX_SIZE_WALK_ENTRIES} entries) reached at {}: returning partial size {total_size} bytes — displayed size will be an undercount",
                path.display()
            );
            return Ok(total_size);
        }

        let entry = entry
            .map_err(|error| format!("failed to size entry in {}: {error}", path.display()))?;
        let metadata = entry.metadata().map_err(|error| {
            format!(
                "failed to read metadata for {}: {error}",
                entry.path().display()
            )
        })?;

        if metadata.is_file() {
            total_size += metadata.len();
        } else if metadata.is_dir() {
            total_size += calculate_directory_size_inner(&entry.path(), session, entry_count)?;
        }
    }

    Ok(total_size)
}

fn should_ignore_directory(name: &str) -> bool {
    name.starts_with('.') || IGNORED_SYSTEM_FOLDERS.contains(&name)
}

/// Returns true iff `value` is exactly 6 ASCII decimal digits (legacy `YYMMDD` date).
fn is_six_ascii_digits(value: &str) -> bool {
    value.len() == 6 && value.bytes().all(|b| b.is_ascii_digit())
}

/// Returns true iff `value` is exactly 10 bytes matching `YYYY-MM-DD`:
/// four ASCII digits, a hyphen, two ASCII digits, a hyphen, two ASCII digits.
fn is_ten_char_iso_date(value: &str) -> bool {
    let b = value.as_bytes();
    b.len() == 10
        && b[0].is_ascii_digit()
        && b[1].is_ascii_digit()
        && b[2].is_ascii_digit()
        && b[3].is_ascii_digit()
        && b[4] == b'-'
        && b[5].is_ascii_digit()
        && b[6].is_ascii_digit()
        && b[7] == b'-'
        && b[8].is_ascii_digit()
        && b[9].is_ascii_digit()
}

/// Classify a folder name into one of three types.
/// Never returns an error — every name produces a classification.
///
/// Rules (evaluated in order):
///
/// **New standard (preferred)**
///   1. `YYYY-MM-DD_ClientName - ProjectName` → `Client`
///
/// **Legacy (backward-compatible)**
///   2. `YYMMDD_ClientName_ProjectName` (client ≠ "Internal") → `Client`
///   3. `YYMMDD_Internal_ProjectName`                         → `PersonalProject`
///
/// **Fallback**
///   4. Anything else → `PersonalFolder`
fn classify_folder_name(name: &str) -> FolderClassification {
    const CLIENT_PROJECT_SEPARATOR: &str = " - ";

    if let Some((date, rest)) = name.split_once('_') {
        if let Some((client, project)) = rest.split_once(CLIENT_PROJECT_SEPARATOR) {
            if client.is_empty() || project.is_empty() {
                return FolderClassification::PersonalFolder;
            }

            if is_ten_char_iso_date(date) {
                return FolderClassification::Client {
                    date: date.to_string(),
                    client: client.to_string(),
                    project: project.to_string(),
                };
            }
        }
    }

    let parts: Vec<&str> = name.split('_').collect();

    // Legacy conventions produce exactly 3 tokens when split by '_'.
    if parts.len() == 3 {
        let date = parts[0];
        let client = parts[1];
        let project = parts[2];

        if client.is_empty() || project.is_empty() {
            return FolderClassification::PersonalFolder;
        }

        // ── Legacy: YYMMDD_Client_Project or YYMMDD_Internal_Project ────────
        if is_six_ascii_digits(date) {
            return if client == "Internal" {
                FolderClassification::PersonalProject {
                    date: date.to_string(),
                    project: project.to_string(),
                }
            } else {
                FolderClassification::Client {
                    date: date.to_string(),
                    client: client.to_string(),
                    project: project.to_string(),
                }
            };
        }
    }

    FolderClassification::PersonalFolder
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
#[allow(clippy::disallowed_methods)] // test fixtures legitimately create and write temp directories
mod tests {
    use super::*;
    use tempfile::tempdir;

    // ── New standard: YYYY-MM-DD_Client - Project ───────────────────────────

    #[test]
    fn classifies_new_standard_yyyy_mm_dd_folders() {
        let c = classify_folder_name("2024-03-12_Richemont - EventRecap");
        assert!(matches!(c, FolderClassification::Client { .. }));
        assert_eq!(c.folder_type_str(), "client");
        assert_eq!(c.parsed_date(), Some("2024-03-12"));
        assert_eq!(c.parsed_client(), Some("Richemont"));
        assert_eq!(c.parsed_project(), Some("EventRecap"));

        let c = classify_folder_name("2024-06-05_Decathlon - RunningCampaign");
        assert_eq!(c.parsed_date(), Some("2024-06-05"));
        assert_eq!(c.parsed_client(), Some("Decathlon"));

        let c = classify_folder_name("2023-09-11_Fuerteventura - SurfDoc");
        assert_eq!(c.parsed_date(), Some("2023-09-11"));
        assert_eq!(c.parsed_client(), Some("Fuerteventura"));
    }

    #[test]
    fn rejects_old_iso_underscore_shape_as_non_standard() {
        let c = classify_folder_name("2024-03-12_Richemont_EventRecap");
        assert!(matches!(c, FolderClassification::PersonalFolder));
        assert_eq!(c.folder_type_str(), "personal_folder");
    }

    // ── Legacy YYMMDD format (backward-compat) ───────────────────────────────

    #[test]
    fn classifies_legacy_client_folders() {
        let c = classify_folder_name("240401_Apple_ProductShoot");
        assert!(matches!(c, FolderClassification::Client { .. }));
        assert_eq!(c.folder_type_str(), "client");
        assert_eq!(c.parsed_date(), Some("240401"));
        assert_eq!(c.parsed_client(), Some("Apple"));
        assert_eq!(c.parsed_project(), Some("ProductShoot"));
    }

    #[test]
    fn classifies_legacy_personal_project_when_client_is_internal() {
        let c = classify_folder_name("240401_Internal_Archive");
        assert!(matches!(c, FolderClassification::PersonalProject { .. }));
        assert_eq!(c.folder_type_str(), "personal_project");
        assert_eq!(c.parsed_date(), Some("240401"));
        assert_eq!(c.parsed_client(), None);
        assert_eq!(c.parsed_project(), Some("Archive"));
    }

    // ── personal_folder fallback ─────────────────────────────────────────────

    #[test]
    fn classifies_personal_folder_for_non_standard_names() {
        // Too few parts
        let c = classify_folder_name("240401_Apple");
        assert!(matches!(c, FolderClassification::PersonalFolder));

        // Too many parts (underscores in project name)
        let c = classify_folder_name("240401_Apple_Product_Shoot");
        assert!(matches!(c, FolderClassification::PersonalFolder));

        // Non-digit date (legacy path)
        let c = classify_folder_name("24A401_Apple_ProductShoot");
        assert!(matches!(c, FolderClassification::PersonalFolder));

        // Empty client
        let c = classify_folder_name("240401__ProductShoot");
        assert!(matches!(c, FolderClassification::PersonalFolder));

        // Plain folder name
        let c = classify_folder_name("Archive");
        assert!(matches!(c, FolderClassification::PersonalFolder));

        // Internal-like but not exact case (legacy path treats it as client)
        let c = classify_folder_name("240401_internal_Archive");
        assert!(
            matches!(c, FolderClassification::Client { .. }),
            "lowercase 'internal' is a client name, not personal_project"
        );
    }

    // ── index_only mode ──────────────────────────────────────────────────────

    #[test]
    fn index_only_mode_sets_unknown_size_status_and_no_pending_jobs() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path();
        fs::create_dir(root.join("240401_Apple_ProductShoot")).expect("project");
        fs::write(
            root.join("240401_Apple_ProductShoot").join("file.mov"),
            vec![0_u8; 256],
        )
        .expect("file");

        let session = Arc::new(ScanSession::new(
            "scan-index-only".to_string(),
            root.to_string_lossy().to_string(),
            "Drive A".to_string(),
            "index_only".to_string(),
        ));

        execute_scan(
            root.to_path_buf(),
            "Drive A".to_string(),
            Arc::clone(&session),
        )
        .expect("scan should succeed");

        let snapshot = session.snapshot();
        assert_eq!(snapshot.scan_mode, "index_only");
        assert_eq!(
            snapshot.size_jobs_pending, 0,
            "index_only must not spawn size workers"
        );
        assert!(
            snapshot.projects.iter().all(|p| p.size_status == "unknown"),
            "all projects must have size_status=unknown in index_only mode"
        );
        // No size workers should have been registered
        let workers = session.size_workers.lock().expect("workers");
        assert!(
            workers.is_empty(),
            "no size worker handles registered in index_only mode"
        );
    }

    #[test]
    fn ignores_hidden_and_system_folders() {
        assert!(should_ignore_directory(".hidden"));
        assert!(should_ignore_directory(".Spotlight-V100"));
        assert!(should_ignore_directory("DCIM"));
        assert!(should_ignore_directory("MISC"));
        assert!(should_ignore_directory("LOST+FOUND"));
        assert!(should_ignore_directory("$RECYCLE.BIN"));
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
        fs::write(
            direct_project.join("nested").join("grade.cube"),
            vec![0_u8; 32],
        )
        .expect("nested file");

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
            "index_with_size".to_string(),
        ));

        execute_scan(
            root.to_path_buf(),
            "Drive A".to_string(),
            Arc::clone(&session),
        )
        .expect("scan should succeed");

        for _ in 0..50 {
            if session.snapshot().size_jobs_pending == 0 {
                break;
            }
            thread::sleep(std::time::Duration::from_millis(10));
        }

        let snapshot = session.snapshot();
        assert_eq!(snapshot.status, "running");
        // Depth=1 sweep: only top-level entries are recorded.
        // Finds: 240401_Apple_ProductShoot (client), Archive (personal_folder), Deep (personal_folder).
        assert_eq!(snapshot.matches_found, 3);
        assert_eq!(snapshot.projects.len(), 3);
        assert!(snapshot
            .projects
            .iter()
            .all(|project| project.size_status == "ready"));

        // Top-level structured project is present
        assert!(snapshot
            .projects
            .iter()
            .any(|p| p.folder_name == "240401_Apple_ProductShoot" && p.folder_type == "client"));

        // Top-level unstructured containers are recorded as personal_folder
        assert!(snapshot
            .projects
            .iter()
            .any(|p| p.folder_name == "Archive" && p.folder_type == "personal_folder"));
        assert!(snapshot
            .projects
            .iter()
            .any(|p| p.folder_name == "Deep" && p.folder_type == "personal_folder"));

        // Nothing below the top level is walked
        assert!(!snapshot
            .projects
            .iter()
            .any(|p| p.folder_name == "240320_Nike_Ad"));
        assert!(!snapshot
            .projects
            .iter()
            .any(|p| p.folder_name == "LevelTwo"));
        assert!(!snapshot
            .projects
            .iter()
            .any(|p| p.folder_name == "240228_Too_Deep"));

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
        fs::write(
            root.join("240401_Apple_ProductShoot").join("capture.mov"),
            vec![0_u8; 128],
        )
        .expect("file");

        let session = Arc::new(ScanSession::new(
            "scan-cancel".to_string(),
            root.to_string_lossy().to_string(),
            "Drive A".to_string(),
            "index_with_size".to_string(),
        ));
        session.cancel_requested.store(true, Ordering::Relaxed);

        let result = calculate_directory_size(&root.join("240401_Apple_ProductShoot"), &session);
        assert_eq!(result.unwrap_err(), CANCELLED_ERROR.to_string());
    }

    #[test]
    fn cancel_racing_before_finalization_is_overwritten_by_mark_completed() {
        // H5: cancel() runs after execute_scan returns Ok but before
        // mark_completed(). cancel() sees finalized=false and eagerly writes
        // "cancelled" to the snapshot so the UI sees the transition. The
        // scan thread then calls mark_completed(), which atomically flips
        // `finalized` under the snapshot lock and overwrites "cancelled"
        // with "completed" — because execute_scan actually succeeded,
        // completed is the correct terminal state.
        let temp = tempdir().expect("tempdir");
        let root = temp.path();
        fs::create_dir(root.join("Archive")).expect("archive");

        let session = Arc::new(ScanSession::new(
            "scan-race".to_string(),
            root.to_string_lossy().to_string(),
            "Drive A".to_string(),
            "index_with_size".to_string(),
        ));

        execute_scan(
            root.to_path_buf(),
            "Drive A".to_string(),
            Arc::clone(&session),
        )
        .expect("scan should succeed");

        // cancel() wins to lock and writes "cancelled"
        session.cancel();
        assert_eq!(session.snapshot().status, "cancelled");
        assert!(!session.is_finalized());

        // mark_completed() overwrites since finalized was still false
        session.mark_completed();
        assert!(session.is_finalized());

        let snapshot = session.snapshot();
        assert_eq!(
            snapshot.status, "completed",
            "completed must win over a race-written cancelled"
        );
    }

    #[test]
    fn cancel_after_finalization_is_a_noop() {
        // H5: once a mark_* has run and set `finalized`, any subsequent
        // cancel() must not mutate the snapshot and must not set
        // cancel_requested. A finalized session is immutable.
        let temp = tempdir().expect("tempdir");
        let root = temp.path();
        fs::create_dir(root.join("Archive")).expect("archive");

        let session = Arc::new(ScanSession::new(
            "scan-complete".to_string(),
            root.to_string_lossy().to_string(),
            "Drive A".to_string(),
            "index_with_size".to_string(),
        ));

        execute_scan(
            root.to_path_buf(),
            "Drive A".to_string(),
            Arc::clone(&session),
        )
        .expect("scan should succeed");
        session.mark_completed();
        assert!(session.is_finalized());

        session.cancel();

        let snapshot = session.snapshot();
        assert_eq!(snapshot.status, "completed");
        assert!(
            !session.is_cancelled(),
            "cancel() after finalization must not set cancel_requested"
        );
    }

    #[test]
    fn mark_failed_after_cancel_is_noop_when_cancel_won_first() {
        // H5: if mark_cancelled runs first (via CANCELLED_ERROR unwind),
        // a subsequent mark_failed must not overwrite it because finalized
        // is already set.
        let session = Arc::new(ScanSession::new(
            "scan-double-terminal".to_string(),
            "/tmp".to_string(),
            "Drive A".to_string(),
            "index_with_size".to_string(),
        ));

        session.mark_cancelled();
        assert_eq!(session.snapshot().status, "cancelled");
        assert!(session.is_finalized());

        session.mark_failed("IO error".to_string());

        let snapshot = session.snapshot();
        assert_eq!(
            snapshot.status, "cancelled",
            "first terminal transition must win; mark_failed must not overwrite"
        );
        assert_eq!(snapshot.error.as_deref(), Some(CANCELLED_ERROR));
    }

    #[test]
    fn mark_completed_is_idempotent() {
        let session = Arc::new(ScanSession::new(
            "scan-idempotent".to_string(),
            "/tmp".to_string(),
            "Drive A".to_string(),
            "index_with_size".to_string(),
        ));

        session.mark_completed();
        let first_finished_at = session.snapshot().finished_at.clone();
        assert!(first_finished_at.is_some());

        // A second call must be a no-op and must not update finished_at.
        session.mark_completed();
        let second_finished_at = session.snapshot().finished_at.clone();
        assert_eq!(first_finished_at, second_finished_at);
    }

    #[test]
    fn size_workers_are_tracked_and_joinable() {
        // H8: every spawned size worker must be registered on the session
        // so drain_and_join_size_workers can synchronously wait for them.
        // After joining, size_jobs_pending must be zero.
        let temp = tempdir().expect("tempdir");
        let root = temp.path();
        for i in 0..3 {
            let project_name = format!("24040{i}_Client_Proj{i}");
            let project = root.join(&project_name);
            fs::create_dir(&project).expect("project");
            fs::write(project.join("file.bin"), vec![0_u8; 2048]).expect("file");
        }

        let session = Arc::new(ScanSession::new(
            "scan-sizes".to_string(),
            root.to_string_lossy().to_string(),
            "Drive A".to_string(),
            "index_with_size".to_string(),
        ));

        execute_scan(
            root.to_path_buf(),
            "Drive A".to_string(),
            Arc::clone(&session),
        )
        .expect("scan should succeed");

        // At least one worker should have been spawned.
        {
            let guard = session.size_workers.lock().expect("size workers");
            assert_eq!(guard.len(), 3, "one worker per registered match");
        }

        session.drain_and_join_size_workers();

        let snapshot = session.snapshot();
        assert_eq!(
            snapshot.size_jobs_pending, 0,
            "all workers must have decremented the pending counter by the time join returns"
        );
        assert!(snapshot.projects.iter().all(|p| p.size_status == "ready"));

        // After draining, the worker list is empty.
        let guard = session.size_workers.lock().expect("size workers");
        assert!(guard.is_empty());
    }

    #[test]
    fn dropping_session_signals_cancel_and_joins_workers() {
        // H8: dropping a ScanSession must not leak detached size workers.
        // We trigger a scan, drop the outer Arc, and verify (via an indirect
        // signal — the unique owner path) that Drop runs without hanging.
        let temp = tempdir().expect("tempdir");
        let root = temp.path();
        let project = root.join("240401_Apple_ProductShoot");
        fs::create_dir(&project).expect("project");
        fs::write(project.join("capture.mov"), vec![0_u8; 256]).expect("file");

        let session = Arc::new(ScanSession::new(
            "scan-drop".to_string(),
            root.to_string_lossy().to_string(),
            "Drive A".to_string(),
            "index_with_size".to_string(),
        ));

        execute_scan(
            root.to_path_buf(),
            "Drive A".to_string(),
            Arc::clone(&session),
        )
        .expect("scan should succeed");

        // Size workers may still be running — don't wait for them here.
        // Arc::try_unwrap succeeds only when this is the sole reference,
        // so we can drop the session directly and trigger its Drop impl.
        // Any workers still holding their own clone will release it inside
        // finish_size_job, after which the session's real drop runs.
        match Arc::try_unwrap(session) {
            Ok(owned) => {
                // Drop runs here: should signal cancel + join all workers.
                drop(owned);
            }
            Err(still_shared) => {
                // A worker thread still holds an Arc. Wait for it to release
                // by joining outstanding workers, then drop.
                still_shared.drain_and_join_size_workers();
                match Arc::try_unwrap(still_shared) {
                    Ok(owned) => drop(owned),
                    Err(_) => panic!("size worker thread leaked an Arc reference"),
                }
            }
        }

        // If we reach this line, Drop returned — no hang, no leak.
    }
}
