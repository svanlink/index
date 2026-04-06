# Drive Project Catalog — Product Specification

## 1. Product Summary

Drive Project Catalog is a **project-first cataloging app for external hard drives**. It is designed to help a solo creative professional keep track of projects stored across multiple drives without depending on the drives being connected all the time.

The application is **not** a file manager, backup utility, or sync client. It does **not** move, rename, or edit real files automatically. Instead, it creates a virtual catalog of projects and their metadata.

The primary purpose is to answer questions like:

- Which drive is this project on?
- Which projects are missing?
- Which projects are duplicates on multiple drives?
- Which projects still need to be moved?
- How much space is left on each drive?
- Which projects have not yet been assigned to a drive?

---

## 2. Core Principles

1. The app is **project-first**, not drive-first.
2. The app catalogs **project folders**, not full file trees.
3. Filesystem changes are **never performed automatically**.
4. Manual scanning is the source of imported metadata.
5. The database is the **operational source of truth** for cataloging and planning.
6. Physical filesystem state is used as a **reference**, not as the only state model.
7. The system must support **offline-first use** with later sync.

---

## 3. Naming Convention

The scan engine only indexes folders that match this strict pattern:

`YYMMDD_Client_Project`

Examples:
- `240312_Nike_Campaign`
- `240401_Apple_ProductShoot`
- `240215_Adidas_SocialContent`

### Rules
- Exact match only
- Underscore-delimited
- Date is six digits
- Only folders matching this format are accepted automatically

### Non-matching folders
- Ignored by automatic scan
- Can later be handled manually
- Borderline or unexpected folders should not silently become projects

---

## 4. Scan Rules

### Scan trigger
- Manual only
- User explicitly chooses when to scan

### Scan depth
- Depth = 2

### Scan scope
- Ignore hidden folders
- Ignore system folders
- Stop descending once a valid project folder is found

### Size calculation
- Total project folder size only
- Size is computed in the background after the scan
- No file-level indexing in V1

### Scan output
For every detected project folder:
- parsed date
- parsed client
- parsed project
- source drive name
- scan timestamp
- size job

---

## 5. Project Model

Each project record stores both imported and operational metadata.

### Imported / parsed fields
- parsed_date
- parsed_client
- parsed_project

### User-corrected fields
- corrected_client
- corrected_project

### Display logic
Use corrected values when present; otherwise use parsed values.

### Additional fields
- category
- size_bytes
- size_status
- current_drive_id
- target_drive_id
- move_status
- missing_status
- duplicate_status
- is_unassigned
- is_manual
- last_seen_at
- last_scanned_at
- created_at
- updated_at

---

## 6. Categories

Single-select categories:
- photo
- video
- design
- mixed
- personal

Category is assigned manually.

---

## 7. Drive Model

Each drive stores:
- volume_name
- display_name
- total_capacity_bytes
- used_bytes
- free_bytes
- reserved_incoming_bytes
- last_scanned_at
- created_manually
- created_at
- updated_at

### Drive creation
A drive can be created:
- automatically from a scan
- manually even when not connected

### Space logic
- Free space uses real scan data
- Planned incoming moves reserve space
- Unknown-size projects can still be assigned, but should show unknown impact

---

## 8. Duplicate Detection

Duplicate warning if:
- parsed_date matches
- parsed_client matches
- parsed_project matches
- drive differs

Duplicate handling:
- warning only
- no forced resolution in V1
- both records remain visible

---

## 9. Missing Projects

If a project existed previously on a scanned drive and is no longer found:
- mark it as missing
- keep prior drive association
- do not delete the record

UI treatment:
- greyed out
- “Missing” badge

---

## 10. Unassigned Projects

Projects may exist without any current drive assignment.

This happens when:
- a project is created manually
- a project is planned before archival
- drive is unknown

Rules:
- unassigned projects appear in global project views
- they should be visually tagged
- no reminder counter is required for unassigned projects in V1

---

## 11. Move Workflow

The move workflow is virtual and planning-oriented.

### Project fields involved
- current_drive_id
- target_drive_id
- move_status

### Workflow
1. User selects target drive
2. Project becomes move pending
3. Target drive reserves space
4. User physically moves the folder outside the app
5. User clicks **Confirm moved**
6. Target drive becomes current drive
7. Move state clears

### Cancellation
If the move is cancelled:
- restore original assignment
- clear target drive and move status

---

## 12. Dashboard

The dashboard should include:
- last 2 scanned drives
- 5 recent projects
- move reminders
- quick search
- missing projects
- duplicate projects
- unassigned projects

### Last 2 scanned drive cards
Show:
- drive name
- project count
- total capacity
- free space
- reserved space
- last scan date

---

## 13. Views

### Projects
Primary list view.
Default sort:
- newest date first

Search matches:
- client
- project
- date
- drive
- category

### Drives
Drive overview list with capacity and usage details.

### Project Detail
Must include:
- parsed fields
- corrected fields
- category
- size
- current drive
- target drive
- status badges
- confirm moved action

### Drive Detail
Must include:
- capacity
- free space
- reserved incoming
- project count
- projects on drive

---

## 14. Platforms

### macOS app
Main application. Full functionality:
- scan
- edit
- search
- plan moves
- create manual projects
- create manual drives

### Web app
Read/write metadata and planning:
- browse
- search
- edit
- assign
- plan moves

### Mobile
Read-oriented:
- search
- check status
- check location

No scanning in mobile.

---

## 15. V1 Scope

Included in MVP:
- manual scan
- strict parser
- projects list
- drives list
- dashboard
- project detail
- drive detail
- manual project creation
- manual drive creation
- duplicate warnings
- missing detection
- move planning
- reserved space logic
- offline-first local data layer
- sync-ready abstraction

Excluded from MVP:
- file-level indexing
- auto-drive detection
- bulk moves
- team collaboration
- authentication
- thumbnails
- notes attachments
- duplicate resolution workflow
