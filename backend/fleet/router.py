"""backend/fleet/router.py — /api/fleet server CRUD (F4).

Server registry backed by servers.json (KTS_SERVERS_FILE or
~/.config/master-control/servers.json). Identity enforcement is provided by
create_app()'s middleware: 401 without a token, scope=write required for
POST/DELETE, GET allowed for any authenticated token.

Responses never include secret fields — every server returned to the client
passes through fleet.config.redact_server.
"""

from __future__ import annotations

import asyncio
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
from .parsers.nvidia import parse_nvidia_smi
from .parsers.smart import parse_smartctl
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


# ---------------------------------------------------------------------------
# P2: system stats / GPU / SMART probes over SSH + host-local stats
# ---------------------------------------------------------------------------

def _find_server(server_id: str) -> ServerConfig | None:
    """Look a server up by id in the current servers.json."""
    for server in load_servers():
        if server.id == server_id:
            return server
    return None


def _secrets(server: ServerConfig) -> list[str]:
    """Secret strings carried by a server config, for redaction in errors."""
    secrets: list[str] = []
    auth = server.auth
    password = auth.get("password") if isinstance(auth, dict) else getattr(auth, "password", None)
    if isinstance(password, str) and password:
        secrets.append(password)
    if server.api_key:
        secrets.append(server.api_key)
    return secrets


def _probe_error(exc: Exception, server: ServerConfig) -> JSONResponse:
    """Turn an SSH probe failure into a redacted 502 response."""
    message = redact_error(f"probe failed: {exc}", _secrets(server))
    return JSONResponse({"detail": message}, status_code=502)


# --- /proc parsing ----------------------------------------------------------

def _cpu_times(stat_text: str) -> tuple[int, int]:
    """(idle_jiffies, total_jiffies) from the aggregate ``cpu `` line of /proc/stat."""
    for line in stat_text.splitlines():
        if not line.startswith("cpu "):
            continue
        nums = [int(p) for p in line.split()[1:] if p.lstrip("-").isdigit()]
        if len(nums) < 4:
            return (0, 0)
        return (nums[3] + nums[4], sum(nums))
    return (0, 0)


def _parse_cpu_usage(stat1: str, stat2: str) -> float:
    """Delta-based CPU usage % between two /proc/stat samples."""
    idle0, total0 = _cpu_times(stat1)
    idle1, total1 = _cpu_times(stat2)
    if total1 <= total0:
        return 0.0
    return max(0.0, min(100.0, (1.0 - (idle1 - idle0) / (total1 - total0)) * 100.0))


def _parse_memory(meminfo: str) -> tuple[int, int, int]:
    """(total_kb, free_kb, used_kb) from /proc/meminfo."""

    def mem(key: str) -> int:
        for line in meminfo.splitlines():
            if line.startswith(key):
                parts = line.split()
                try:
                    return int(parts[1])
                except (IndexError, ValueError):
                    return 0
        return 0

    total = mem("MemTotal:")
    available = mem("MemAvailable:")
    used = max(0, total - available)
    return (total, mem("MemFree:"), used)


def _parse_loadavg(text: str) -> list[float]:
    """The three 1/5/15-minute load averages from /proc/loadavg."""
    out: list[float] = []
    for part in text.split()[:3]:
        try:
            out.append(float(part))
        except ValueError:
            out.append(0.0)
    while len(out) < 3:
        out.append(0.0)
    return out


def _cpu_cores(cpuinfo: str) -> int:
    return sum(1 for line in cpuinfo.splitlines() if line.startswith("processor"))


async def _probe_system_stats(helper: SshHelper) -> dict[str, Any]:
    """Gather SystemStats over SSH from a remote server."""
    hostname = (await helper.run("hostname")).stdout.strip() or "unknown"
    kernel = (await helper.run("uname -r")).stdout.strip() or "unknown"
    uptime = (await helper.run("uptime -p")).stdout.strip() or "unknown"

    stat1 = (await helper.run("cat /proc/stat")).stdout
    await asyncio.sleep(0.2)
    stat2 = (await helper.run("cat /proc/stat")).stdout
    meminfo = (await helper.run("cat /proc/meminfo")).stdout
    loadavg = (await helper.run("cat /proc/loadavg")).stdout
    cpuinfo = (await helper.run("cat /proc/cpuinfo")).stdout

    total_kb, _free_kb, used_kb = _parse_memory(meminfo)
    memory_total_mb = total_kb // 1024
    memory_used_mb = used_kb // 1024
    memory_usage_pct = (used_kb / total_kb * 100.0) if total_kb > 0 else 0.0

    return {
        "hostname": hostname,
        "kernel": kernel,
        "uptime": uptime,
        "cpu_usage": _parse_cpu_usage(stat1, stat2),
        "cpu_cores": _cpu_cores(cpuinfo),
        "memory_total_mb": memory_total_mb,
        "memory_used_mb": memory_used_mb,
        "memory_usage_pct": memory_usage_pct,
        "load_avg": _parse_loadavg(loadavg),
        "array_state": "UNKNOWN",
    }


def _read_local(path: str) -> str:
    """Read a local /proc file, returning empty string on any error."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


@router.get("/system/stats")
async def system_stats(request: Request, server_id: str) -> Any:
    """GET /api/fleet/system/stats?server_id=X — system stats over SSH.

    Mirrors the Tauri ``get_system_stats`` command but probes over SSH
    (hostname, uname -r, uptime, /proc/stat, /proc/meminfo, /proc/loadavg,
    /proc/cpuinfo) instead of Unraid's GraphQL API. A failed probe returns a
    redacted 502 rather than crashing.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        helper = SshHelper.from_config(server)
        return await _probe_system_stats(helper)
    except (SshCommandError, TransportError) as exc:
        return _probe_error(exc, server)


@router.get("/unraid/get_gpu_info")
async def gpu_info(request: Request, server_id: str) -> Any:
    """GET /api/fleet/unraid/get_gpu_info — GPU info via nvidia-smi over SSH."""
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        helper = SshHelper.from_config(server)
        output = (
            await helper.run(
                "nvidia-smi --query-gpu=name,driver_version,memory.total,"
                "memory.used,temperature.gpu,utilization.gpu "
                "--format=csv,noheader,nounits"
            )
        ).stdout
    except (SshCommandError, TransportError) as exc:
        return _probe_error(exc, server)
    info = parse_nvidia_smi(output)
    if info is None:
        info = {
            "name": "Unknown GPU",
            "driver_version": "",
            "cuda_version": "",
            "temperature": "",
            "power_usage": "",
            "power_cap": "",
            "memory_used": "",
            "memory_total": "",
            "utilization": "",
            "fan_speed": "",
        }
    return info


@router.get("/unraid/get_smart_data")
async def smart_data(request: Request, server_id: str, device: str) -> Any:
    """GET /api/fleet/unraid/get_smart_data?server_id=X&device=/dev/sda — SMART over SSH."""
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        helper = SshHelper.from_config(server)
        output = (await helper.run(f"smartctl -a {device}")).stdout
    except (SshCommandError, TransportError) as exc:
        return _probe_error(exc, server)
    return parse_smartctl(output, device)


@router.get("/local/stats")
def local_stats(request: Request) -> Any:
    """GET /api/fleet/local/stats — host-local system stats (no SSH).

    Reads /proc on the machine running the backend. Mirrors the Tauri
    ``get_local_system_stats`` command. Host-only: only meaningful when the
    backend runs on the machine being monitored.
    """
    stat1 = _read_local("/proc/stat")
    stat2 = _read_local("/proc/stat")
    meminfo = _read_local("/proc/meminfo")
    loadavg = _read_local("/proc/loadavg")
    cpuinfo = _read_local("/proc/cpuinfo")

    total_kb, _free_kb, used_kb = _parse_memory(meminfo)
    memory_total_mb = total_kb // 1024
    memory_used_mb = used_kb // 1024
    memory_usage_pct = (used_kb / total_kb * 100.0) if total_kb > 0 else 0.0

    return {
        "hostname": _read_local("/proc/sys/kernel/hostname") or "unknown",
        "kernel": _read_local("/proc/sys/kernel/osrelease") or "unknown",
        "uptime": "unknown",
        "cpu_usage": _parse_cpu_usage(stat1, stat2),
        "cpu_cores": _cpu_cores(cpuinfo),
        "memory_total_mb": memory_total_mb,
        "memory_used_mb": memory_used_mb,
        "memory_usage_pct": memory_usage_pct,
        "load_avg": _parse_loadavg(loadavg),
        "array_state": "UNKNOWN",
    }
