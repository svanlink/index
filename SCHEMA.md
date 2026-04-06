# Drive Project Catalog — Database Schema Draft

## 1. Tables

### drives
| field | type | notes |
|---|---|---|
| id | uuid / text | primary key |
| volume_name | text | scanned drive name |
| display_name | text | editable if needed |
| total_capacity_bytes | bigint nullable | populated from scan |
| used_bytes | bigint nullable | populated from scan |
| free_bytes | bigint nullable | populated from scan |
| reserved_incoming_bytes | bigint default 0 | derived or materialized |
| created_manually | boolean default false | true if user-created |
| last_scanned_at | timestamptz nullable | last successful scan |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### projects
| field | type | notes |
|---|---|---|
| id | uuid / text | primary key |
| parsed_date | text | YYMMDD |
| parsed_client | text | raw imported value |
| parsed_project | text | raw imported value |
| corrected_client | text nullable | manual correction |
| corrected_project | text nullable | manual correction |
| category | text nullable | enum-like |
| size_bytes | bigint nullable | total project folder size |
| size_status | text | unknown / pending / ready / failed |
| current_drive_id | text nullable | FK to drives |
| target_drive_id | text nullable | FK to drives |
| move_status | text | none / pending |
| missing_status | text | normal / missing |
| duplicate_status | text | normal / duplicate |
| is_unassigned | boolean default false | |
| is_manual | boolean default false | |
| last_seen_at | timestamptz nullable | last observed in scan |
| last_scanned_at | timestamptz nullable | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### scans
| field | type | notes |
|---|---|---|
| id | uuid / text | primary key |
| drive_id | text nullable | FK to drives |
| started_at | timestamptz | |
| finished_at | timestamptz nullable | |
| status | text | running / completed / cancelled / failed |
| folders_scanned | integer default 0 | |
| matches_found | integer default 0 | |
| notes | text nullable | |

### project_scan_events
| field | type | notes |
|---|---|---|
| id | uuid / text | primary key |
| project_id | text | FK to projects |
| scan_id | text | FK to scans |
| observed_folder_name | text | matched folder name |
| observed_drive_name | text | snapshot |
| observed_at | timestamptz | |

## 2. Derived Display Fields

These do not need to be stored if you prefer to compute them:

- `display_client = corrected_client ?? parsed_client`
- `display_project = corrected_project ?? parsed_project`

## 3. Suggested Enums

### category
- photo
- video
- design
- mixed
- personal

### size_status
- unknown
- pending
- ready
- failed

### move_status
- none
- pending

### missing_status
- normal
- missing

### duplicate_status
- normal
- duplicate

### scan status
- running
- completed
- cancelled
- failed

## 4. Duplicate Rule

Duplicate warning if:
- parsed_date equal
- parsed_client equal
- parsed_project equal
- current_drive_id differs

This can be computed in a query layer or materialized when scan completes.

## 5. Missing Rule

If a project was previously observed on a scanned drive and is absent from a later scan of that same drive:
- set missing_status = missing
- preserve current_drive_id

## 6. Manual Project Rule

If user creates a project manually:
- set is_manual = true
- allow current_drive_id null
- set is_unassigned = true when no drive assigned

## 7. Indexing Suggestions

Add indexes for:
- projects(parsed_date)
- projects(parsed_client)
- projects(parsed_project)
- projects(current_drive_id)
- projects(category)
- scans(drive_id)
- scans(status)
