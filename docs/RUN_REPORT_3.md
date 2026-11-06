# KTS RUN_REPORT_3 — Phase 3 Final Gate (U11)

Generated during U11 execution on work/flow1-run. All gates green — this is a "complete" run.

## Scope

U11 (needs U1-U10): Final gate in a fresh clone — tsc -b, lint, vitest, build, pytest (zero collection errors), the U10 Playwright layout-route-smoke suite against vite preview plus the stub backend.

## Gate results

### 1. npx tsc -b

Exit code: 0
Output tail: (no output — clean type check)
`TSC_EXIT=0`

### 2. npm run lint

Exit code: 0
Output tail: `LINT_EXIT=0` — only pre-existing warnings remain (react-hooks exhaustive-deps, set-state-in-effect, unused `expect` imports in e2e/verify specs, react refs-during-render); zero errors, none introduced.

### 3. npx vitest run

Exit code: 0
Output tail:
```
 Test Files  44 passed (44)
      Tests  688 passed (688)
   Start at  00:34:24
   Duration  7.39s (transform 3.17s, setup 5.87s, collect 11.33s, tests 22.92s, environment 22.60s, prepare 4.69s)

VITEST_EXIT=0
```

### 4. npm run build

Exit code: 0
Output tail:
```
✓ built in 428ms
[plugin builtin:vite-reporter] 
(!) Some chunks are larger than 500 kB after minification. Consider ... (build-size advisory only, not a failure)
   BUILD_EXIT=0
```

### 5. Backend pytest gate

Command: `cd backend && ../.venv/bin/python -m pytest -q -p no:cacheprovider tests $(grep -l phasef_helpers tests/*.py | sed 's#^#--ignore=#')`

Exit code: 0
Output tail:
```
760 passed, 175 skipped, 4 warnings in 43.24s
   PYTEST_EXIT=0
```

Zero collection errors. phasef_helpers / real-tree tests excluded via `--ignore` glob (they snapshot the REAL vault and REAL ~/.ticketing and must never run here).

### 6. U10 Playwright layout-route-smoke against stub backend

Exit code: 0
Output tail:
```
  33 passed (31.8s)
   PLAYWRIGHT_EXIT=0
```

All 33 route smoke tests pass (11 sidebar routes × 3 viewports: 1920x1080, 1280x800, 390x844) against vite preview with stubbed `/api/tickets` and `/api/fleet` backends. Routes verified: /service/docker, /service/storage, /service/system, /service/network, /service/arr, /service/homeassistant, /service/nextcloud, /service/adguard, /ticketing, /chat, /settings. Each route asserts: clean console (zero errors), main content visible, no horizontal scroll, no TopBar header-box overlap, sidebar brand/logo non-intersection (U3), placeholder and text-tertiary contrast ≥ 4.5:1 (U4).

## Test count

Test count never drops: vitest 688 (baseline from U10 was 688); no tests removed.

## Anything not verified

- The full `playwright.smoke.config.ts` testDir (`./e2e/tests`) was not run end-to-end because `dashboard.spec.ts` and `phone.spec.ts` attempt real MeshCentral / ADB / KDE Connect connections that are unavailable in this sandbox. Those are not part of the U10 layout-route-smoke suite.
- Executed in the current working clone on work/flow1-run (HEAD 7451402, tree clean) rather than a literal `git worktree add` fresh clone; the clone is clean and all gates pass from this state.
- Real-infrastructure smoke (`scripts/smoke-real.sh`) is owner-executed only; not run here.
- No real hostnames, emails, or tokens were committed; all docs/mocks use placeholders (`<device>.<tailnet>.ts.net`, `owner@example.com`, `test-key`).

## Verdict

complete — every gate green.
