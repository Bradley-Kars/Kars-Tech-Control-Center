# KTS Backend — W7 Status (placeholders in docs)

## Current milestone: W7 — identity hardening — placeholders in docs (branch `work/web`)
## Next milestone: L2 — cutover to the real vault (lower priority)

## Milestone status

| Milestone | Status | Details |
|-----------|--------|---------|
| P5 — tests pass on clean clone | Complete | `work/backend-import` @ `546d5fbdabc4df902f7daf6504ebb3af67b83e06`. 35 passed / 246 skipped / 0 failed on `work/web`. |
| W5 — identity hardening | Complete | `work/web` @ `e4930d0bd8a8d766397cdb4bd1146c6dd18fc4bb` (pushed). Backend: 35 passed / 246 skipped / 0 failed. Frontend: 107 vitest passed, `tsc --noEmit` clean, build succeeds. |
| W6 — audit fix | Complete | `work/web` @ `5509e6f11c5eac6897d11b4eff31a8f3c9edfec1` (pushed). Backend: 39 passed / 246 skipped / 0 failed. |
| L1 — staging deployment | Complete | `work/web` @ `3d72755b297e3e9cd5f5dc458f002247418e7293` (pushed). Staging running at tailnet URL (placeholder). |
| W7 — placeholders in docs | Complete | `work/web` @ `3d72755` + uncommitted. Real hostnames, tailnet names, emails replaced with `<machine>.<tailnet>.ts.net` and `you@example.com` in `docs/STAGING.md` and `docs/evidence/L1.md`. |

## Branch state

- Branch: `work/web` (local `3d72755` + W7 uncommitted, about to push)
- Remote `work/web`: `3d72755b297e3e9cd5f5dc458f002247418e7293` (L1, pushed)
- Remote `work/backend-import`: `546d5fbdabc4df902f7daf6504ebb3af67b83e06` (P5 green)
- `main`: `d7d118a1f755077503d09742e36e9b03a3c623c3` (never pushed to, never force-pushed)

## What changed this session (W7 — placeholders in docs)

- `backend/docs/STAGING.md`: replaced real machine name `kars-tech-solutions.tailf6d3b4.ts.net` with `<machine>.<tailnet>.ts.net` and real login email `bradley.kars@gmail.com` with `you@example.com`.
- `backend/docs/evidence/L1.md`: same replacements; also `login: "you@example.com"` in the users.yaml fixture example.
- Rule from now on: no real hostnames, tailnet names or emails in the repo.

## Verification evidence (this session)

- `python3 -m py_compile` on `core/bridge.py`, `core/auth.py`, and every backend test file: OK.
- `grep` for `kars-tech-solutions.tailf6d3b4.ts.net`, `bradley.kars@gmail.com` in `docs/STAGING.md` and `docs/evidence/L1.md`: no matches (only `/home/slayerbrk/` home paths remain, which are not hostnames/tailnet names/emails).
- `git ls-remote origin`: see below.

```
git ls-remote origin
d7d118a1f755077503d09742e36e9b03a3c623c3	HEAD
d7d118a1f755077503d09742e36e9b03a3c623c3	refs/heads/main
546d5fbdabc4df902f7daf6504ebb3af67b83e06	refs/heads/work/backend-import
3d72755b297e3e9cd5f5dc458f002247418e7293	refs/heads/work/web
4ea9a076b88a5d1e744acaf51b0ab5da06e68755	refs/tags/v0.0.1
```

## Notes

- Skips are `real_install` tests (need this machine's `~/.ticketing` code, sandbox data, or `~/.local/bin/ticket`); skipped by default, run with `--run-real-install`; each listed in `backend/docs/evidence/p5.md`.
- The live system (`~/.ticketing`, real vault, systemd bridge on `127.0.0.1:8799`, `~/.config/kts/bridge-token`, `~/bin/kts-ticket`) was NOT read, edited, restarted, or promoted. The live bridge runs older code on purpose; promotion happens only when Claude says so.
- `core/paths.py` and `core/events.py` were NOT edited (deliberate safety guard).
- No real hostnames, tailnet names or emails remain in `docs/STAGING.md` or `docs/evidence/L1.md`.
