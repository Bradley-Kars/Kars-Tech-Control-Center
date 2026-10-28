# KTS Bridge — Staging Deployment

The staging deployment runs the web app from the repo against a **copy** of the real data, reachable over the tailnet on a separate port, for testing from a phone. The live bridge on `127.0.0.1:8799`, the real vault, `~/.ticketing`, the real `users.yaml`, `~/.config/kts/bridge-token`, and `~/bin/kts-ticket` are **read-only** for this milestone — nothing is modified on the live system.

## Staging URL

```
https://<machine>.<tailnet>.ts.net:8443/
```

Accessible from any tailnet device (phone, laptop, etc.). Tailnet only — not exposed to the public internet (no Funnel).

## Start

The staging service runs as a systemd user service:

```sh
systemctl --user start kts-staging.service
systemctl --user status kts-staging.service
```

Tailscale serve is started in the background:

```sh
tailscale serve --bg --https=8443 8798
```

Confirm syntax with `tailscale serve --help`.

## Stop

```sh
systemctl --user stop kts-staging.service
tailscale serve --https=8443 off
```

## Undo (complete removal)

```sh
systemctl --user stop kts-staging.service
systemctl --user disable kts-staging.service
rm ~/.config/systemd/user/kts-staging.service
systemctl --user daemon-reload
tailscale serve --https=8443 off
rm -rf ~/kts-staging
rm ~/.config/kts/staging-token
```

## Verification

| Test | Command | Expected |
|------|---------|----------|
| Health via tailnet | `curl -s -o /dev/null -w "%{http_code}" -H "Host: <machine>.<tailnet>.ts.net" -H "Tailscale-User-Login: you@example.com" https://<machine>.<tailnet>.ts.net:8443/api/health` | 200 |
| Forged Host | `curl -s -o /dev/null -w "%{http_code}" -H "Host: evil.com" https://<machine>.<tailnet>.ts.net:8443/api/health` | 400 |
| No creds on loopback | `curl -s -o /dev/null -w "%{http_code}" -H "Host: 127.0.0.1" http://127.0.0.1:8798/api/health` | 401 |
| Root page HTML | `curl -s -o /dev/null -w "%{http_code}" -H "Host: <machine>.<tailnet>.ts.net" https://<machine>.<tailnet>.ts.net:8443/` | 200 |

## Notes

- Token: `~/.config/kts/staging-token` (mode 600). Value not printed here.
- The staging bridge binds `127.0.0.1:8798` only. Tailnet access is via `tailscale serve --https=8443 8798`.
- Do not edit the live system. All data lives under `~/kts-staging/data/` (copies of real vault/config).
