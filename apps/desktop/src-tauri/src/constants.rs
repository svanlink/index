//! Shared constants used across scan_engine and volume_import.

/// System / recovery folders skipped during both scanning and volume import.
/// Any entry whose name appears here is treated as infrastructure, not a
/// project folder, regardless of drive filesystem or OS.
pub(crate) const IGNORED_SYSTEM_FOLDERS: &[&str] = &[
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
