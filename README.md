# KTS Master Control — Web Frontend + FastAPI Backend

KTS Master Control is a web-based fleet management and monitoring application. It consists of:

- **Frontend**: React + TypeScript + Vite (this directory)
- **Backend**: FastAPI Python service in `backend/` (Unix domain socket / HTTP on localhost)

## Prerequisites

- Node.js 20+ and npm
- Python 3.12+ with `pip`
- `uvicorn` and `fastapi` (Python)

## Quick Start

### 1. Install frontend dependencies

```bash
npm ci
```

### 2. Install backend dependencies

```bash
cd backend
pip install -r requirements.txt
cd ..
```

*(If `requirements.txt` does not exist, install the packages listed in `backend/pyproject.toml` or use the project's virtualenv.)*

### 3. Configure the backend

Copy the example config and fill in placeholder values:

```bash
cp backend/config/local.yaml.example backend/config/local.yaml
# Edit backend/config/local.yaml with your settings
cp ~/.config/master-control/servers.json.example ~/.config/master-control/servers.json 2>/dev/null || true
```

The `servers.json` file lists the servers the backend talks to. See **Servers Schema** below.

### 4. Start the backend

```bash
cd backend
uvicorn core.bridge:app --host 127.0.0.1 --port 8799
```

The backend listens on `http://127.0.0.1:8799` by default. Override with `--port`.

### 5. Build and serve the frontend

```bash
npm ci
npm run build
npm run preview   # serves dist/ on http://localhost:5173
```

The Vite dev server proxies `/api` to the backend at `http://127.0.0.1:8798` by default. Override with `VITE_API_PROXY`:

```bash
VITE_API_PROXY=http://127.0.0.1:8799 npm run dev
```

## Systemd Unit Example

Create `/etc/systemd/system/kts-master-control.service`:

```ini
[Unit]
Description=KTS Master Control Backend
After=network.target

[Service]
Type=simple
User=kts
WorkingDirectory=/home/slayerbrk/GitHub/Kars-Tech-Control-Center/backend
Environment=KTS_SERVERS_FILE=/home/slayerbrk/.config/master-control/servers.json
Environment=KTS_ALLOWED_HOSTS=127.0.0.1,localhost
ExecStart=/usr/bin/python3 -m uvicorn core.bridge:app --host 127.0.0.1 --port 8799
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kts-master-control
```

## Servers Schema (`servers.json`)

The backend reads server configuration from `~/.config/master-control/servers.json`. Placeholder structure:

```json
{
  "servers": [
    {
      "id": "unraid-main",
      "name": "Unraid Main",
      "hostname": "<device>.<tailnet>.ts.net",
      "port": 22,
      "username": "root",
      "auth": {
        "type": "password",
        "password": "<redacted>"
      },
      "device_type": "unraid",
      "service_keys": {
        "adguard_url": "http://<device>.<tailnet>.ts.net:8085",
        "adguard_token": "<redacted>",
        "nextcloud_url": "https://<device>.<tailnet>.ts.net:8443",
        "nextcloud_user": "admin",
        "nextcloud_pass": "<redacted>",
        "homeassistant_url": "http://<device>.<tailnet>.ts.net:8123",
        "homeassistant_token": "<redacted>",
        "lidarr_url": "http://<device>.<tailnet>.ts.net:8888",
        "lidarr_api_key": "<redacted>",
        "myspeed_url": "http://<device>.<tailnet>.ts.net:8086",
        "plex_url": "http://<device>.<tailnet>.ts.net:32400",
        "plex_token": "<redacted>"
      }
    }
  ]
}
```

Replace `<device>.<tailnet>.ts.net` with your actual Tailscale hostname and `<redacted>` with real secrets.

## Running Tests

### Frontend tests

```bash
npm ci
npm test              # vitest run (unit tests)
npm run test:coverage # vitest with coverage
```

### Backend tests

```bash
cd backend
pip install -r requirements.txt  # or install deps from pyproject.toml
python -m pytest
```

### Full verification

```bash
npm run lint          # oxlint
npx tsc -b            # TypeScript typecheck
npm run test:coverage # vitest with coverage
npm run build         # tsc -b && vite build
cd backend && python3 -m venv .venv && .venv/bin/pip install -q -e ".[dev]" && .venv/bin/python -m pytest -q -p no:cacheprovider tests $(grep -l phasef_helpers tests/*.py | sed 's#^#--ignore=#')  # backend gates (pytest)
```

### E2E tests

```bash
npm run e2e           # playwright against localhost:5173
```

The e2e tests expect the dev server (`npm run dev`) or a built preview (`npm run build && npm run preview`) running on port 5173 with the backend accessible at the configured proxy target.

## Project Structure

```
backend/              Python FastAPI backend
  core/               Auth, bridge (main app), config, services
  fleet/              Ported service clients (Unraid, Nextcloud, Plex, etc.)
  tests/              Backend test suite
src/                  React frontend
  lib/fleet-api.ts    Fetch client for /api/fleet
  components/         React components
  pages/              Page components (Dashboard, Settings, etc.)
e2e/                  Playwright end-to-end tests
docs/                 Architecture and design documents
```

## Architecture

- Frontend talks to backend over HTTP via `/api/fleet` (same-origin in production, proxied via Vite in dev)
- Backend is a FastAPI app (`core.bridge:app`) that talks to servers over SSH/HTTP
- Tauri desktop app has been removed; the web app is the sole client
- Secrets (tokens, passwords) are never committed; they come from `servers.json` and environment variables