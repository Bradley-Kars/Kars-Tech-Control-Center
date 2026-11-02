# AGENTS.md — Kars-Tech-Control-Center (KTS Master Control)

## Project Profile

- test command: `npm run test` (vitest run)
- regression command: `npm run test:coverage` (vitest run --coverage with thresholds)
- test file patterns: `src/**/*.{test,spec}.{ts,tsx}`
- implementation file patterns: `src/**/*.{ts,tsx}` (excludes `src-tauri/`, `e2e/`, `dist/`, `ui-audit-shots/`)
- version bump rule: breaking→major, feature→minor, fix→patch
- version file: `package.json` (`version` field)
- tag format: `v{version}`
- release workflow: `.github/workflows/release.yml` (manual, tag push)
- lint: `npm run lint` (oxlint)
- typecheck: `npx tsc -b`
- build: `npm run build` (tsc -b && vite build)
- e2e: `npm run e2e` (playwright test)
- audit review: `UI_AUDIT_REPORT.md` is the source of truth for known UI defects

## Quality Gates (mandatory, every change)

1. **npx tsc -b** exit 0 — no type errors introduced.
2. **vitest run exit 0** — all unit tests pass.
3. **npm run lint exit 0** — oxlint clean.
4. **npm run build exit 0** — production build succeeds.
5. **No new P0/P1/P2 audit findings** — every change is checked against `UI_AUDIT_REPORT.md` (Section 4/5) and `UI_AUDIT_FOLLOWUPS.md`; a change that reintroduces a fixed issue or leaves an open P0/P1/P2 unresolved is a blocker.
6. **Bug fix requires regression test** — no bug is closed without:
   - Root cause identified and documented in the commit/PR.
   - A regression test (unit, integration, or e2e) that fails before the fix and passes after.
   - The test added to the appropriate suite (`src/**/*.test.{ts,tsx}` for unit, `e2e/` for Playwright).
7. **No silent regressions** — CI runs lint, tsc -b, test:coverage, build, e2e.

## Source of Truth

- `UI_AUDIT_REPORT.md` — exhaustive UI/UX audit (41 issues: 1 P0, 6 P1, 25 P2, 9 P3 + follow-ups). This is the defect backlog.
- `UI_AUDIT_FOLLOWUPS.md` — subjective/design items requiring human review (not auto-fixed).
- `src/` — current source (reference implementation; being rebuilt incrementally).
- `src-tauri/` — Rust Tauri backend (out of scope for this web-frontend rebuild flow unless explicitly scoped).

## Rebuild Strategy (controlled, not big-bang)

The current repo is the **reference implementation**. We are not throwing it away; we are rebuilding it incrementally with test coverage and regression protection:

1. **Keep** — components/pages that are correct, tested, and need no change.
2. **Fix** — components/pages with audit defects (P0/P1/P2) that are corrected in place with regression tests.
3. **Rebuild** — components/pages that need structural rework (layout, state management, shared component library consolidation).

Rebuild order (priority):
1. P0/P1 defects that crash or break core flows (MESH-001 toast crash, SIDEBAR-001 layout, etc.).
2. S4 features missing from Ticketing (filters Open/Mine/Waiting/Closed, search by id+title, sort by priority/due/updated, quick-add Enter submit).
3. S6 layout issues as part of the rebuilt UI shell (sidebar overlap, TopBar truncation, etc.).
4. Remaining P2/P3 issues in priority order.
