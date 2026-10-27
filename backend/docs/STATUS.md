# KTS Ticketing Backend — v0.1 Status

## Current milestone: P2 — Make backend runnable from clean clone
## Next milestone: P3 — B3 fail-closed fix

## Milestone status

| Milestone | Status | Details |
|-----------|--------|---------|
| B1 — Reconcile & verify M1-M5 | Complete | Full suite: 246 passed / 24 failed (sandbox-isolation tests only). 15 tests in tests/test_a6_security_regression.py. Diff: 5004 lines, 30 files. |
| B2 — Publish backend | Complete | Repo: Bradley-Kars/kts-ticketing. Branch: work/v0.1. Tag: m-B1. Commit: 8436f10. Pushed to origin. |
| F1 — Tauri ticketing UI | Complete | Tauri commands: ticketing_create_ticket, ticketing_add_worklog, ticketing_change_status. Tauri UI: create ticket form, worklog form, status change dropdown. TypeScript compiles. |
| F2 — Live check against bridge | Complete | Bridge running on 127.0.0.1:8799 via systemd. kts-ticket CLI: create, list, show, worklog, status, import all tested. |
| B3 — Token-to-actor identity | Complete | Sandbox only. token_service.mint() accepts actor_id, verify() returns actor_id. bridge.py uses request.state.actor_id instead of hardcoded BRIDGE_ACTOR_ID. |
| B4 — Backlog cleanup | Complete | Sandbox only. ticket.assign and ticket.change_status are now functional permission checks (not vestigial). ticket.assign required for assigned_to/assigned_team changes; ticket.change_status required for status changes. |
| P1 — Import backend into Tauri repo | In progress | Backend extracted via `git archive work/b3` into backend/. Committed on work/backend-import. |
| P2 — Make backend runnable from clean clone | Not started | pyproject.toml needs pydantic[email], pyyaml, numpy, fastapi, uvicorn, httpx, requests. Tests must use tmp_path, not hardcoded /tmp paths. |
| P3 — B3 fail-closed fix | Not started | Bridge middleware must reject (401, audited) any token with no actor_id. Remove unused BRIDGE_ACTOR_ID constant. |
| P4 — Push and report | Not started | Push work/backend-import. Write STATUS.md from evidence. STOP for review. |

## Branch state
- Branch: work/backend-import (orphan content imported via git archive)
- Tag: none yet
- Remote: git@github.com:Bradley-Kars/kts-ticketing.git (origin)
- Backend source: Bradley-Kars/kts-ticketing branch work/b3, commit 69c8eb5 (via git archive, no history imported)

## Files in repo
- backend/core/ — Python service layer (ticket, task, project, knowledge, user, auth)
- backend/tests/ — test suite
- backend/docs/evidence/ — B1 evidence, baseline/after-smoke snapshots
- backend/cli.py, backend/pyproject.toml, backend/verify-gates.sh
- backend/.gitignore (excludes vault dirs, users.yaml, tokens, secrets)
- backend/.git/hooks/pre-push (secret/vault scan hook)

## Bridge status (live, verified this session)
- Running via systemd on 127.0.0.1:8799 (systemd unit: kts-bridge.service)
- Token: ~/.config/kts/bridge-token (mode 600)
- CLI: ~/bin/kts-ticket (create, list, show, worklog, status, import)
- `systemctl --user is-active kts-bridge.service`: active
- `ss -ltn | grep 8799`: LISTEN 127.0.0.1:8799
- `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8799/tickets` (no token): 401
- `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8799/tickets?all=true` (with token): 200

## Users.yaml (read-only check, from local ~/.ticketing)

```
  USR-000002:
    id: "USR-000002"
    role: "technician"
```

users.yaml sha: 698299532291b59072775a52f2d0cf4a17ea6662561c98fec7ff7c9885568913

## Git history (local sandbox, from work/b3)

```
69c8eb5 feat: AI4 - token-to-actor identity in auth and bridge
16c1025 docs: add STATUS.md with milestone status and B1 evidence
51daae6 chore: initial commit for KTS ticketing backend v0.1
```

## Next actions (blocked on user review)

- P2: Make backend runnable from clean clone (pyproject.toml deps, tests use tmp_path, sandbox.py paths)
- P3: B3 fail-closed fix (bridge middleware rejects token without actor_id, remove BRIDGE_ACTOR_ID)
- P4: Push work/backend-import, write STATUS.md from evidence, STOP for review
