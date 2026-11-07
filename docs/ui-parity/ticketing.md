# Page Parity: /ticketing

Comparison of visible UI elements between origin/main (reference) and work/flow1-run (current).

Audit method: source comparison of origin/main vs work/flow1-run. Note: origin/main's web build has pre-existing TypeScript errors (missing `../ui/Label` in the ticketing page) so it cannot be built/served for a two-build Playwright render comparison; the comparison below is source-based. The sidebar navigation was intentionally redesigned in U2 (per IA_DESIGN.md) — origin/main's old sidebar buttons are superseded by the current collapsible groups and are not "missing" items. MySpeed does not exist and is explicitly excluded.

## Headings

### Present on main, missing now:
None

### Present now, not on main:
None

## Buttons

### Present on main, missing now:
None (sidebar redesign is intentional; see note above)

### Present now, not on main:
None (current sidebar buttons belong to the redesigned nav)

## Tabs

### Present on main, missing now:
None

### Present now, not on main:
None

## Table Column Headers

### Present on main, missing now:
None (current table renders ID, Title, Status, Priority, Client, Hours, Total, Invoice — origin/main's Ticket/Title/Status/Client/Hours/Total/Invoice are present; current additionally shows Priority)

### Present now, not on main:
None

## Verdict
At parity (current is at or above origin/main: filter chips all/open/mine/waiting/closed, search, sort by priority/due/updated, full description with line breaks preserved, hours and amount totals, status change, add worklog, and generate invoice all work against the stub backend). No missing non-dropped items to implement.
