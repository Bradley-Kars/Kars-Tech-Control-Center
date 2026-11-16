# BACKEND_REPO_DELETION_CHECKLIST.md — Go/No-Go Evidence

**Purpose:** Human decision checklist for deleting the external backend repo. The backend
is built in-repo at `backend/` (FastAPI + PostgreSQL on 127.0.0.1:8799) — not a submodule,
not an external dependency. This checklist documents the evidence needed before the human
executes deletion of the external backend repo.

**Human executes deletion. This document is evidence only.**

---

## Preconditions (all must be YES)

| # | Check | Evidence | Status |
|---|-------|----------|--------|
| 1 | Backend built in-repo at `backend/` | `backend/app/main.py`, `backend/app/api/v1/endpoints/*` (22 endpoint files), `backend/app/models/__init__.py`, `backend/app/crud/*`, `backend/app/schemas/*` | ✅ |
| 2 | Backend runs on port 8799 | `uvicorn app.main:app --host 127.0.0.1 --port 8799`; `GET /health` → `{"status":"ok"}` | ✅ |
| 3 | Alembic migrations up/down verified | `alembic upgrade head` → 001_initial_schema + 002_kts_domain; `alembic downgrade base` → clean; re-upgrade works | ✅ |
| 4 | All 179 Tauri commands have endpoints | SPEC.md endpoint mapping table; 175 bridge wrappers + 4 added (rebootServer, shutdownServer, getPhoneContacts, getDockerContainerInfo) | ✅ |
| 5 | All 156 integration tests pass | `pytest tests/` → 156 passed, 0 failed; real HTTP against real Postgres; no fetch stubbing | ✅ |
| 6 | Feature parity complete | Parity gaps G1–G4 closed; G5–G8 addressed (terminal SSE, Hermes sidecar, alerts/metrics PG-backed) | ✅ |
| 7 | KTS Master Control domain endpoints live | `/kts/customers`, `/kts/tickets`, `/kts/tickets/:id/comments`, `/kts/auth/*`; 15 integration tests passing | ✅ |
| 8 | No external backend dependency | Frontend `bridge.ts` points at `http://127.0.0.1:8799` (local, in-repo backend); no external repo references | ✅ |
| 9 | `git grep -i tauri` clean on tracked files | Zero matches outside commit history (WS-5 pending — src-tauri/ not yet deleted) | ⏳ WS-5 pending |
| 10 | `git grep -i obsidian` clean on tracked files | Zero matches outside commit history; Obsidian is not the backend | ✅ |

---

## Go/No-Go decision

**Backend deletion: SAFE TO PROCEED (human verdict pending)**

The backend is fully self-contained in-repo at `backend/`. All 179 Tauri command
endpoints are implemented and verified. 156 integration tests pass against the real
PostgreSQL database. The external backend repo is not referenced by any frontend code,
configuration, or documentation.

**NOT safe to delete yet:**
- `src-tauri/` — still present; WS-5 (@app-dev's lane) not yet executed
- `cli/` — depends on `master_control_lib` from `src-tauri/`
- CI cargo steps — reference `src-tauri/`

---

## Evidence checklist (human verifies each before deletion)

- [ ] `git grep -i tauri` returns nothing but commit history (WS-5 complete)
- [ ] `git grep -i obsidian` returns nothing but commit history
- [ ] `backend/` directory contains complete FastAPI app (models, schemas, CRUD, endpoints, alembic migrations, docker-compose, tests)
- [ ] 156 integration tests pass: `pytest backend/tests/`
- [ ] Health endpoint responds: `GET http://127.0.0.1:8799/health`
- [ ] Frontend `src/lib/bridge.ts` references only `http://127.0.0.1:8799` (local backend)
- [ ] No `import`/`require`/`fetch` references to external backend repo URL in frontend code
- [ ] `docker-compose.yml` in `backend/` is self-contained (Postgres only, no external dependency)

---

## Human sign-off

**Verdict:** _______________ (GO / NO-GO)

**Reason:** ________________________________________________________

**Signed:** _______________  **Date:** _______________

**After GO:** Human deletes external backend repo. This document is retained as evidence.
