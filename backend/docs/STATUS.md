# KTS Backend — P5 Status (tests pass on clean clone)

## Current milestone: P5 — tests pass on a clean clone (branch `work/backend-import`)
## Next milestone: W — web app over Tailscale (branch `work/web`, after P5 acceptance)

## Milestone status

| Milestone | Status | Details |
|-----------|--------|---------|
| P5 — tests pass on clean clone | In progress | `work/backend-import`. 21 passed / 246 skipped / 0 failed. Skips are `real_install` tests (need this machine's `~/.ticketing` code, sandbox data, or `~/.local/bin/ticket`); skipped by default, run with `--run-real-install`. |

## Branch state

- Branch: `work/backend-import` (local `ce943eb`)
- Remote `work/backend-import`: `507ccd5` (local commit `ce943eb` not yet pushed)
- `main`: `d7d118a` (never pushed to, never force-pushed)

## What changed this session (P5)

- Restored `backend/core/paths.py` and `backend/core/events.py` to their import-time-lock
  state (reverted the forbidden call-time env reads from `507ccd5`). `core.paths` resolves
  vault/home at import time; `core.events` reads `events_dir()` from `core.paths`.
  `core/sandbox.py` docstring placeholder (`{HOME}`) form kept (P5 step 8).
- `backend/tests/conftest.py`: session sandbox (`KTS_SANDBOX=1`, temp `KTS_VAULT`/`KTS_HOME`),
  fixture `users.yaml`/`permissions.yaml` copied into sandbox home config, autouse vault
  cleanup, `pytest_sessionfinish` removes the temp session dir (P5 step 2).
- `backend/tests/test_a6_security_regression.py`: `_make_service(tmp_path=None)` keeps only
  `TicketService` construction + `permission_checker=None` wiring; removed env-var setting,
  `importlib.reload`, fixture copying, and `svc.entity_dir` override (P5 step 3).
- `backend/tests/fixtures/permissions.yaml`: rewritten in the `permissions:` top-level format
  that `core/permissions.py` expects (was role-keyed, loaded zero rules) (P5 step 4/5).
- All other tests that reference this machine's real install
  (`~/.ticketing`, `~/.ticketing-sandbox`, `~/Documents/KTS Records-sandbox`,
  `~/.local/bin/ticket`, or a `CODE` path arg) are marked
  `@pytest.mark.real_install` and skipped by default (P5 step 5).
- `backend/tests/test_middleware_b3.py`: B3 fail-closed middleware test — token without
  `actor_id` gets `401` `{"detail": "token has no actor_id"}` and an `auth_fail` audit line;
  token with `actor_id=USR-000002` passes (P5 step 7).
- `backend/docs/guide.md`: how to re-mint the bridge token with `actor_id=USR-000002` and
  update `~/.config/kts/bridge-token` (secret never printed) (P5 step 9).
- `backend/pyproject.toml`: registered the `real_install` pytest marker (P5 step 5).
- `backend/tests/conftest.py`: `pytest_collection_modifyitems` skips `real_install` tests by
  default (`--run-real-install` to enable) (P5 step 5).
- `.github/workflows/backend-tests.yml`: runs on push to `work/**` and PRs, Python 3.12,
  `pip install -e "backend[dev]"`, `pytest` from `backend/` (P5 step 11).

## Verification evidence (this session)

- `python3 -m pytest` from `backend/`: **21 passed, 246 skipped, 0 failed**
- `python3 -m py_compile` on every backend test file: OK
- `git ls-remote origin`: see below

```
git ls-remote origin
d7d118a1f755077503d09742e36e9b03a3c623c3	HEAD
d7d118a1f755077503d09742e36e9b03a3c623c3	refs/heads/main
507ccd5a5b228418e2dbbd20cb891e6d4f4cfcb1	refs/heads/work/backend-import
4ea9a076b88a5d1e744acaf51b0ab5da06e68755	refs/tags/v0.0.1
```

## Notes

- Tests that truly need this machine's real install are skipped by default; each skip is
  justified by `real_install` and listed in `backend/docs/evidence/p5.md`.
- The live system (`~/.ticketing`, real vault, systemd bridge on `127.0.0.1:8799`,
  `~/.config/kts/bridge-token`, `~/bin/kts-ticket`) was NOT read, edited, restarted, or
  promoted. The live bridge runs older code on purpose; promotion happens only on review.
