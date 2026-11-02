# PRD: KTS Master Control — Controlled Rebuild

## Background & Motivation

KTS Master Control is a React/Vite + FastAPI/Tauri fleet management web app. An exhaustive UI/UX audit (UI_AUDIT_REPORT.md) identified 41 issues across 30 routes: 1 P0 (MeshCentral crash toast), 6 P1 (sidebar overlap, logo, badge icons, duplicate title, etc.), 25 P2 (empty states, table truncation, gauge font, etc.), and 9 P3 (accessibility, i18n, coverage gaps).

The current codebase is the reference implementation — it works, but it has accumulated untested UI debt, inconsistent shell layout, uncovered frontend code, and no regression protection. The goal of this rebuild is not to throw it away, but to rebuild incrementally with test coverage and regression gates so the same bugs cannot silently return.

## Goals

1. Fix all P0/P1 defects that block or crash core flows (MESH-001, SIDEBAR-001, LOGO-001/002, CMDPAL-001, TITLE-001).
2. Restore S4 Ticketing features (filters Open/Mine/Waiting/Closed, search by id+title, sort by priority/due/updated, quick-add Enter submit).
3. Fix S6 layout issues as part of the rebuilt UI shell (sidebar mobile drawer overlay, TopBar search overflow).
4. Fix remaining P2 defects (empty states, table tooltips, gauge font clamp, device pages, settings states).
5. Add regression protection: every bug fix must have a test that fails before and passes after; CI must block merge on failure.
6. Deep-audit currently uncovered service/alerts/fleet/chat pages against the full state matrix.

## Scope (In)

- Frontend only: React/Vite + Tailwind (`--kts-*` tokens) + React Router.
- All pages in `src/pages/` and shared UI components in `src/components/ui/`.
- Backend bridge layer in `src/lib/tauri-commands.ts` (invoke guard, error translation).
- Cypress/Playwright e2e coverage for critical routes (ticketing, dashboard, device, meshcentral, settings).
- Vitest unit/coverage with thresholds (50% lines/functions/branches/statements).
- CI workflow blocking merge on lint/typecheck/test/build/e2e failure.

## Scope (Out)

- Tauri Rust backend (`src-tauri/`) — out of scope unless a frontend change requires a contract change.
- i18n / RTL / localization — deferred (product decision, see UI_AUDIT_FOLLOWUPS.md).
- Empty-state illustration style — deferred (design decision, see UI_AUDIT_FOLLOWUPS.md).
- Accessibility automation (axe-core) — deferred (follow-up).

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

| ID | Question | Status | Answer |
|----|----------|--------|--------|
| D-1 | Should the rebuild keep the existing Tailwind CSS variables (`--kts-*`) or migrate to Tailwind config? | open | TBD — design decision |
| D-2 | Should the sidebar be a full-width drawer overlay on mobile, or collapse to a 56px rail? | open | TBD — user preference |
| D-3 | Should the "Mine" ticket filter show only assigned tickets, or open tickets (no assignee field exists)? | open | TBD — data model lacks assignee field |
