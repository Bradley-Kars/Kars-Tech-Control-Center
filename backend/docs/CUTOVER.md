# KTS Cutover to Real Vault

This document describes the cutover of the KTS bridge from the staging environment to the real vault on `~/Documents/KTS Records` and `~/.ticketing`.

## Overview

The staging server (running on port 8798, reachable via `tailscale serve --https=8443 8798`) was used to test the backend against a copy of the real data. This document describes the cutover to serve the live traffic from the real vault on port 8799.

## Prerequisites

- The staging server (`kts-staging.service`) is running and verified
- A backup of the real vault and home config has been created (`~/kts-backups/cutover-*.tar.gz`)
- The current `~/.config/kts/bridge-token` has been backed up as `~/.config/kts/bridge-token.old`
- The current `~/.config/systemd/user/kts-bridge.service` has been backed up

## Cutover Steps

1. **Stop the staging server** (optional - can remain running for reference)
2. **Stop the old bridge** (`kts-bridge.service` on port 8799)
3. **Mint a write token** with `actor_id=USR-000002` in the real token table
4. **Save the token** to `~/.config/kts/bridge-token` (mode 600), keeping the old as `bridge-token.old`
5. **Add login field** to the human admin account (USR-000001) in the real `~/.ticketing/config/users.yaml`
6. **Start the new bridge** (`kts-bridge.service` on port 8799 with `--no-proxy-headers`)
7. **Start tailslate serve** on port 8799 (`tailscale serve --bg 8799`)
8. **Verify**: health check, ticket count, login identity

## Rollback

If the cutover fails, run `~/kts/ROLLBACK.sh` to restore the previous state. The rollback script:

- Stops the new `kts-bridge.service`
- Restores the previous `kts-bridge.service` unit file
- Restores the previous `~/.config/kts/bridge-token`
- Optionally restores the vault (only with `--restore-vault`)

## Verification

After cutover, verify:

- `GET https://<tailnet>.ts.net:8443/api/health` returns 200
- Ticket count equals pre-cutover count plus smoke ticket
- Forged Host header returns 400
- No-credential request to 127.0.0.1:8799 returns 401

## Rollback Script

The rollback script is at `~/kts/ROLLBACK.sh`. Run with `--dry-run` to preview changes without applying them.
