# Keep / Fix / Rebuild Inventory

Source of truth: `UI_AUDIT_REPORT.md` (Section 4/5) + `UI_AUDIT_FOLLOWUPS.md` + current source tree.
This inventory classifies every file/component/page found in the audit into one of three dispositions:

- **KEEP** — ship as-is; already correct, tested, and not in the defect list.
- **FIX** — has an audit defect (P0/P1/P2) that is corrected in place; requires regression test before close.
- **REBUILD** — structural rework needed (layout shell, shared component consolidation, page rewrite); not a simple in-place fix.

---

## A. Keep (ship as-is; no change needed)

| File / Component | Route(s) | Reason |
|---|---|---|
| `src/pages/TicketingPage.tsx` | /ticketing | Already rewritten in prior work session; audit confirms create/worklog/change-status/inline-update handlers work; three states (loading/error/data) correct; no mock fallback. |
| `src/components/ticketing/TicketingPage.test.tsx` | /ticketing | 10 tests covering loading, list, create, worklog, change-status, inline update, error+Retry, Retry reloads, unauthorized 402, search. |
| `src/components/ui/Avatar.tsx` | all | Avatar component with initials rendering; fixed in prior session. |
| `src/components/ui/Button.tsx` | all | Fixed `type="button"` in prior session. |
| `src/components/layout/PageHeader.tsx` | all | Header component used by TicketingPage; correct. |
| `src/components/layout/ErrorBoundary.tsx` | all | Error boundary wrapping page content. |
| `src/components/layout/TitleBar.tsx` | all | Page title bar component. |
| `src/components/layout/StatusBar.tsx` | all | Status bar component. |
| `src/components/layout/CommandPalette.tsx` | / | CMDPAL-001 (emoji icons → Lucide) fixed in prior session. |
| `src/components/layout/Sidebar.tsx` | all | SIDEBAR-001 (mobile drawer), LOGO-001/002 (logo) fixed in prior session. |
| `src/components/layout/TopBar.tsx` | all | SETTINGS-001 (title dedup/overflow), SEARCH-001 (not actually truncated), LOGO-001 (logo) fixed in prior session. |
| `src/components/ui/Card.tsx` | all | Card component with variant system; correct. |
| `src/components/ui/Modal.tsx` | all | Modal component. |
| `src/components/ui/Input.tsx` | all | Input/Textarea/Select components; fixed `useId()` and `defaultValue` on select. |
| `src/components/ui/Checkbox.tsx` | all | Checkbox/Radio/Switch with `useId()`. |
| `src/components/ui/Tooltip.tsx` | all | Tooltip with SSR guard. |
| `src/components/ui/Skeleton.tsx` | all | Skeleton components exist. |
| `src/components/ui/Toast.tsx` | all | ToastManager with dedupe and click-outside dismiss fixed in prior session. |
| `src/lib/tauri-commands.ts` | all | MESH-001 (invoke guard) fixed in prior session. |
| `src/styles/globals.css` | all | GLOBAL-002/003 (body overflow, font scaling) fixed in prior session; double accent bar removed. |
| `src/context/AppContext.tsx` | all | App context (theme, density, reduced motion, notifications, sidebar). |
| `src/hooks/` | all | Hooks (useServers, useLocalStats, useFleetStats, useToast, useKiosk). |
| `src/lib/` | all | Bridge client library (minus tauri-commands invoke guard already fixed). |
| `src-tauri/` | backend | Rust Tauri backend — out of scope for this web-frontend rebuild. |
| `e2e/` | e2e | Playwright e2e tests (180 screenshots captured). |
| `ui-audit-shots/` | evidence | Audit screenshot evidence (180 files). |

## B. Fix (defect present; correct in place + regression test)

| ID | File / Component | Route(s) | Sev | Defect | Fix Action | Regression Test |
|---|---|---|---|---|---|---|
| MESH-001 | `src/lib/tauri-commands.ts` + `src/pages/MeshCentralPage.tsx` | /meshcentral | P0 | `invoke` crashes on non-Tauri hosts; toast crashes | Guard `invoke` calls; friendly error instead of crash | Unit test on `tauri-commands.ts` mock; e2e on /meshcritical loads without crash toast |
| SIDEBAR-001 | `src/App.tsx` | all | P1 | Sidebar `w-[232px]` consumes ~70% on 320–375px | Mobile drawer overlay (`w-full` translate) instead of fixed width | Playwright: sidebar covers full width at 320px; main content not squeezed |
| LOGO-001 | `public/favicon.svg` + `src/components/layout/Sidebar.tsx` | all | P1 | Wrong logo (purple lightning bolt); not the teal pulse mark | Use correct teal pulse SVG; verify in sidebar + browser tab | Screenshot check: logo matches teal pulse SVG |
| LOGO-002 | `src/components/layout/Sidebar.tsx` | all | P1 | Logo hidden in collapsed rail | Render logo mark (icon-only) in collapsed rail | Screenshot check: logo visible in collapsed state |
| CMDPAL-001 | `src/components/layout/CommandPalette.tsx` | / (command palette) | P1 | Emoji icons instead of Lucide | Complete Lucide migration; every command has matching icon | Screenshot check: no emoji icons in palette |
| TITLE-001 | `src/components/layout/TopBar.tsx` + `src/components/layout/Sidebar.tsx` | /settings (and all) | P1 | App title duplicated; mobile truncates to "KTS Master C..." | Single app-title location; mobile title wraps or ellipsis gracefully | Playwright: title not truncated at 320px; not duplicated |
| EMPTY-001 | multiple pages | /dashboard, /ticketing, /meshcentral, /compliance, /device/* | P2 | Empty-state copy differs per route | Shared `EmptyState` component with consistent illustration + copy | Unit test: EmptyState renders consistent copy across pages |
| TABLE-001 | `src/components/ui/Table.tsx` | /ticketing, /compliance | P2 | Cells truncate with `nowrap`+`ellipsis`; no tooltip | Add `title` attr or tooltip for truncated cells | Unit test: long cell text shows full text on hover |
| GAUGE-001 | `src/components/ui/Gauge.tsx` | /device/* | P2 | Gauge font shrinks below 8px at high values; unreadable | Clamp min font size 10px; overflow to "9999+"; loading state text | Unit test: gauge value legible at high values |
| SEARCH-001 | `src/components/layout/TopBar.tsx` | all (mobile 320px) | P2 | Search fixed width overflows viewport edge | Responsive width; no overflow at 320px | Playwright: search input fully visible at 320px |
| MESH-002 | `src/components/ui/Toast.tsx` + `src/pages/MeshCentralPage.tsx` | /meshcentral | P2 | Toast errors stack unboundedly; no dismiss-by-click-outside | Dedupe identical toasts; click-outside dismiss; "Dismiss all" | Unit test: duplicate toasts collapsed; click-outside dismisses |
| MESH-003 | `src/pages/MeshCentralPage.tsx` | /meshcentral | P2 | Enrollment buttons present but server-config prerequisite unclear | Clarify prerequisite or disable buttons until server configured | Playwright: enrollment buttons disabled/hidden until server configured |
| TICKET-001 | `src/components/ticketing/TicketingPage.tsx` | /ticketing | P2 | Error banner + "Retry" but table empty; ambiguous | Distinguish "error loading" from "empty list"; label Retry | Playwright: error banner shows only on fetch fail; empty state only on success+0 items |
| TICKET-002 | `src/components/ticketing/TicketingPage.tsx` | /ticketing | P2 | Table header row renders with zero data rows | Hide table when empty; use EmptyState | Playwright: no empty table header; empty state shows |
| TICKET-003 | `src/components/ticketing/TicketingPage.tsx` | /ticketing | P2 | Status/Priority chips use inline color classes | Migrate to shared `StatusBadge`/`Badge` with tokens | Visual check: ticket badges match design tokens |
| SVC-001 | `src/components/docker/DockerPage.tsx` | /service/docker | P2 | "Server required" banner with no action path | Add "Configure server" button linking to connection setup | Playwright: CTA button navigates to server config |
| DEV-001 | `src/pages/DevicePage.tsx` | /device/local | P2 | Gauge cards wrap labels awkwardly on mobile | Responsive grid (1 col mobile, 2 tablet, 4 desktop) | Playwright: labels not wrapped at 320px |
| DEV-002 | `src/pages/DevicePage.tsx` | /device/local | P2 | SYSTEM rows show "—" with no indication data is missing | Per-field "no data" badge or panel-level "Device offline" state | Playwright: missing data clearly indicated |
| DEV-003 | `src/pages/DevicePage.tsx` | /device/local, /device/unraid | P2 | "Offline" badge small and low-contrast | Prominent offline indicator (color + icon) | Playwright: offline state clearly visible |
| CHAT-001 | `src/pages/ChatPage.tsx` | /chat | P2 | "Start Hermes" button: no visual feedback on click | Loading spinner / status transition when starting | Playwright: spinner appears on click; status changes |
| CHAT-002 | `src/pages/ChatPage.tsx` | /chat | P2 | Chat panel entirely blank when offline | Integrated offline placeholder in chat panel | Playwright: offline placeholder visible with Start button |
| COMP-001 | `src/pages/CompliancePage.tsx` | /compliance | P2 | Table headers render with zero rows; no empty illustration | Hide table when empty; EmptyState message | Playwright: no empty table; empty state shows |
| SKELETON-001 | multiple pages (`src/components/network/NetworkPage.tsx`, `src/components/system/SystemPage.tsx`) | multiple | P3 | Pages use plain "Loading…" text instead of Skeleton components | Migrate to Skeleton components | Visual check: skeleton renders instead of text |

## C. Rebuild (structural rework; not a simple in-place fix)

| Item | Current State | Rebuild Goal |
|---|---|---|
| Shell layout (`src/App.tsx`) | Fixed `w-[232px]`/`ml-[232px]` aside; mobile drawer exists but overlap possible at 320–375px | Rebuild shell as mobile-first drawer overlay; main content uses `ml-0` on mobile; aside collapses to rail or overlays |
| Shell theme tokens | `--kts-*` CSS custom properties in `src/styles/globals.css`; no `tailwind.config.js` — tokens hand-written | Keep tokens; consider migrating to Tailwind config if tooling justifies it (design decision) |
| Routing | `react-router-dom` with `<Routes>` + `<Outlet />` layout shell `AppLayout` | Keep router; no structural change needed |
| State management | `src/context/AppContext.tsx` + `src/hooks/` | Keep context + hooks; no structural change needed |
| Service pages (`/service/*`) | 8 service pages exist but only some deep-audited; some use plain "Loading…" text instead of skeletons | Deep-audit each; migrate loading states to Skeleton; ensure empty/error states |
| Nav state / sidebar | Sidebar + TopBar duplicated app title; mobile TopBar truncation | Single app-title location (Sidebar only); TopBar shows page title only |

---

## D. Prioritized Rebuild Plan

### Phase 1 — P0/P1 blocking defects (must fix before any feature work)

| # | Issue | File(s) | Est. Effort |
|---|-------|---------|-------------|
| 1 | MESH-001: toast crash on /meshcentral | `src/lib/tauri-commands.ts`, `src/components/ui/Toast.tsx` | 1–2 days |
| 2 | SIDEBAR-001: sidebar overlap on mobile | `src/App.tsx` | 1 day |
| 3 | LOGO-001/002: wrong/missing logo | `public/favicon.svg`, `src/components/layout/Sidebar.tsx` | 0.5 day |
| 4 | CMDPAL-001: emoji icons in command palette | `src/components/layout/CommandPalette.tsx` | 0.5 day |
| 5 | TITLE-001: duplicated/truncated app title | `src/components/layout/Sidebar.tsx`, `TopBar.tsx` | 0.5 day |
| 6 | WORKTREE-001: verify baseline refactor files | 13 files (App, Sidebar, TopBar, SettingsPage, CommandPalette, Avatar, Badge, Button, Table, globals.css, etc.) | 2 days (review + test) |

### Phase 2 — S4 Ticketing features (missing from current UI)

| # | Feature | File(s) | Est. Effort |
|---|---------|---------|-------------|
| 7 | Filters: Open/Mine/Waiting/Closed | `src/components/ticketing/TicketingPage.tsx` | 1 day |
| 8 | Search by id + title | `src/components/ticketing/TicketingPage.tsx` | 0.5 day |
| 9 | Sort by priority/due/updated | `src/components/ticketing/TicketingPage.tsx` | 0.5 day |
| 10 | Quick-add (Enter submits) | `src/components/ticketing/TicketingPage.tsx` | 0.5 day |

### Phase 3 — S6 layout issues (as part of rebuilt UI shell)

| # | Issue | File(s) | Est. Effort |
|---|-------|---------|-------------|
| 11 | Sidebar mobile drawer overlay | `src/App.tsx` | Included in #2 |
| 12 | TopBar search overflow on 320px | `src/components/layout/TopBar.tsx` | 0.5 day |
| 13 | Shell theme token consistency | `src/styles/globals.css` | 1 day (design decision) |

### Phase 4 — Remaining P2 fixes (in priority order)

| # | Issue | File(s) | Est. Effort |
|---|-------|---------|-------------|
| 14 | EMPTY-001: shared empty-state component | New `src/components/ui/EmptyState.tsx` + all pages | 2 days |
| 15 | TABLE-001: tooltip on truncated cells | `src/components/ui/Table.tsx` | 0.5 day |
| 16 | GAUGE-001: font clamp at high values | `src/components/ui/Gauge.tsx` | 0.5 day |
| 17 | DEV-001/002/003: device page mobile/layout/offline | `src/pages/DevicePage.tsx` | 1 day |
| 18 | SVC-001: Docker "Configure server" CTA | `src/components/docker/DockerPage.tsx` | 0.5 day |
| 19 | CHAT-001/002: chat offline/start states | `src/pages/ChatPage.tsx` | 1 day |
| 20 | COMP-001: compliance empty state | `src/pages/CompliancePage.tsx` | 0.5 day |
| 21 | SKELETON-001: migrate loading states to skeletons | `src/components/network/NetworkPage.tsx`, `src/components/system/SystemPage.tsx` | 0.5 day |

### Phase 5 — P3 / coverage (follow-ups, design decisions)

| # | Issue | Disposition |
|---|-------|-------------|
| GLOBAL-001 | Empty-state illustration style — deferred to UI_AUDIT_FOLLOWUPS.md (design decision) |
| GLOBAL-002 | Accessibility tooling (axe-core) — add to CI as follow-up |
| GLOBAL-003 | i18n — deferred (product decision) |
| SVC-003, ALERT-001, FLEET-001 | Deep-audit service/alerts/fleet pages — schedule as separate audit pass |
| CHAT-002 | Covered by CHAT-002 fix above |

---

## E. CI Validation (regression protection)

Add a GitHub Actions workflow at `.github/workflows/ci.yml` that runs on every PR and blocks merge on failure:

```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint          # oxlint
      - run: npx tsc --noEmit      # typecheck
      - run: npm run test:coverage # vitest with thresholds
      - run: npm run build         # tsc -b && vite build
      - run: npm run e2e           # Playwright (critical routes only in CI)
```

**Regression rule**: any PR that reintroduces a fixed P0/P1/P2 issue (verified by Playwright snapshot comparison against `ui-audit-shots/` or by unit test) must fail CI.
