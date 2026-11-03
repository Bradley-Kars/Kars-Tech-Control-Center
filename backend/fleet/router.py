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
import httpx
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
from .docker import DockerClient
from .emhttp import EmhttpError, RealEmhttpClient
from .parsers.nvidia import parse_nvidia_smi
from .parsers.smart import parse_smartctl
from .transport import SshCommandError, SshHelper, TransportError
from .adguard_service import (
    AdGuardDHCP,
    AdGuardError,
    AdGuardFilter,
    AdGuardQueryLog,
    AdGuardStats,
    AdGuardStatus,
    RealAdGuardClient,
)
from .nextcloud_service import (
    NextcloudActivity,
    NextcloudClient,
    NextcloudError,
    NextcloudInfo,
    NextcloudStorage,
    NextcloudSystemStatus,
    NextcloudUser,
    RealNextcloudClient,
)
from .adguard_service import (
    AdGuardClient,
    AdGuardDHCP,
    AdGuardError,
    AdGuardQueryLog,
    AdGuardStatus,
    AdGuardStats,
    RealAdGuardClient,
)
from .rest_service import (
    PlexIdentity,
    PlexLibrary,
    RestService,
    RestServiceClient,
    ServiceConfig,
    plex_identity,
    plex_libraries,
    probe,
)
from .homeassistant_service import (
    HomeAssistantArea,
    HomeAssistantConfig,
    HomeAssistantDevice,
    HomeAssistantEntity,
    HomeAssistantError,
    HomeAssistantState,
    RealHomeAssistantClient,
)

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


# ---------------------------------------------------------------------------
# P3: Docker containers over SSH
# ---------------------------------------------------------------------------

def _docker_payload(body: Any) -> tuple[str, str] | JSONResponse:
    """Validate a docker action body: {server_id, container}.

    Returns (server_id, container) or a 422 JSONResponse.
    """
    if not isinstance(body, dict) or not body:
        return JSONResponse(
            {"detail": "body must be a non-empty object"}, status_code=422
        )
    server_id = body.get("server_id")
    container = body.get("container")
    if not isinstance(server_id, str) or not server_id.strip():
        return JSONResponse(
            {"detail": "field 'server_id' is required"}, status_code=422
        )
    if not isinstance(container, str) or not container.strip():
        return JSONResponse(
            {"detail": "field 'container' is required"}, status_code=422
        )
    return server_id, container


def _docker_logs_payload(body: Any) -> tuple[str, str, int] | JSONResponse:
    """Validate a docker logs body: {server_id, container, lines?}."""
    result = _docker_payload(body)
    if isinstance(result, JSONResponse):
        return result
    server_id, container = result
    lines = body.get("lines", 100) if isinstance(body, dict) else 100
    if not isinstance(lines, int) or isinstance(lines, bool) or lines < 1:
        return JSONResponse(
            {"detail": "field 'lines' must be a positive integer"}, status_code=422
        )
    return server_id, container, lines


@router.get("/unraid/get_docker_containers")
async def get_docker_containers(request: Request, server_id: str) -> Any:
    """GET /api/fleet/unraid/get_docker_containers?server_id=X — containers over SSH.

    Mirrors the Tauri ``get_docker_containers`` command. Returns a list of
    {id, name, image, status, state, auto_start}. A failed probe returns a
    redacted 502.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = DockerClient(SshHelper.from_config(server))
        containers = await client.list_containers()
        return [
            {
                "id": c.id,
                "name": c.name,
                "image": c.image,
                "status": c.status,
                "state": c.state,
                "auto_start": c.auto_start,
            }
            for c in containers
        ]
    except (SshCommandError, TransportError) as exc:
        return _probe_error(exc, server)


@router.post("/docker/start")
async def docker_start(request: Request, body: dict) -> Any:
    """POST /api/fleet/docker/start — start a container over SSH.

    Body: {server_id, container}. Returns a status message string.
    """
    validated = _docker_payload(body)
    if isinstance(validated, JSONResponse):
        return validated
    server_id, container = validated
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = DockerClient(SshHelper.from_config(server))
        message = await client.start_container(container)
    except (SshCommandError, TransportError) as exc:
        return _probe_error(exc, server)
    return JSONResponse(content=message)


@router.post("/docker/stop")
async def docker_stop(request: Request, body: dict) -> Any:
    """POST /api/fleet/docker/stop — stop a container over SSH."""
    validated = _docker_payload(body)
    if isinstance(validated, JSONResponse):
        return validated
    server_id, container = validated
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = DockerClient(SshHelper.from_config(server))
        message = await client.stop_container(container)
    except (SshCommandError, TransportError) as exc:
        return _probe_error(exc, server)
    return JSONResponse(content=message)


@router.post("/docker/restart")
async def docker_restart(request: Request, body: dict) -> Any:
    """POST /api/fleet/docker/restart — restart a container over SSH."""
    validated = _docker_payload(body)
    if isinstance(validated, JSONResponse):
        return validated
    server_id, container = validated
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = DockerClient(SshHelper.from_config(server))
        message = await client.restart_container(container)
    except (SshCommandError, TransportError) as exc:
        return _probe_error(exc, server)
    return JSONResponse(content=message)


@router.post("/docker/logs")
async def docker_logs(request: Request, body: dict) -> Any:
    """POST /api/fleet/docker/logs — fetch container logs over SSH.

    Body: {server_id, container, lines?}. Returns the log output string.
    """
    validated = _docker_logs_payload(body)
    if isinstance(validated, JSONResponse):
        return validated
    server_id, container, lines = validated
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = DockerClient(SshHelper.from_config(server))
        output = await client.container_logs(container, lines)
    except (SshCommandError, TransportError) as exc:
        return _probe_error(exc, server)
    return JSONResponse(content=output)


# ---------------------------------------------------------------------------
# P4: Unraid emhttp — array, parity, shares, disks over HTTP
# ---------------------------------------------------------------------------


def _emhttp_client(server: ServerConfig) -> RealEmhttpClient:
    """Build a RealEmhttpClient from a server config (hostname + api_key)."""
    return RealEmhttpClient(
        base_url=f"https://{server.hostname}:443",
        api_key=server.api_key,
    )


@router.get("/unraid/get_array_info")
async def unraid_array_info(request: Request, server_id: str) -> Any:
    """GET /api/fleet/unraid/get_array_info?server_id=X — array info over emhttp.

    Mirrors the Tauri ``get_array_info`` command but speaks Unraid's emhttp
    HTTP API directly instead of SSH. A failed probe returns a redacted 502.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _emhttp_client(server)
        return await client.get_array_info()
    except (EmhttpError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)


@router.get("/unraid/get_array_check_status")
async def unraid_array_check_status(request: Request, server_id: str) -> Any:
    """GET /api/fleet/unraid/get_array_check_status?server_id=X — parity status.

    Mirrors the Tauri ``get_array_check_status`` command over emhttp.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _emhttp_client(server)
        return await client.get_array_check_status()
    except (EmhttpError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)


@router.get("/unraid/get_shares")
async def unraid_get_shares(request: Request, server_id: str) -> Any:
    """GET /api/fleet/unraid/get_shares?server_id=X — shares over emhttp.

    Mirrors the Tauri ``get_shares`` command over emhttp.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _emhttp_client(server)
        return await client.get_shares()
    except (EmhttpError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)


@router.get("/unraid/get_disks")
async def unraid_get_disks(request: Request, server_id: str) -> Any:
    """GET /api/fleet/unraid/get_disks?server_id=X — disks over emhttp.

    Mirrors the Tauri ``get_disks`` command over emhttp.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _emhttp_client(server)
        return await client.get_disks()
    except (EmhttpError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)


# ---------------------------------------------------------------------------
# P5: Plex + generic REST health (HTTP probes)
# ---------------------------------------------------------------------------

def _rest_client(server: ServerConfig) -> RestServiceClient:
    """Build a RestServiceClient from a server's service_keys."""
    config = ServiceConfig.from_keys(RestService.Plex, server.service_keys)
    return RestServiceClient(config)


@router.get("/rest/health")
async def rest_health(request: Request, service: str, server_id: str) -> Any:
    """GET /api/fleet/rest/health?service=X&server_id=X — probe a REST service.

    Mirrors the Tauri REST health probe: resolves the service from the
    server's service_keys, probes its health path, and reports reachable
    true/false with a detail string. Never raises: unreachable services
    report reachable=False with the failure detail.
    """
    rest_service = RestService.parse(service)
    if rest_service is None:
        return JSONResponse(
            {"detail": f"unknown service {service!r}"}, status_code=422
        )
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        health = await probe(rest_service, server.service_keys)
        return {
            "service": health.service,
            "label": health.label,
            "url": health.url,
            "reachable": health.reachable,
            "detail": health.detail,
        }
    except Exception as exc:  # pragma: no cover - probe never raises
        return _probe_error(exc, server)


@router.get("/rest/plex/identity")
async def rest_plex_identity(request: Request, server_id: str) -> Any:
    """GET /api/fleet/rest/plex/identity?server_id=X — Plex server identity.

    Mirrors the Tauri plex_identity command: GET /identity on the Plex
    server and parse the MediaContainer envelope.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _rest_client(server)
        identity = await plex_identity(client)
        return {
            "machine_identifier": identity.machine_identifier,
            "version": identity.version,
            "claimed": identity.claimed,
        }
    except (ValueError, RuntimeError) as exc:
        return _probe_error(exc, server)


@router.get("/rest/plex/libraries")
async def rest_plex_libraries(request: Request, server_id: str) -> Any:
    """GET /api/fleet/rest/plex/libraries?server_id=X — Plex library sections.

    Mirrors the Tauri plex_libraries command: GET /library/sections on the
    Plex server and parse the MediaContainer.Directory array.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _rest_client(server)
        libraries = await plex_libraries(client)
        return [
            {
                "key": lib.key,
                "title": lib.title,
                "library_type": lib.library_type,
                "uuid": lib.uuid,
                "scanning": lib.scanning,
                "updated_at": lib.updated_at,
            }
            for lib in libraries
        ]
    except (ValueError, RuntimeError) as exc:
        return _probe_error(exc, server)


# ---------------------------------------------------------------------------
# P6: Nextcloud over OCS (basic auth + OCS-APIRequest header)
# ---------------------------------------------------------------------------


def _nextcloud_client(server: ServerConfig) -> RealNextcloudClient:
    """Build a RealNextcloudClient from a server's service_keys."""
    keys = server.service_keys
    base_url = keys.nextcloud_url if keys else None
    username = keys.nextcloud_user if keys else None
    password = keys.nextcloud_pass if keys else None
    if not base_url or not base_url.strip():
        raise ValueError("nextcloud_url not configured")
    return RealNextcloudClient(
        base_url=base_url,
        username=username or "",
        password=password or "",
    )


@router.get("/nextcloud/info")
async def nextcloud_info(request: Request, server_id: str) -> Any:
    """GET /api/fleet/nextcloud/info?server_id=X — Nextcloud server info.

    Mirrors the Tauri ``get_nextcloud_info`` command over the OCS API.
    A failed probe returns a redacted 502.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _nextcloud_client(server)
        return await client.get_info()
    except (ValueError, NextcloudError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/nextcloud/status")
async def nextcloud_status(request: Request, server_id: str) -> Any:
    """GET /api/fleet/nextcloud/status?server_id=X — Nextcloud system status.

    Mirrors the Tauri ``get_nextcloud_status`` command over the OCS API.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _nextcloud_client(server)
        return await client.get_status()
    except (ValueError, NextcloudError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/nextcloud/storage")
async def nextcloud_storage(request: Request, server_id: str) -> Any:
    """GET /api/fleet/nextcloud/storage?server_id=X — Nextcloud storage stats.

    Mirrors the Tauri ``get_nextcloud_storage`` command over the OCS API.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _nextcloud_client(server)
        return await client.get_storage()
    except (ValueError, NextcloudError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/nextcloud/users")
async def nextcloud_users(request: Request, server_id: str) -> Any:
    """GET /api/fleet/nextcloud/users?server_id=X — Nextcloud users.

    Mirrors the Tauri ``get_nextcloud_users`` command over the OCS API.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _nextcloud_client(server)
        return await client.get_users()
    except (ValueError, NextcloudError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/nextcloud/activity")
async def nextcloud_activity(request: Request, server_id: str) -> Any:
    """GET /api/fleet/nextcloud/activity?server_id=X&limit=X — Nextcloud activity.

    Mirrors the Tauri ``get_nextcloud_activity`` command over the OCS API.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    limit = request.query_params.get("limit")
    limit_int = int(limit) if limit else None
    try:
        client = _nextcloud_client(server)
        return await client.get_activity(limit_int)
    except (ValueError, NextcloudError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


# ---------------------------------------------------------------------------
# P7: AdGuard Home — status, stats, query log, clients, filters, DHCP and
# protection enable/disable over the local /control/ API
# ---------------------------------------------------------------------------


def _adguard_client(server: ServerConfig) -> RealAdGuardClient:
    """Build a RealAdGuardClient from a server's service_keys."""
    keys = server.service_keys
    base_url = keys.adguard_url if keys else None
    username = keys.adguard_user if keys else None
    password = keys.adguard_pass if keys else None
    if not base_url or not base_url.strip():
        raise ValueError("adguard_url not configured")
    return RealAdGuardClient(
        base_url=base_url,
        username=username or "",
        password=password or "",
    )


def _adguard_action_payload(body: Any) -> str | JSONResponse:
    """Validate an AdGuard action body: {server_id}."""
    if not isinstance(body, dict) or not body:
        return JSONResponse(
            {"detail": "body must be a non-empty object"}, status_code=422
        )
    server_id = body.get("server_id")
    if not isinstance(server_id, str) or not server_id.strip():
        return JSONResponse(
            {"detail": "field 'server_id' is required"}, status_code=422
        )
    return server_id


@router.get("/adguard/get_adguard_status")
async def adguard_status(request: Request, server_id: str) -> Any:
    """GET /api/fleet/adguard/get_adguard_status?server_id=X — AdGuard status.

    Mirrors the Tauri ``get_adguard_status`` command. A failed probe returns a
    redacted 502.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _adguard_client(server)
        return await client.get_status()
    except (ValueError, AdGuardError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/adguard/get_adguard_stats")
async def adguard_stats(request: Request, server_id: str) -> Any:
    """GET /api/fleet/adguard/get_adguard_stats?server_id=X — AdGuard stats.

    Mirrors the Tauri ``get_adguard_stats`` command.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _adguard_client(server)
        return await client.get_stats()
    except (ValueError, AdGuardError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/adguard/get_adguard_query_log")
async def adguard_query_log(request: Request, server_id: str) -> Any:
    """GET /api/fleet/adguard/get_adguard_query_log?server_id=X&limit=X&offset=X.

    Mirrors the Tauri ``get_adguard_query_log`` command.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        limit = int(request.query_params.get("limit", 50))
        offset = int(request.query_params.get("offset", 0))
    except ValueError:
        return JSONResponse(
            {"detail": "limit and offset must be integers"}, status_code=422
        )
    try:
        client = _adguard_client(server)
        return await client.get_query_log(limit=limit, offset=offset)
    except (ValueError, AdGuardError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/adguard/get_adguard_clients")
async def adguard_clients(request: Request, server_id: str) -> Any:
    """GET /api/fleet/adguard/get_adguard_clients?server_id=X — AdGuard clients."""
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _adguard_client(server)
        return await client.get_clients()
    except (ValueError, AdGuardError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/adguard/get_adguard_filters")
async def adguard_filters(request: Request, server_id: str) -> Any:
    """GET /api/fleet/adguard/get_adguard_filters?server_id=X — AdGuard filters."""
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _adguard_client(server)
        return await client.get_filters()
    except (ValueError, AdGuardError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/adguard/get_adguard_dhcp")
async def adguard_dhcp(request: Request, server_id: str) -> Any:
    """GET /api/fleet/adguard/get_adguard_dhcp?server_id=X — AdGuard DHCP state."""
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _adguard_client(server)
        return await client.get_dhcp()
    except (ValueError, AdGuardError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.post("/adguard/adguard_enable")
async def adguard_enable(request: Request, body: dict) -> Any:
    """POST /api/fleet/adguard/adguard_enable — enable DNS protection.

    Body: {server_id}. Requires scope=write (enforced by the create_app
    middleware).
    """
    server_id = _adguard_action_payload(body)
    if isinstance(server_id, JSONResponse):
        return server_id
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _adguard_client(server)
        await client.enable_protection()
    except (ValueError, AdGuardError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)
    return JSONResponse(content={"ok": True})


@router.post("/adguard/adguard_disable")
async def adguard_disable(request: Request, body: dict) -> Any:
    """POST /api/fleet/adguard/adguard_disable — disable DNS protection.

    Body: {server_id}. Requires scope=write (enforced by the create_app
    middleware).
    """
    server_id = _adguard_action_payload(body)
    if isinstance(server_id, JSONResponse):
        return server_id
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _adguard_client(server)
        await client.disable_protection()
    except (ValueError, AdGuardError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)
    return JSONResponse(content={"ok": True})


# ---------------------------------------------------------------------------
# P7: AdGuard Home over HTTP (basic auth)
# ---------------------------------------------------------------------------


def _adguard_client(server: ServerConfig) -> RealAdGuardClient:
    """Build a RealAdGuardClient from a server's service_keys."""
    keys = server.service_keys
    base_url = keys.adguard_url if keys else None
    username = keys.adguard_user if keys else None
    password = keys.adguard_pass if keys else None
    if not base_url or not base_url.strip():
        raise ValueError("adguard_url not configured")
    return RealAdGuardClient(
        base_url=base_url,
        username=username or "",
        password=password or "",
    )


@router.get("/adguard/status")
async def adguard_status(request: Request, server_id: str) -> Any:
    """GET /api/fleet/adguard/status?server_id=X — AdGuard Home status.

    Mirrors the Tauri ``get_adguard_status`` command over the AdGuard Home API.
    A failed probe returns a redacted 502.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _adguard_client(server)
        return await client.get_status()
    except (ValueError, AdGuardError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/adguard/stats")
async def adguard_stats(request: Request, server_id: str) -> Any:
    """GET /api/fleet/adguard/stats?server_id=X — AdGuard Home statistics.

    Mirrors the Tauri ``get_adguard_stats`` command over the AdGuard Home API.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _adguard_client(server)
        return await client.get_stats()
    except (ValueError, AdGuardError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/adguard/querylog")
async def adguard_querylog(request: Request, server_id: str) -> Any:
    """GET /api/fleet/adguard/querylog?server_id=X&limit=X&offset=X — AdGuard query log.

    Mirrors the Tauri ``get_adguard_query_log`` command over the AdGuard Home API.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    limit = request.query_params.get("limit")
    offset = request.query_params.get("offset")
    limit_int = int(limit) if limit else 50
    offset_int = int(offset) if offset else 0
    try:
        client = _adguard_client(server)
        return await client.get_query_log(limit_int, offset_int)
    except (ValueError, AdGuardError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/adguard/clients")
async def adguard_clients(request: Request, server_id: str) -> Any:
    """GET /api/fleet/adguard/clients?server_id=X — AdGuard Home clients.

    Mirrors the Tauri ``get_adguard_clients`` command over the AdGuard Home API.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _adguard_client(server)
        return await client.get_clients()
    except (ValueError, AdGuardError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/adguard/filters")
async def adguard_filters(request: Request, server_id: str) -> Any:
    """GET /api/fleet/adguard/filters?server_id=X — AdGuard Home filters.

    Mirrors the Tauri ``get_adguard_filters`` command over the AdGuard Home API.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _adguard_client(server)
        return await client.get_filters()
    except (ValueError, AdGuardError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/adguard/dhcp")
async def adguard_dhcp(request: Request, server_id: str) -> Any:
    """GET /api/fleet/adguard/dhcp?server_id=X — AdGuard Home DHCP status.

    Mirrors the Tauri ``get_adguard_dhcp`` command over the AdGuard Home API.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _adguard_client(server)
        return await client.get_dhcp()
    except (ValueError, AdGuardError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.post("/adguard/enable")
async def adguard_enable(request: Request, server_id: str) -> Any:
    """POST /api/fleet/adguard/enable?server_id=X — enable AdGuard protection.

    Mirrors the Tauri ``adguard_enable`` command over the AdGuard Home API.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _adguard_client(server)
        await client.enable_protection()
        return {"status": "enabled"}
    except (ValueError, AdGuardError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.post("/adguard/disable")
async def adguard_disable(request: Request, server_id: str) -> Any:
    """POST /api/fleet/adguard/disable?server_id=X — disable AdGuard protection.

    Mirrors the Tauri ``adguard_disable`` command over the AdGuard Home API.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _adguard_client(server)
        await client.disable_protection()
        return {"status": "disabled"}
    except (ValueError, AdGuardError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


# ---------------------------------------------------------------------------
# P8: Home Assistant — states, config, areas, devices, entity registry and
# service calls (toggle / turn on / turn off) over the HTTP /api/ API
# ---------------------------------------------------------------------------


def _homeassistant_client(server: ServerConfig) -> RealHomeAssistantClient:
    """Build a RealHomeAssistantClient from a server's service_keys."""
    keys = server.service_keys
    base_url = keys.homeassistant_url if keys else None
    token = keys.homeassistant_token if keys else None
    if not base_url or not base_url.strip():
        raise ValueError("homeassistant_url not configured")
    return RealHomeAssistantClient(base_url=base_url, token=token or "")


def _ha_entity_id_payload(request: Request, server_id: str, entity_id: str) -> None:
    """Validate that server_id and entity_id are present for HA action routes.

    server_id and entity_id are passed as query parameters, mirroring the
    GET routes. Raises nothing; the caller resolves the server and 404s when
    missing.
    """
    if not isinstance(server_id, str) or not server_id.strip():
        raise ValueError("field 'server_id' is required")
    if not isinstance(entity_id, str) or not entity_id.strip():
        raise ValueError("field 'entity_id' is required")


@router.get("/homeassistant/get_homeassistant_states")
async def homeassistant_states(request: Request, server_id: str) -> Any:
    """GET /api/fleet/homeassistant/get_homeassistant_states?server_id=X — HA states.

    Mirrors the Tauri ``get_homeassistant_states`` command. A failed probe
    returns a redacted 502.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _homeassistant_client(server)
        return await client.get_states()
    except (ValueError, HomeAssistantError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/homeassistant/get_homeassistant_config")
async def homeassistant_config(request: Request, server_id: str) -> Any:
    """GET /api/fleet/homeassistant/get_homeassistant_config?server_id=X — HA config.

    Mirrors the Tauri ``get_homeassistant_config`` command.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _homeassistant_client(server)
        return await client.get_config()
    except (ValueError, HomeAssistantError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/homeassistant/get_homeassistant_areas")
async def homeassistant_areas(request: Request, server_id: str) -> Any:
    """GET /api/fleet/homeassistant/get_homeassistant_areas?server_id=X — HA areas.

    Mirrors the Tauri ``get_homeassistant_areas`` command.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _homeassistant_client(server)
        return await client.get_areas()
    except (ValueError, HomeAssistantError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/homeassistant/get_homeassistant_devices")
async def homeassistant_devices(request: Request, server_id: str) -> Any:
    """GET /api/fleet/homeassistant/get_homeassistant_devices?server_id=X — HA devices.

    Mirrors the Tauri ``get_homeassistant_devices`` command.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _homeassistant_client(server)
        return await client.get_devices()
    except (ValueError, HomeAssistantError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/homeassistant/get_homeassistant_entities")
async def homeassistant_entities(request: Request, server_id: str) -> Any:
    """GET /api/fleet/homeassistant/get_homeassistant_entities?server_id=X — HA entity registry.

    Mirrors the Tauri ``get_homeassistant_entities`` command (entity registry).
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _homeassistant_client(server)
        return await client.get_entities()
    except (ValueError, HomeAssistantError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.post("/homeassistant/homeassistant_toggle")
async def homeassistant_toggle(request: Request, server_id: str, entity_id: str) -> Any:
    """POST /api/fleet/homeassistant/homeassistant_toggle?server_id=X&entity_id=X — toggle an entity.

    Mirrors the Tauri ``homeassistant_toggle`` command. Requires scope=write
    (enforced by the create_app middleware).
    """
    _ha_entity_id_payload(request, server_id, entity_id)
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _homeassistant_client(server)
        await client.toggle_entity(entity_id)
    except (ValueError, HomeAssistantError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)
    return {"status": "toggled", "entity_id": entity_id}


@router.post("/homeassistant/homeassistant_turn_on")
async def homeassistant_turn_on(request: Request, server_id: str, entity_id: str) -> Any:
    """POST /api/fleet/homeassistant/homeassistant_turn_on?server_id=X&entity_id=X — turn an entity on.

    Mirrors the Tauri ``homeassistant_turn_on`` command. Requires scope=write
    (enforced by the create_app middleware).
    """
    _ha_entity_id_payload(request, server_id, entity_id)
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _homeassistant_client(server)
        await client.turn_on_entity(entity_id)
    except (ValueError, HomeAssistantError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)
    return {"status": "on", "entity_id": entity_id}


@router.post("/homeassistant/homeassistant_turn_off")
async def homeassistant_turn_off(request: Request, server_id: str, entity_id: str) -> Any:
    """POST /api/fleet/homeassistant/homeassistant_turn_off?server_id=X&entity_id=X — turn an entity off.

    Mirrors the Tauri ``homeassistant_turn_off`` command. Requires scope=write
    (enforced by the create_app middleware).
    """
    _ha_entity_id_payload(request, server_id, entity_id)
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _homeassistant_client(server)
        await client.turn_off_entity(entity_id)
    except (ValueError, HomeAssistantError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)
    return {"status": "off", "entity_id": entity_id}
