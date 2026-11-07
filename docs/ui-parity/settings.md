# Page Parity: /settings

Comparison of visible UI elements between origin/main (reference) and work/flow1-run (current).

Audit method: source comparison of origin/main vs work/flow1-run. Note: origin/main's web build has pre-existing TypeScript errors so it cannot be built/served for a two-build Playwright render comparison; the comparison below is source-based. The sidebar navigation was intentionally redesigned in U2 (per IA_DESIGN.md) — origin/main's old sidebar buttons are superseded by the current collapsible groups and are not "missing" items. MySpeed does not exist and is explicitly excluded.

## Headings

### Present on main, missing now:
None (current renders Settings h1 plus Appearance, Notifications, Keyboard Shortcuts, MeshCentral, About sections — matching origin/main)

### Present now, not on main:
None

## Buttons

### Present on main, missing now:
None (sidebar redesign is intentional; see note above). Sync Fleet is present in current.

### Present now, not on main:
None (current sidebar buttons belong to the redesigned nav)

## Tabs

### Present on main, missing now:
None

### Present now, not on main:
None

## Table Column Headers

### Present on main, missing now:
None

### Present now, not on main:
None

## Verdict
At parity (current is at or above origin/main: Appearance, Notifications, Keyboard Shortcuts, MeshCentral, About sections all present, plus Sync Fleet button). No missing non-dropped items to implement.
