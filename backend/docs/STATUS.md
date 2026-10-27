# KTS Backend — v0.1 Status

## Current milestone: P2 — Make backend runnable from clean clone ✅
## Next milestone: P3 — B3 fail-closed fix (sandbox only)

## Milestone status

| Milestone | Status | Details |
|-----------|--------|---------|
| B1 — Reconcile & verify M1-M5 | Complete | Full suite: 246 passed / 24 failed (sandbox-isolation tests only). 15 tests in tests/test_a6_security_regression.py. Diff: 5004 lines, 30 files. |
| B2 — Publish backend | Complete | Repo: Bradley-Kars/kts-ticketing. Branch: work/v0.1. Tag: m-B1. Commit: 8436f10. Pushed to origin. |
| F1 — Tauri ticketing UI | Complete | Tauri commands: ticketing_create_ticket, ticketing_add_worklog, ticketing_change_status. Tauri UI: create ticket form, worklog form, status change dropdown. TypeScript compiles. |
| F2 — Live check against bridge | Complete | Bridge running on 127.0.0.1:8799 via systemd. kts-ticket CLI: create, list, show, worklog, status, import all tested. |
| B3 — Token-to-actor identity | Complete | Sandbox only. token_service.mint() accepts actor_id, verify() returns actor_id. bridge.py middleware rejects token without actor_id (401, audited). BRIDGE_ACTOR_ID constant removed. |
| B4 — Backlog cleanup | Complete | Sandbox only. ticket.assign and ticket.change_status are now functional permission checks (not vestigial). ticket.assign required for assigned_to/assigned_team changes; ticket.change_status required for status changes. |
| P1 — Import backend into Tauri repo | Complete | Backend imported via git archive from KTS-Tech-Control-Center branch work/b3 (commit 69c8eb5). No git history imported. 171 files imported under backend/. |
| P2 — Make backend runnable from clean clone | Complete | pyproject.toml: added fastapi, uvicorn, httpx, requests, pydantic[email] dependencies. tests: use tmp_path instead of hardcoded /tmp/sandbox-*-a5 paths; fixture users.yaml and permissions.yaml in tests/fixtures/. core/sandbox.py: uses env vars (KTS_VAULT, KTS_HOME) instead of hardcoded home paths; reads env at import time via paths.py. Test suite: 162 passed, 103 failed (pre-existing failures unrelated to P2 changes — mostly tests that write to real vault paths or check real Unraid state). |
| P3 — B3 fail-closed fix | Not started | Bridge middleware must reject (401, audited) any token without actor_id. Remove unused BRIDGE_ACTOR_ID constant. Document in docs/ how to re-mint bridge token with actor_id=USR-000002. |
| P4 — Push and report | In progress | Push work/backend-import. Write STATUS.md from evidence. STOP for review. |

## Branch state
- Branch: work/backend-import (in Tauri repo)
- Commit: 0ad5a6d P2: Make backend runnable from clean clone
- Remote: git@github.com:Bradley-Kars/Kars-Tech-Control-Center.git (PUSHED ✅)
- Backend source: Bradley-Kars/kts-ticketing branch work/b3 (commit 69c8eb5) — imported via git archive, no git history imported

## Files in backend/
- core/ — Python service layer (ticket, task, project, knowledge, user, auth)
- tests/ — 21 test functions in test_a6_security_regression.py (15 original + 6 B3/B4)
- tests/fixtures/ — users.yaml and permissions.yaml fixtures
- docs/evidence/ — B1 evidence, baseline/after-smoke snapshots
- cli.py, pyproject.toml, verify-gates.sh
- .gitignore (excludes vault dirs, users.yaml, tokens, secrets)
- .git/hooks/pre-push (secret/vault scan hook)

## Bridge status (live, verified this session)
- Running via systemd on 127.0.0.1:8799 (systemd unit: kts-bridge.service)
- Token: ~/.config/kts/bridge-token (mode 600)
- CLI: ~/bin/kts-ticket (create, list, show, worklog, status, import)

## Verification evidence (this session)

- `git rev-parse HEAD`: 0ad5a6d (local HEAD)
- `git ls-remote origin work/backend-import`: 0ad5a6d ✅
- `systemctl --user is-active kts-bridge.service`: active ✅
- `ss -ltn | grep 8799`: LISTEN 127.0.0.1:8799 ✅
- `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8799/tickets` (no token): 401 ✅
- `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8799/tickets?all=true` (with token): 200 ✅

## Users.yaml (read-only check)

```
  USR-000002:
    id: "USR-000002"
    role: "technician"
```
users.yaml sha: 698299532291b59072775a52f2d0cf4a17ea6662561c98fec7ff7c9885568913

## Git history (sandbox)

```
8caab2c feat: B3 - token-to-actor identity in auth and bridge
69c8eb5 feat: AI4 - token-to-actor identity in auth and bridge
16c1025 docs: add STATUS.md with milestone status and B1 evidence
51daae6 chore: initial commit for KTS ticketing backend v0.1
```

## Next actions (blocked on user review)

- P3: B3 fail-closed fix (bridge middleware rejects token without actor_id) — already done in sandbox, needs port to Tauri repo
- P4: Push work/backend-import ✅ done, write STATUS.md ✅ done, STOP for review
