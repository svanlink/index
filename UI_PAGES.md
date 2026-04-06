# Drive Project Catalog — UI Pages

## 1. App Shell

### Desktop / Web Layout
- Left sidebar navigation
- Main content area
- Top utility area for search + scan action
- Clean, minimal, professional visual language

### Sidebar items
- Dashboard
- Projects
- Drives
- Settings

---

## 2. Dashboard

### Sections
1. **Recent Scans**
   - show last 2 scanned drives
   - drive name
   - last scan date
   - project count
   - total / free / reserved capacity

2. **Recent Projects**
   - show 5 recent projects
   - display name
   - date
   - size
   - drive

3. **Move Reminders**
   - projects with move_status = pending
   - show current drive -> target drive
   - quick open action

4. **Quick Search**
   - global search input
   - immediate open into results / detail

5. **Status Alerts**
   - missing projects
   - duplicate projects
   - unassigned projects

---

## 3. Projects List

### Core table fields
- date
- client
- project
- size
- category
- current drive
- status badges

### Filters / tabs
- all
- unassigned
- missing
- duplicates

### Behaviors
- default sort: newest date first
- inline move action
- inline edit shortcut
- open detail on row click

---

## 4. Project Detail

### Header
- display project name
- badges: missing / duplicate / unassigned / move pending

### Fields
- parsed date
- parsed client
- parsed project
- corrected client
- corrected project
- category
- size
- current drive
- target drive
- last seen
- last scanned

### Actions
- edit corrections
- change category
- set target drive
- confirm moved
- cancel move

---

## 5. Drives List

### Card or row fields
- drive name
- total capacity
- free space
- reserved incoming
- project count
- last scan date

### Actions
- open detail
- create drive manually

---

## 6. Drive Detail

### Summary
- drive name
- total capacity
- used
- free
- reserved incoming
- last scan

### Content
- projects on this drive
- move-pending incoming projects
- missing projects formerly associated with this drive

---

## 7. Manual Project Creation

### Fields
- date
- client
- project
- category
- size optional
- drive optional

Default behavior:
- if drive not selected -> unassigned
- if size omitted -> unknown impact

---

## 8. Manual Drive Creation

### Fields
- drive name
- display name optional
- capacity optional

---

## 9. Scan View / Modal

### During scan
- drive name
- folders scanned count
- matches found count
- cancellable progress state

### After scan
- summary card
- new projects found
- updated projects
- missing projects
- duplicates flagged

---

## 10. Mobile

Read-oriented priority:
- search
- project lookup
- drive lookup
- status badges
- location checking

No scan UI in V1 mobile.
