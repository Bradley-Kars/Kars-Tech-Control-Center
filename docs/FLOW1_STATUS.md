# Flow #1 Status Report

**Parent Issue:** #1 (database ID 6170513194) — "KTS Master Control — Controlled Rebuild"
**Branch:** work/flow1-run
**Status:** In progress — Track 0 complete, Tracks 1-4 remaining

## Phase 1 — P0/P1 blocking defects

| # | Issue | File(s) | Status | Evidence |
|---|-------|---------|--------|----------|
| 1 | MESH-001: toast crash on /meshcentral | `src/lib/fleet-api.ts`, `src/components/ui/Toast.tsx` | TODO | Not started |
| 2 | SIDEBAR-001: sidebar overlap on mobile | `src/App.tsx` | TODO | Not started |
| 3 | LOGO-001/002: wrong/missing logo | `public/favicon.svg`, `src/components/layout/Sidebar.tsx`, `TopBar.tsx` | TODO | Not started |
| 4 | CMDPAL-001: emoji icons in command palette | `src/components/layout/CommandPalette.tsx` | TODO | Not started |
| 5 | TITLE-001: duplicated/truncated app title | `src/components/layout/Sidebar.tsx`, `TopBar.tsx` | TODO | Not started |
| 6 | WORKTREE-001: verify baseline refactor files | 13 files (App, Sidebar, TopBar, SettingsPage, CommandPalette, Avatar, Badge, Button, Table, globals.css, etc.) | PARTIAL | Baseline verified via `npx tsc -b`, `npm run vitest run` (129 tests), `npm run build` all pass on work/flow1-run |

## Phase 2 — S4 Ticketing features

| # | Feature | File(s) | Status | Evidence |
|---|-------|---------|--------|----------|
| 7 | Filters: Open/Mine/Waiting/Closed | `src/components/ticketing/TicketingPage.tsx` | DONE | `src/components/ticketing/TicketingPage.test.tsx` has filter tests (waiting, mine) |
| 8 | Search by id + title | `src/components/ticketing/TicketingPage.tsx` | DONE | Test "search filters results by title" passes |
| 9 | Sort by priority/due/updated | `src/components/ticketing/TicketingPage.tsx` | DONE | Test "sorts by priority with high first (default)" and "can switch sort to due without crashing" pass |
| 10 | Quick-add (Enter submits) | `src/components/ticketing/TicketingPage.tsx` | TODO | Not implemented |

## Phase 3 — S6 layout issues

| # | Issue | File(s) | Status | Evidence |
|---|-------|---------|--------|----------|
| 11 | Sidebar mobile drawer overlay | `src/App.tsx` | TODO | Not started |
| 12 | TopBar search overflow on 320px | `src/components/layout/TopBar.tsx` | TODO | Not started |
| 13 | Shell theme token consistency | `src/styles/globals.css` | TODO | Not started |

## Phase 4 — Remaining P2 fixes

| # | Issue | File(s) | Status | Evidence |
|---|-------|---------|--------|----------|
| 14 | EMPTY-001: shared empty-state component | New `src/components/ui/EmptyState.tsx` + all pages | SKIPPED | Decision: do NOT build shared EmptyState; implement empty states locally per audit |
| 15 | TABLE-001: tooltip on truncated cells | `src/components/ui/Table.tsx` | TODO | Not started |
| 16 | GAUGE-001: font clamp at high values | `src/components/ui/Gauge.tsx` | TODO | Not started |
| 17 | DEV-001/002/003: device page mobile/layout/offline | `src/pages/DevicePage.tsx` | PARTIAL | Offline detection added (`offline = !loading && system == null`), gauge variants use 'default' when offline |
| 18 | SVC-001: Docker "Configure server" CTA | `src/components/docker/DockerPage.tsx` | TODO | Not started |
| 19 | CHAT-001/002: chat offline/start states | `src/pages/ChatPage.tsx` | TODO | Not started |
| 20 | COMP-001: compliance empty state | `src/pages/CompliancePage.tsx` | TODO | Scheduled as Track 2.2 — goes first in phase 2 |
| 21 | SKELETON-001: migrate loading states to skeletons | `src/components/network/NetworkPage.tsx`, `src/components/system/SystemPage.tsx` | TODO | Not started |

## Acceptance Criteria Status

| Criterion | Status |
|-----------|--------|
| `tsc --noEmit` exit 0 on every change | N/A — using `npx tsc -b` per AGENTS.md gate (verified passing) |
| `vitest run` exit 0; coverage thresholds maintained | PASSING — 129 tests, 16 files, all pass |
| `npm run lint` (oxlint) exit 0 | PARTIAL — pre-existing `useId` conditional hook warnings (not introduced by this run) |
| `npm run build` exit 0 | PASSING — vite build succeeds |
| Every P0/P1 defect fixed with regression test | TODO — no P0/P1 defects fixed yet |
| Every P2 fix has regression test where feasible | TODO — no P2 fixes implemented yet |
| CI workflow blocks merge on any check failure | PARTIAL — `.github/workflows/ci.yml` added with lint, tsc -b, test:coverage, build, e2e |
| Staging rebuild passes smoke test | TODO — not deployed to staging |

## Decisions Applied

| ID | Decision | Status |
|----|----------|--------|
| D-1 | Keep existing `--kts-*` CSS variables | APPLIED |
| D-2 | Mobile sidebar is full-width drawer overlay | APPLIED (design decision, not yet implemented) |
| D-3 | "Mine" filter = assignee equals current identity; if API has no assignee field, leave Mine out | APPLIED — existing "mine" filter test uses open tickets |
| EMPTY-001 | Do NOT build shared EmptyState; implement empty states locally per audit | APPLIED |

## Next Steps

1. Track 2.2: Implement COMP-001 (CompliancePage.tsx empty state + ShellServerRow/PhoneServerRow components)
2. Track 3: Backend test categorization and un-skipping
3. Track 4: State-matrix tests and Unraid backend port
