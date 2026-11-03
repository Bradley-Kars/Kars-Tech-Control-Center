# KTS Master Control — Web-Server Architecture

## End state

KTS Master Control is a web application: a **Python FastAPI backend in `backend/`** and a **React/Vite frontend in `src/`**. In the end state there is **no Tauri, no Rust, and no desktop app anywhere in the repo**.

`src-tauri/` is reference material only: read it, port its behaviour to Python. It is deleted in Phase 4 and must not be edited.

## Fleet package layout (`backend/`)

- `backend/cli.py` — CLI entry point
- `backend/config/` — YAML config (`automation.yaml`, `categories.yaml`, `permissions.yaml`, `priorities.yaml`, `sla.yaml`, `statuses.yaml`, `system.yaml`, `ui.yaml`) plus `local.yaml.example` (gitignored override template, `contact_email: "owner@example.com"`)
- `backend/core/` — application core
  - `api.py` — FastAPI app and routes
  - `auth.py` — identity enforcement; every terminal/shell route goes through one `require_admin` dependency from day one
  - `bridge.py` — fleet bridge endpoints (e.g. `/api/adguard/...`, `/api/nextcloud/...`)
  - `counters.py`, `events.py`, `indexer.py`, `permissions.py`, `safe_io.py`, `sandbox.py`, `templates.py`, `validator.py`
  - `models/` — data models
  - `services/` — per-service clients (e.g. `adguard_service.py`, `nextcloud_service.py`, `ticket_service.py`, `unraid_service.py`)
- `backend/migrations/` — database migrations
- `backend/schemas/`, `backend/tools/`
- `backend/tests/` — pytest suite (`conftest.py`, `fixtures/`, `phasef_helpers.py`)
- `backend/verify-gates.sh` — independent gate verification

## Configuration: `servers.json`

The fleet source of truth is `~/.config/master-control/servers.json` (overridable via the `KTS_SERVERS_FILE` environment variable). It is a JSON **list** of server entries. Each entry's shape is derived from `ServerConfig` in `src/lib/types.ts`, which mirrors `src-tauri/src/config/legacy_config.rs`:

- `id`, `name`, `hostname`, `port`, `username`
- `auth`: `{ type: "password", password }` or `{ type: "key", key_path, passphrase? }`
- `device_type`
- `api_key?`, `service_keys?` (per-service credentials and URLs)
- `meshcentral_device_id?`, `meshcentral_enrolled_at?`, `meshcentral_status?`, `connection_priority?`

`servers.json` wins for matching server ids. Writes are atomic (mode 0600) with a `.bak` copy.

Private ticketing bridge config lives separately in `~/.config/master-control/config.private.json` (mode 0600): `bridge_url`, `bridge_token`, `use_live_bridge`. It is never exposed to the frontend and never in `servers.json`.

## Tests never touch real infrastructure

- Backend tests (pytest) run against temp-dir fixtures: `conftest.py` points `KTS_SANDBOX`, `KTS_VAULT`, and `KTS_HOME` at `tempfile.mkdtemp()` directories and copies fixture `users.yaml`/`permissions.yaml` into them. Real-install tests are skipped by default.
- Frontend tests use generated fixtures and stub transport; no real hosts are contacted.
- `scripts/smoke-real.sh` performs read-only smoke checks against the real `servers.json` and is run by the owner only — never from tests or CI.

**Never print, cat, log, or commit `servers.json` values.** To learn its shape, print keys only.

## Placeholders only

This repo contains no real hostnames, emails, or tokens. Where a doc or example needs an identity, use placeholders only:

- `owner@example.com`
- `<device>.<tailnet>.ts.net`

## Opencode / Hermes terminals

Opencode and Hermes in the app are visual wrappers (xterm in the browser) around the TUI running on the machine that hosts the web server — no custom chat UI, no `opencode serve` sidecar, no opencode SDK calls.
