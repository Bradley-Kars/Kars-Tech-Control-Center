# Staging Deployment

Documentation for `scripts/deploy-staging.sh` — the KTS Master Control
staging deployment script.

## Overview

`scripts/deploy-staging.sh` deploys a given branch to the KTS Master Control
staging instance. It performs a fresh clone, builds the frontend and backend,
runs a sandbox import check, copies untracked per-instance config from the old
staging tree, stops the staging unit, swaps the repo directory, starts the
staging unit, and verifies port 8798 answers and serves a new bundle. On any
failure it rolls back automatically.

## Guardrails

The script refuses to:

- Deploy the `main` or `master` branch (production branches).
- Touch the production unit (`kts-production`).
- Touch `tailscale serve`.
- Reference `~/kts/repo` or `~/kts-backups`.
- Contain real hostnames, emails, or tokens.
- Reference MySpeed (the product does not exist).
- List Lidarr, Sonarr, or Radarr as separate sections (they live in one Arr
  section).

The script is **not** executed by tests or CI. It is for the owner to run
against real staging infrastructure. Structural tests live in
`backend/tests/test_deploy_staging.py` and validate the script without ever
running it.

## Usage

```
./scripts/deploy-staging.sh <branch>
```

`<branch>` is the git branch to deploy (must not be `main` or `master`).

## Steps

| # | Step | Description |
|---|------|-------------|
| 1 | Fresh clone | Clone `<branch>` into `~/kts-build` |
| 2 | Frontend build | `npm ci`, `npx tsc -b`, `npm run build` |
| 3 | Backend venv | `python3 -m venv .venv` + `pip install -e ".[dev]"` |
| 4 | Sandbox import check | Import check using `mktemp` throwaway dirs |
| 5 | Copy untracked config | `rsync` untracked per-instance config from old staging tree |
| 6 | Stop staging unit | `systemctl stop kts-staging` (staging only) |
| 7 | Back up | Back up current staging tree before swapping |
| 8 | Swap | `mv ~/kts-build` to the staging repo dir |
| 9 | Start staging unit | `systemctl start kts-staging` |
| 10 | Verify | `curl` port 8798 until it answers |

## Rollback

On any failure, the script's `trap ... EXIT` handler rolls back:
restores the previous staging tree and removes the failed build.

## Related

- `scripts/smoke-real.sh` — read-only smoke checks against real servers (owner
  only, GET requests only).
- `docs/staging-smoke-checklist.md` — post-deployment smoke-test checklist.
