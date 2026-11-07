# Page Parity: /dashboard

Comparison of visible UI elements between origin/main (reference) and work/flow1-run (current).

Audit method: source comparison of origin/main vs work/flow1-run. Note: origin/main's web build has pre-existing TypeScript errors so it cannot be built/served for a two-build Playwright render comparison; the comparison below is source-based. The sidebar navigation was intentionally redesigned in U2 (per IA_DESIGN.md) — origin/main's old sidebar buttons are superseded by the current collapsible groups and are not "missing" items. MySpeed does not exist and is explicitly excluded (it is NOT present in current, by design).

## Headings

### Present on main, missing now:
None (current renders Fleet Overview h1, Critical Alerts, Quick Actions, Service Health, and device labels This Machine / Unraid Server / Galaxy S24 Ultra / ROG Ally — matching origin/main)

### Present now, not on main:
None

## Buttons

### Present on main, missing now:
None (sidebar redesign is intentional; see note above). Dashboard action buttons Refresh, Reset, Fleet Health, Refresh All, Reboot Unraid, Docker Containers, Storage Array, Ring Phone, Screenshot Phone are present in current.

### Present now, not on main:
None (current sidebar buttons belong to the redesigned nav)

## Tabs

### Present on main, missing now:
None

### Present now, not on main:
None

## Table Column Headers

### Present on main, missing now:
None (dashboard uses device cards/gauges rather than a table; both builds match)

### Present now, not on main:
None

## Verdict
At parity (current matches origin/main; origin/main's Service Health lists MySpeed which does not exist and is correctly omitted — current lists the single Arr section for Lidarr/Sonarr/Radarr). No missing non-dropped items to implement.
