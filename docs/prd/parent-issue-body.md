# KTS Master Control — Controlled Rebuild

## Background & Motivation

KTS Master Control is a React/Vite + FastAPI/Tauri fleet management web app. An exhaustive UI/UX audit (UI_AUDIT_REPORT.md) identified 41 issues across 30 routes: 1 P0 (MeshCentral crash toast), 6 P1 (sidebar overlap, logo, badge icons, duplicate title, etc.), 25 P2 (empty states, table truncation, gauge font, etc.), and 9 P3 (accessibility, i18n, coverage gaps).

The current codebase is the reference implementation — it works, but it has accumulated untested UI debt, inconsistent shell layout, uncovered frontend code, and no regression protection. The goal of this rebuild is not to throw it away, but to rebuild incrementally with test coverage and regression protection so the same bugs cannot silently return.

## Goals

1. Fix all P0/P1 defects that block or crash core flows (MESH-001, SIDEBAR-001, LOGO-001/002, CMDPAL-001, TITLE-001).
2. Restore S4 Ticketing features (filters Open/Mine/Waiting/Closed, search by id+title, sort by priority/due/updated, quick-add Enter submit).
3. Fix S6 layout issues as part of the rebuilt UI shell (sidebar mobile drawer overlay, TopBar search overflow).
4. Fix remaining P2 defects (empty states, table tooltips, gauge font clamp, device pages, settings states).
5. Add regression protection: every bug fix must have a test that fails before and passes after; CI must block merge on failure.
6. Deep-audit currently uncovered service/alerts/fleet/chat pages against the full state matrix.

## Acceptance Criteria

- [ ] `tsc --noEmit` exit 0 on every change.
- [ ] `vitest run` exit 0 on every change; coverage thresholds (50% lines/functions/branches/statements) maintained or improved.
- [ ] `npm run lint` (oxlint) exit 0.
- [ ] `npm run build` exit 0.
- [ ] Every P0/P1 defect fixed with a regression test that fails before and passes after.
- [ ] Every P2 fix has a regression test where feasible.
- [ ] CI workflow blocks merge on any check failure.
- [ ] Staging rebuild at `https://kars-tech-solutions.<tailnet>.ts.net/` passes smoke test on all routes.

## Open Questions (Decision Map)

| ID | Question | Status |
|----|----------|--------|
| D-1 | Should the rebuild keep existing Tailwind CSS variables (`--kts-*`) or migrate to Tailwind config (`tailwind.config.js`)? | open |
| D-2 | Should the sidebar be a full-width drawer overlay on mobile, or collapse to a 56px rail? | open |
| D-3 | Should the "Mine" ticket filter show only assigned tickets, or open tickets (no assignee field exists)? | open |

## Prioritized Rebuild Plan

### Phase 1 — P0/P1 blocking defects (must fix before any feature work)

| # | Issue | File(s) | Est. Effort |
|---|-------|---------|-------------|
| 1 | MESH-001: toast crash on /meshcentral | `src/lib/tauri-commands.ts`, `src/components/ui/Toast.tsx` | 1–2 days |
| 2 | SIDEBAR-001: sidebar overlap on mobile | `src/App.tsx` | 1 day |
| 3 | LOGO-001/002: wrong/missing logo | `public/favicon.svg`, `src/components/layout/Sidebar.tsx` | 0.5 day |
| 4 | CMDPAL-001: emoji icons in command palette | `src/components/layout/CommandPalette.tsx` | 0.5 day |
| 5 | TITLE-001: duplicated/truncated app title | `src/components/layout/Sidebar.tsx`, `TopBar.tsx` | 0.5 day |
| 6 | WORKTREE-001: verify baseline refactor files | 13 files (App, Sidebar, TopBar, SettingsPage, CommandPalette, Avatar, Badge, Button, Table, globals.css, etc.) | 2 days |

### Phase 2 — S4 Ticketing features

| # | Feature | File(s) | Est. Effort |
|---|-------|---------|-------------|
| 7 | Filters: Open/Mine/Waiting/Closed | `src/components/ticketing/TicketingPage.tsx` | 1 day |
| 8 | Search by id + title | `src/components/ticketing/TicketingPage.tsx` | 0.5 day |
| 9 | Sort by priority/due/updated | `src/components/ticketing/TicketingPage.tsx` | 0.5 day |
| 10 | Quick-add (Enter submits) | `src/components/ticketing/TicketingPage.tsx` | 0.5 day |

### Phase 3 — S6 layout issues (as part of rebuilt UI shell)

| # | Issue | File(s) | Est. Effort |
|---|-------|---------|-------------|
| 11 | Sidebar mobile drawer overlay | `src/App.tsx` | Included in #2 |
| 12 | TopBar search overflow on 320px | `src/components/layout/TopBar.tsx` | 0.5 day |
| 13 | Shell theme token consistency | `src/styles/globals.css` | 1 day |

### Phase 4 — Remaining P2 fixes

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

## References

- `UI_AUDIT_REPORT.md` — Full audit with 41 issues
- `UI_AUDIT_FOLLOWUPS.md` — Subjective/design items deferred
- `docs/dev/rebuild-inventory.md` — Full keep/fix/rebuild inventory
- `CONTEXT.md` — Domain terminology
