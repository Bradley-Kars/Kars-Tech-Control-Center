# Re-minting the KTS bridge token (H2b / B3)

The bridge (`core.bridge.create_app`) authenticates every request with an
`X-API-Token`. Each token record stores `label`, `scope` (`read`|`write`),
and an optional `actor_id`. The middleware rejects any token whose
`actor_id` is `None` with `401` and writes an `auth_fail` audit line
(reason `"token has no actor_id"`).

This guide re-mints a bridge token with `actor_id=USR-000002` and installs
it at `~/.config/kts/bridge-token`. **The token secret is never printed,
never logged, and never stored in plaintext** (the table stores only a
PBKDF2-HMAC-SHA256 hash).

## 1. Mint the token (secret returned once)

Run in the sandbox (or with `KTS_SANDBOX=1` + `KTS_VAULT`/`KTS_HOME` set to
non-real locations so the real `~/.ticketing/config/.env` is never read):

```sh
python3 - <<'PY'
import json
from pathlib import Path
from core.auth import TokenTable

table = TokenTable("~/.ticketing/auth/token-table.json")  # sandbox-aware via paths
token_id, secret = table.mint("bridge", scope="write", actor_id="USR-000002")
print(token_id)          # safe: token_id is not a secret
# `secret` is printed here ONLY so you can capture it in the next step.
PY
```

Capture the printed `kts_...` secret. It is shown exactly once.

## 2. Install it at `~/.config/kts/bridge-token`

Write the secret to the bridge token file with mode `600`:

```sh
printf '%s' "$SECRET" > ~/.config/kts/bridge-token
chmod 600 ~/.config/kts/bridge-token
```

Do **not** echo the secret to the terminal, do not commit it, and do not
send it over chat/email.

## 3. Verify

```sh
python3 - <<'PY'
from pathlib import Path
from core.auth import TokenTable, default_token_table

table = default_token_table()
secret = Path("~/.config/kts/bridge-token").expanduser().read_text().strip()
rec = table.verify(secret)
assert rec is not None, "token did not verify"
assert rec.get("actor_id") == "USR-000002", f"actor_id={rec.get('actor_id')!r}"
assert rec.get("scope") == "write"
print("OK: bridge token verifies, actor_id=USR-000002, scope=write")
PY
```

## Rules

- Never print the secret value (first 2 chars max if you must reference it).
- The secret is never stored in the token table, audit log, or any plan/backup.
- Revoking is immediate: `table.revoke(token_id)` rejects the token on the
  next `verify()`.
- The live bridge (`~/.config/kts/bridge-token`, systemd on `127.0.0.1:8799`)
  is off-limits for edits/restarts unless the maintainer authorizes promotion.

## Bridge identity — API token or Tailscale login (W3)

The middleware authenticates every API request by EITHER:

- an `X-API-Token` verified against the token table (`core/auth.py`), or
- a `Tailscale-User-Login` header, trusted **only** when the request arrives
  from `127.0.0.1` (the bridge listens on loopback only, and tailscale serve
  strips spoofed headers; tagged devices and Funnel traffic carry no header).

The login email is mapped to a user via the optional `login` field on each
entry in `config/users.yaml` (never `~/.ticketing` directly):

```yaml
users:
  USR-000002:
    id: "USR-000002"
    ...
    login: "bridge.operator@example.com"
    role: "technician"
```

Unknown login or no credentials → `401`, audited as `auth_fail` with the
source and reason. The login mapping is read from `config/users.yaml`
(home root), never from the vault, and missing/malformed users.yaml denies
all (fail-closed). Add `login` to the test fixture only; never edit the real
`~/.ticketing/config/users.yaml`.
