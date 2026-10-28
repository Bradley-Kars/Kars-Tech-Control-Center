# KTS Backend — W5 Status (identity hardening, tests pass on clean clone)

## Current milestone: W5 — identity hardening (branch `work/web`)
## Next milestone: P6 — restore skipped tests (lower priority)

## Milestone status

| Milestone | Status | Details |
|-----------|--------|---------|
| P5 — tests pass on clean clone | Complete | `work/backend-import` @ `546d5fbdabc4df902f7daf6504ebb3af67b83e06`. 35 passed / 246 skipped / 0 failed on `work/web`. |
| W5 — identity hardening | Complete | `work/web` @ `e4930d0bd8a8d766397cdb4bd1146c6dd18fc4bb` (pushed). Backend: 35 passed / 246 skipped / 0 failed. Frontend: 107 vitest passed, `tsc --noEmit` clean, build succeeds. |

## Branch state

- Branch: `work/web` (local `e4930d0bd8a8d766397cdb4bd1146c6dd18fc4bb`, pushed to origin)
- Remote `work/web`: `e4930d0bd8a8d766397cdb4bd1146c6dd18fc4bb`
- Remote `work/backend-import`: `546d5fbdabc4df902f7daf6504ebb3af67b83e06` (P5 green)
- `main`: `d7d118a1f755077503d09742e36e9b03a3c623c3` (never pushed to, never force-pushed)

## What changed this session (W5 — identity hardening)

- `backend/core/bridge.py`:
  - All API routes under `/api` (W1); built frontend (`dist/`) served at `/` same-origin; app binds `127.0.0.1` only (W1).
  - Auth middleware (`require_token`) authenticates via `X-API-Token` OR the `Tailscale-User-Login` header, trusted **only** from `127.0.0.1` (W3/W5).
  - Added `TrustedHostMiddleware` with `allowed_hosts` = `localhost`, `127.0.0.1`, plus comma-separated `KTS_ALLOWED_HOSTS` (W5.3). Forged host → `400`.
  - Login-identified requests on unsafe methods (`POST`/`PUT`/`PATCH`/`DELETE`): `403` if `Sec-Fetch-Site` is `cross-site`, or if an `Origin` header's host differs from the `Host` header (W5.3). Token requests unaffected.
  - `users.yaml` login values and the header value are lowercased + stripped before comparison (W5.4).
  - Login-identified requests get actor type `"human"` (name = login); token requests use type `"automation"` (default). `core/permissions.py` resolves roles for both (W5.5).
  - `actor_id` added to the success audit line (W5.6).
  - Fixed route functions to declare `request: Request` (they use `request.state.*`).
- `backend/tests/test_middleware_b3.py`: extended with W5.3–W5.5 tests (forged host `400`; cross-site POST with login `403`; same-origin POST with login `200`; token requests unaffected; mixed-case login; actor type `human`; actor_id in audit).
- `backend/tests/test_proxy_headers.py` (new): integration test starting real `uvicorn --no-proxy-headers` on a random port with sandbox env + fixture `users.yaml`; asserts valid login + `X-Forwarded-For` → `200`, unknown login → `401`, no credentials → `401` (W5.1).
- `backend/core/auth.py`: `TokenTable.audit_request` accepts and records `actor_id` (W5.6).
- `backend/docs/DEPLOY.md`: `uvicorn --no-proxy-headers` (W5.1); `tailscale serve --bg 8799` tailnet-only, no Funnel, confirm via `tailscale serve --help` / `tailscale serve status` (W5.2); systemd unit uses `--no-proxy-headers`; new "Trust model" paragraph (loopback header trust means any local process can impersonate a login; acceptable only on a single-user host) (W5.7).
- `backend/docs/evidence/w5.md` (new): W5 evidence.
- `backend/docs/STATUS.md`: rewritten (this file).

## Verification evidence (this session)

- `python3 -m pytest` from `backend/`: **35 passed, 246 skipped, 0 failed** (includes new `test_middleware_b3` + `test_proxy_headers`).
- `python3 -m py_compile` on `core/bridge.py`, `core/auth.py`, and every backend test file: OK.
- `npx tsc --noEmit` (frontend): clean.
- `npx vitest run` (frontend): 107 passed.
- `npm run build` (frontend): succeeds.
- `git ls-remote origin`: see below.

```
git ls-remote origin
d7d118a1f755077503d09742e36e9b03a3c623c3	HEAD
d7d118a1f755077503d09742e36e9b03a3c623c3	refs/heads/main
546d5fbdabc4df902f7daf6504ebb3af67b83e06	refs/heads/work/backend-import
e4930d0bd8a8d766397cdb4bd1146c6dd18fc4bb	refs/heads/work/web
4ea9a076b88a5d1e744acaf51b0ab5da06e68755	refs/tags/v0.0.1
```

## Notes

- Skips are `real_install` tests (need this machine's `~/.ticketing` code, sandbox data, or `~/.local/bin/ticket`); skipped by default, run with `--run-real-install`; each listed in `backend/docs/evidence/p5.md`.
- The live system (`~/.ticketing`, real vault, systemd bridge on `127.0.0.1:8799`, `~/.config/kts/bridge-token`, `~/bin/kts-ticket`) was NOT read, edited, restarted, or promoted. The live bridge runs older code on purpose; promotion happens only when Claude says so.
- `core/paths.py` and `core/events.py` were NOT edited (deliberate safety guard).
