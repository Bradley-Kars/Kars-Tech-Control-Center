# KTS Bridge — Deployment (W4)

The bridge is a small FastAPI app (`backend/core/bridge.py`) that exposes the
KTS ticketing API under `/api` and serves the built frontend (`dist/`) at `/`
from the same origin. It binds **127.0.0.1 only** and is never exposed
directly to the tailnet or the internet.

## 1. Run the bridge (localhost only)

From the repository root:

```sh
cd backend
uvicorn core.bridge:app --host 127.0.0.1 --port 8799 --no-proxy-headers
```

`--no-proxy-headers` is required: uvicorn must not rewrite
`request.client` from `X-Forwarded-For`, so the bridge's loopback check
(W3) keeps trusting traffic proxied by tailscale serve.

The app never binds/listens by itself; the host/port are set at launch and
must always be `127.0.0.1`. Do **not** expose the bridge port directly on the
LAN or tailnet — use tailscale serve (below) for tailnet access.

Verify:

```sh
curl -s http://127.0.0.1:8799/api/health   # 401 without a token
```

## 2. Expose via Tailscale (tailnet only, no Funnel)

Tailscale serve publishes a local port on the tailnet without opening it to
the internet. Funnel is the public-facing exposure and is **never** used for
the bridge; keep it tailnet-only.

From the machine running the bridge:

```sh
# Serve the bridge (127.0.0.1:8799) on the tailnet
tailscale serve --bg 8799
```

Confirm the syntax with `tailscale serve --help`, then check
`tailscale serve status`. Reach the bridge from any tailnet device at
`https://<this-machine>.your-tailnet.ts.net/` (tailscale serve terminates TLS
and forwards to 127.0.0.1:8799). Because the bridge only binds loopback, the
only way to reach it from another tailnet node is via this serve proxy.

## 3. systemd service

Run the bridge as a user systemd service so it survives logouts and restarts
on boot. Create `~/.config/systemd/user/kts-bridge.service`:

```ini
[Unit]
Description=KTS bridge (ticketing API, loopback only)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/<user>/GitHub/Kars-Tech-Control-Center/backend
ExecStart=/usr/bin/uvicorn core.bridge:app --host 127.0.0.1 --port 8799 --no-proxy-headers
Restart=on-failure
RestartSec=5
# The bridge binds loopback only; it is reached from the tailnet via
# tailscale serve, never directly.
Environment="KTS_SANDBOX=1"
Environment="KTS_VAULT=%h/Documents/KTS Records-sandbox"
Environment="KTS_HOME=%h/.ticketing-sandbox"

[Install]
WantedBy=default.target
```

Then:

```sh
systemctl --user daemon-reload
systemctl --user enable --now kts-bridge
systemctl --user status kts-bridge
```

Replace `<user>` and the paths with your actual install locations. The bridge
never touches the real vault unless `KTS_VAULT`/`KTS_HOME` point there; the
sandbox values above are for development/testing.

## 4. Add a company device to the tailnet

On the device to enroll:

```sh
tailscale up
```

Then approve the new device in the Tailscale admin console
(https://login.tailscale.com/admin/machines) or via `tailscale approve` from
an existing authorized node. Once approved, the device appears in
`tailscale status` and can reach the bridge via the tailscale serve URL.

Only add devices you control; the bridge's auth (API token or
Tailscale-User-Login, W3) is the second line of defense.

## 5. Token vs Tailscale identity

Two ways to authenticate to the bridge API (W3):

| Method | Header | When to use | Trust boundary |
|--------|--------|-------------|----------------|
| API token | `X-API-Token` | Programmatic access, devices that cannot present a Tailscale identity, or where you do not want to rely on tailnet membership | Verified against the token table; scoped read/write |
| Tailscale login | `Tailscale-User-Login` | Trusted users on the tailnet accessing via tailscale serve from loopback | Trusted **only** from `127.0.0.1`; the login email maps to a user via the optional `login` field in `config/users.yaml` |

Rules:

- Never send the API token over a non-loopback, non-tailscale path.
- The `Tailscale-User-Login` header is honoured **only** for requests whose
  source address is `127.0.0.1`. Tagged devices and Funnel traffic carry no
  usable header, so they cannot spoof it.
- Unknown login or no credentials → `401`, audited as `auth_fail` (source +
  reason recorded).
- The API token never enters the frontend, is never stored in plaintext
  (PBKDF2-HMAC-SHA256 in the table), and is never logged.
- Map login emails to users via the optional `login` field in
  `config/users.yaml` (test fixture only; never edit the real
  `~/.ticketing/config/users.yaml`).

### Trust model

Trusting the `Tailscale-User-Login` header from loopback means any local
process on the bridge host can impersonate a logged-in user by forging that
header. This is acceptable only on a single-user host; do not expose the
bridge to untrusted local processes.

## 6. Security reminders

- The bridge binds loopback only. Do not change `--host` to `0.0.0.0` or
  expose port 8799 directly.
- Access from the tailnet goes through `tailscale serve`, which terminates
  TLS and forwards to `127.0.0.1:8799`.
- Keep `tailscale serve` tailnet-only; Funnel is never used for the bridge.
- Review `tailscale serve status` and `systemctl --user status kts-bridge`
  periodically.
- API tokens are scoped (read/write). Write tokens may call mutating routes
  (create ticket, worklog, status change); read tokens may not.
