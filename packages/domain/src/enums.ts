export const folderTypeValues = ["client", "personal_project", "personal_folder"] as const;
export type FolderType = (typeof folderTypeValues)[number];

export const categoryValues = ["photo", "video", "design", "mixed", "personal"] as const;
export type Category = (typeof categoryValues)[number];

export const sizeStatusValues = ["unknown", "pending", "ready", "failed"] as const;
export type SizeStatus = (typeof sizeStatusValues)[number];

export const moveStatusValues = ["none", "pending"] as const;
export type MoveStatus = (typeof moveStatusValues)[number];

export const missingStatusValues = ["normal", "missing"] as const;
export type MissingStatus = (typeof missingStatusValues)[number];

export const duplicateStatusValues = ["normal", "duplicate"] as const;
export type DuplicateStatus = (typeof duplicateStatusValues)[number];

export const scanStatusValues = ["running", "completed", "cancelled", "failed", "interrupted"] as const;
export type ScanStatus = (typeof scanStatusValues)[number];
