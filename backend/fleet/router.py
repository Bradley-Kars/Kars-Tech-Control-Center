"""backend/fleet/router.py — /api/fleet server CRUD (F4).

Server registry backed by servers.json (KTS_SERVERS_FILE or
~/.config/master-control/servers.json). Identity enforcement is provided by
create_app()'s middleware: 401 without a token, scope=write required for
POST/DELETE, GET allowed for any authenticated token.

Responses never include secret fields — every server returned to the client
passes through fleet.config.redact_server.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from .config import (
    ServerConfig,
    load_servers,
    redact_error,
    redact_server,
    save_servers,
)
from .transport import SshCommandError, SshHelper, TransportError

router = APIRouter()

# Service probes (nextcloud, lidarr, …) are stubbed until those clients are
# ported in P2-P10: test_connection reports every service as untested.
DEFAULT_SERVICES: dict[str, bool] = {
    "graphql": False,
    "nextcloud": False,
    "lidarr": False,
    "homeassistant": False,
    "myspeed": False,
    "adguard": False,
    "phone": False,
    "plex": False,
    "scrutiny": False,
    "uptimekuma": False,
    "invoiceninja": False,
    "aurral": False,
    "your_spotify": False,
    "dozzle": False,
}


def _server_list() -> list[ServerConfig]:
    """Load the current server registry from servers.json."""
    return load_servers()


@router.get("/servers")
def list_servers(request: Request) -> dict[str, Any]:
    """GET /api/fleet/servers — list all servers (redacted).

    Requires an authenticated token (read scope is sufficient, enforced by
    the create_app middleware). Secrets are redacted before reaching the
    client.
    """
    servers = _server_list()
    return {"servers": [redact_server(s) for s in servers], "count": len(servers)}


@router.post("/servers")
def save_server(request: Request, body: dict) -> Any:
    """POST /api/fleet/servers — create or update a server (upsert by id).

    Requires scope=write (enforced by the create_app middleware). The body
    must be a non-empty object containing a non-empty string "id"; all other
    fields are validated by ServerConfig. Upsert: an existing server with the
    same id is replaced.

    The persisted file keeps real secrets (mode 0600); the response is
    redacted.
    """
    if not isinstance(body, dict) or not body:
        return JSONResponse(
            {"detail": "body must be a non-empty object"}, status_code=422
        )

    server_id = body.get("id")
    if not isinstance(server_id, str) or not server_id.strip():
        return JSONResponse(
            {"detail": "field 'id' is required"}, status_code=422
        )

    try:
        server = ServerConfig(**body)
    except Exception as exc:  # pydantic ValidationError -> 422
        return JSONResponse({"detail": f"invalid server: {exc}"}, status_code=422)

    servers = _server_list()
    servers = [s for s in servers if s.id != server.id]
    servers.append(server)
    save_servers(servers)

    return redact_server(server)


@router.delete("/servers/{server_id}")
def remove_server(request: Request, server_id: str) -> Any:
    """DELETE /api/fleet/servers/{server_id} — remove a server by id.

    Requires scope=write (enforced by the create_app middleware). Returns
    404 when no server with that id exists. The removal is persisted to
    servers.json.
    """
    servers = _server_list()
    remaining = [s for s in servers if s.id != server_id]
    if len(remaining) == len(servers):
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )

    save_servers(remaining)
    return {"removed": server_id}


@router.post("/test_connection")
async def test_connection(body: dict) -> Any:
    """POST /api/fleet/test_connection — probe connectivity to a server config.

    The config is validated but NOT persisted: this is a pre-save probe used
    by the connection screen. Connectivity is tested over SSH
    (``hostname`` then ``uname -r``). Per-service probes (nextcloud, lidarr,
    …) are stubbed until those clients are ported in P2-P10.

    Scope=write is enforced by create_app's middleware (POST). Secrets in the
    config are never echoed: any transport/auth/timeout failure is redacted
    before it reaches the client, and a failed probe returns success=false
    with HTTP 200, mirroring the Tauri ``test_connection`` handler.
    """
    if not isinstance(body, dict) or not body:
        return JSONResponse(
            {"detail": "body must be a non-empty object"}, status_code=422
        )

    try:
        config = ServerConfig(**body)
    except Exception as exc:  # pydantic ValidationError -> 422
        return JSONResponse(
            {"detail": f"invalid server config: {exc}"}, status_code=422
        )

    auth = config.auth
    if isinstance(auth, dict):
        password = auth.get("password")
    else:
        password = auth.password
    secrets: list[str] = [password] if isinstance(password, str) and password else []

    try:
        helper = SshHelper.from_config(config)
        hostname_result = await helper.run("hostname")
        hostname = hostname_result.stdout.strip() or config.hostname
        os_result = await helper.run("uname -r")
        os_ = os_result.stdout.strip() or "unknown"
    except Exception as exc:  # any connect/auth/timeout failure -> failed probe
        message = f"SSH connection failed: {exc}"
        if secrets:
            message = redact_error(message, secrets)
        return {
            "success": False,
            "message": message,
            "hostname": "unknown",
            "os": "unknown",
            "services": dict(DEFAULT_SERVICES),
        }

    return {
        "success": True,
        "message": f"Connected to {hostname}",
        "hostname": hostname,
        "os": os_,
        "services": dict(DEFAULT_SERVICES),
    }
