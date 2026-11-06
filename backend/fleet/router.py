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
from dataclasses import asdict

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from core.admin import require_admin
from .readonly import is_fleet_readonly, require_fleet_write
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
from .adguard_service import AdGuardError, RealAdGuardClient
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
from .arr_service import (  # noqa: E402 - A3
    ArrApp,
    ArrError,
    RealArrClient,
)
from .meshcentral_service import (  # noqa: E402 - P11
    MeshCentralClient,
    MeshCentralConfig,
    MeshCentralError,
    RealMeshCentralClient,
    BatchCommand,
    BatchResult,
)
from .remote_service import (  # noqa: E402 - P12
    RemoteClient,
    RealRemoteClient,
    RemoteError,
    ShellResult,
    RemoteFileInfo,
    RemoteProcess,
)
from .alerts_service import (  # noqa: E402 - P13
    Alert,
    AlertFilter,
    AlertsMetricsStore,
    MetricPoint,
    MetricSeries,
)
from .phone_service import (  # noqa: E402 - P14
    PhoneError,
    PhoneUnavailableError,
    PhoneClient,
    RealPhoneClient,
    FixturePhoneClient,
    PhoneDeviceInfo,
    PhoneBattery,
    PhoneStorage,
    PhoneMemory,
)
from .kdeconnect_service import (  # noqa: E402 - P14
    KdeConnectError,
    KdeConnectUnavailableError,
    KdeConnectClient,
    RealKdeConnectClient,
    FixtureKdeConnectClient,
    KdeConnectBattery,
    KdeConnectConnectivity,
)

router = APIRouter()

# Service probes (nextcloud, lidarr, …) are stubbed until those clients are
# ported in P2-P10: test_connection reports every service as untested.
DEFAULT_SERVICES: dict[str, bool] = {
    "graphql": False,
    "nextcloud": False,
    "lidarr": False,
    "homeassistant": False,
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
def save_server(
    request: Request,
    body: dict,
    _readonly: None = Depends(require_fleet_write),
) -> Any:
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
def remove_server(
    request: Request,
    server_id: str,
    _readonly: None = Depends(require_fleet_write),
) -> Any:
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


@router.get("/readonly")
def fleet_readonly() -> dict[str, bool]:
    """GET /api/fleet/readonly — whether fleet writes are blocked on this instance.

    True when KTS_FLEET_READONLY=1, or when KTS_FLEET_READONLY is unset and
    KTS_SANDBOX=1. The frontend uses this to disable fleet write buttons and
    show a read-only banner. This endpoint is itself read-only and is never
    gated by require_fleet_write.
    """
    return {"readonly": is_fleet_readonly()}


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
    with HTTP 200, mirroring the ``test_connection`` handler.
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


def _phone_client(server: ServerConfig) -> RealPhoneClient:
    """Build a RealPhoneClient from a server's service_keys."""
    keys = server.service_keys
    serial = keys.phone_adb_serial if keys else None
    if not serial or not serial.strip():
        raise ValueError("phone_adb_serial not configured")
    return RealPhoneClient(serial=serial)


def _kdeconnect_client(server: ServerConfig) -> RealKdeConnectClient:
    """Build a RealKdeConnectClient from a server's service_keys."""
    keys = server.service_keys
    device_id = keys.kdeconnect_device_id if keys else None
    if not device_id or not device_id.strip():
        raise ValueError("kdeconnect_device_id not configured")
    return RealKdeConnectClient(device_id=device_id)


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

    Mirrors the ``get_system_stats`` command but probes over SSH
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
    except (SshCommandError, TransportError, OSError) as exc:
        # asyncssh can raise plain OSError (e.g. socket.gaierror when the
        # hostname does not resolve, or connection refused) before any SSH
        # command runs; treat it as a failed probe, not a 500 crash.
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

    Reads /proc on the machine running the backend. Mirrors the
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

    Mirrors the ``get_docker_containers`` command. Returns a list of
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
async def docker_start(
    request: Request,
    body: dict,
    _readonly: None = Depends(require_fleet_write),
) -> Any:
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
    except (SshCommandError, TransportError, OSError) as exc:
        return _probe_error(exc, server)
    return JSONResponse(content=message)


@router.post("/docker/stop")
async def docker_stop(
    request: Request,
    body: dict,
    _readonly: None = Depends(require_fleet_write),
) -> Any:
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
    except (SshCommandError, TransportError, OSError) as exc:
        return _probe_error(exc, server)
    return JSONResponse(content=message)


@router.post("/docker/restart")
async def docker_restart(
    request: Request,
    body: dict,
    _readonly: None = Depends(require_fleet_write),
) -> Any:
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
    except (SshCommandError, TransportError, OSError) as exc:
        return _probe_error(exc, server)
    return JSONResponse(content=message)


@router.post("/docker/logs")
async def docker_logs(
    request: Request,
    body: dict,
    _readonly: None = Depends(require_fleet_write),
) -> Any:
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
    except (SshCommandError, TransportError, OSError) as exc:
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

    Mirrors the ``get_array_info`` command but speaks Unraid's emhttp
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

    Mirrors the ``get_array_check_status`` command over emhttp.
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

    Mirrors the ``get_shares`` command over emhttp.
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

    Mirrors the ``get_disks`` command over emhttp.
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
# C1: Unraid deferred commands over SSH (processes, syslog, user scripts,
# plugins, network interfaces, tailscale peers). Mirrors the original Rust
# command module but runs each command over SSH via SshHelper — the web
# backend has no GraphQL, so e.g. get_plugins lists the plugin directory
# over SSH. Unknown server -> 404; SSH/transport failure -> redacted 502
# so secrets never reach logs or error messages.
# ---------------------------------------------------------------------------


@router.get("/unraid/get_processes")
async def unraid_get_processes(request: Request, server_id: str) -> Any:
    """GET /api/fleet/unraid/get_processes?server_id=X — process list over SSH.

    Mirrors the ``get_processes`` command: runs ``ps aux --sort=-%cpu |
    head -25`` over SSH and returns the raw output.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        helper = SshHelper.from_config(server)
        output = (await helper.run("ps aux --sort=-%cpu | head -25")).stdout
    except (SshCommandError, TransportError, OSError) as exc:
        return _probe_error(exc, server)
    return JSONResponse(content=output)


@router.get("/unraid/get_syslog")
async def unraid_get_syslog(
    request: Request, server_id: str, lines: str = "50"
) -> Any:
    """GET /api/fleet/unraid/get_syslog?server_id=X&lines=N — syslog tail over SSH.

    Mirrors the ``get_syslog`` command: runs ``tail -N /var/log/syslog``
    over SSH (default 50 lines) and returns the raw output. A non-integer
    ``lines`` is a 422.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        lines_int = int(lines)
    except (TypeError, ValueError):
        return JSONResponse(
            {"detail": "field 'lines' must be an integer"}, status_code=422
        )
    if lines_int < 1:
        return JSONResponse(
            {"detail": "field 'lines' must be a positive integer"}, status_code=422
        )
    try:
        helper = SshHelper.from_config(server)
        output = (await helper.run(f"tail -{lines_int} /var/log/syslog")).stdout
    except (SshCommandError, TransportError, OSError) as exc:
        return _probe_error(exc, server)
    return JSONResponse(content=output)


@router.get("/unraid/get_user_scripts")
async def unraid_get_user_scripts(request: Request, server_id: str) -> Any:
    """GET /api/fleet/unraid/get_user_scripts?server_id=X — user scripts over SSH.

    Mirrors the ``get_user_scripts`` command: lists
    /boot/config/plugins/user.scripts/scripts/ over SSH.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        helper = SshHelper.from_config(server)
        output = (
            await helper.run("ls /boot/config/plugins/user.scripts/scripts/")
        ).stdout
    except (SshCommandError, TransportError, OSError) as exc:
        return _probe_error(exc, server)
    return JSONResponse(content=output)


@router.post("/unraid/run_user_script")
async def unraid_run_user_script(request: Request, body: dict) -> Any:
    """POST /api/fleet/unraid/run_user_script — run a user script over SSH.

    Body: {server_id, script}. Runs
    /boot/config/plugins/user.scripts/scripts/<script>/run_script.sh over SSH
    and returns its output. Requires scope=write (create_app middleware).
    """
    if not isinstance(body, dict) or not body:
        return JSONResponse(
            {"detail": "body must be a non-empty object"}, status_code=422
        )
    server_id = body.get("server_id")
    script = body.get("script")
    if not isinstance(server_id, str) or not server_id.strip():
        return JSONResponse(
            {"detail": "field 'server_id' is required"}, status_code=422
        )
    if not isinstance(script, str) or not script.strip():
        return JSONResponse(
            {"detail": "field 'script' is required"}, status_code=422
        )
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        helper = SshHelper.from_config(server)
        output = (
            await helper.run(
                f"/boot/config/plugins/user.scripts/scripts/{script}/run_script.sh"
            )
        ).stdout
    except (SshCommandError, TransportError, OSError) as exc:
        return _probe_error(exc, server)
    return JSONResponse(content=output)


@router.get("/unraid/get_plugins")
async def unraid_get_plugins(request: Request, server_id: str) -> Any:
    """GET /api/fleet/unraid/get_plugins?server_id=X — installed plugins over SSH.

    Mirrors the ``get_plugins`` command: lists /usr/local/emhttp/plugins over
    SSH and returns the plugin names as a string array.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        helper = SshHelper.from_config(server)
        output = (await helper.run("ls /usr/local/emhttp/plugins")).stdout
    except (SshCommandError, TransportError, OSError) as exc:
        return _probe_error(exc, server)
    return JSONResponse(content=output.splitlines())


@router.get("/unraid/get_network_interfaces")
async def unraid_get_network_interfaces(request: Request, server_id: str) -> Any:
    """GET /api/fleet/unraid/get_network_interfaces?server_id=X — interfaces over SSH.

    Mirrors the ``get_network_interfaces`` command: runs ``ip -br addr show``
    over SSH and returns the raw output.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        helper = SshHelper.from_config(server)
        output = (await helper.run("ip -br addr show")).stdout
    except (SshCommandError, TransportError, OSError) as exc:
        return _probe_error(exc, server)
    return JSONResponse(content=output)


@router.get("/unraid/get_tailscale_peers")
async def unraid_get_tailscale_peers(request: Request, server_id: str) -> Any:
    """GET /api/fleet/unraid/get_tailscale_peers?server_id=X — Tailscale peers over SSH.

    Mirrors the ``get_tailscale_peers`` command: runs ``tailscale status``
    over SSH and returns the raw output.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        helper = SshHelper.from_config(server)
        output = (await helper.run("tailscale status")).stdout
    except (SshCommandError, TransportError, OSError) as exc:
        return _probe_error(exc, server)
    return JSONResponse(content=output)


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

    Mirrors the REST health probe: resolves the service from the
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

    Mirrors the plex_identity command: GET /identity on the Plex
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

    Mirrors the plex_libraries command: GET /library/sections on the
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

    Mirrors the ``get_nextcloud_info`` command over the OCS API.
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

    Mirrors the ``get_nextcloud_status`` command over the OCS API.
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

    Mirrors the ``get_nextcloud_storage`` command over the OCS API.
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

    Mirrors the ``get_nextcloud_users`` command over the OCS API.
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

    Mirrors the ``get_nextcloud_activity`` command over the OCS API.
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

    Mirrors the ``get_adguard_status`` command over the AdGuard Home API.
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

    Mirrors the ``get_adguard_stats`` command over the AdGuard Home API.
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

    Mirrors the ``get_adguard_query_log`` command over the AdGuard Home API.
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

    Mirrors the ``get_adguard_clients`` command over the AdGuard Home API.
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

    Mirrors the ``get_adguard_filters`` command over the AdGuard Home API.
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

    Mirrors the ``get_adguard_dhcp`` command over the AdGuard Home API.
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

    Mirrors the ``adguard_enable`` command over the AdGuard Home API.
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

    Mirrors the ``adguard_disable`` command over the AdGuard Home API.
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

    Mirrors the ``get_homeassistant_states`` command. A failed probe
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

    Mirrors the ``get_homeassistant_config`` command.
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

    Mirrors the ``get_homeassistant_areas`` command.
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

    Mirrors the ``get_homeassistant_devices`` command.
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

    Mirrors the ``get_homeassistant_entities`` command (entity registry).
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

    Mirrors the ``homeassistant_toggle`` command. Requires scope=write
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

    Mirrors the ``homeassistant_turn_on`` command. Requires scope=write
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

    Mirrors the ``homeassistant_turn_off`` command. Requires scope=write
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


# ---------------------------------------------------------------------------
# A3: *arr — one client for Lidarr (/api/v1), Sonarr and Radarr (/api/v3).
# system status, health, artists, albums, wanted/missing, queue, disk space,
# calendar and library total, plus "search missing" / "refresh series"
# commands over the HTTP *arr API (X-Api-Key auth)
# ---------------------------------------------------------------------------


def _arr_client(server: ServerConfig, app: str) -> RealArrClient:
    """Build a RealArrClient from a server's service_keys for the given *arr app."""
    try:
        arr_app = ArrApp[app.capitalize()]
    except KeyError:
        raise ValueError(f"unknown *arr app {app!r}")
    keys = server.service_keys
    base_url = getattr(keys, arr_app.url_field()) if keys else None
    api_key = getattr(keys, arr_app.api_key_field()) if keys else None
    if not base_url or not base_url.strip():
        raise ValueError(f"{arr_app.value}_url not configured")
    return RealArrClient(app=arr_app, base_url=base_url, api_key=api_key or "")


@router.get("/arr/status")
async def arr_status(request: Request, server_id: str, app: str) -> Any:
    """GET /api/fleet/arr/status?server_id=X&app=X — *arr system status.

    Mirrors the ``get_lidarr_status`` command, generalised to any *arr app.
    A failed probe returns a redacted 502.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _arr_client(server, app)
        return await client.get_status()
    except (ValueError, ArrError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/arr/health")
async def arr_health(request: Request, server_id: str, app: str) -> Any:
    """GET /api/fleet/arr/health?server_id=X&app=X — *arr health issues.

    Mirrors the ``get_lidarr_health`` command, generalised to any *arr app.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _arr_client(server, app)
        return await client.get_health()
    except (ValueError, ArrError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/arr/artists")
async def arr_artists(request: Request, server_id: str, app: str) -> Any:
    """GET /api/fleet/arr/artists?server_id=X&app=X — *arr artists.

    Mirrors the ``get_lidarr_artists`` command, generalised to any *arr app.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _arr_client(server, app)
        return await client.get_artists()
    except (ValueError, ArrError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/arr/albums")
async def arr_albums(request: Request, server_id: str, app: str) -> Any:
    """GET /api/fleet/arr/albums?server_id=X&app=X&artist_id=X&monitored=X.

    Mirrors the ``get_lidarr_albums`` command, generalised to any *arr app.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _arr_client(server, app)
        artist_id = request.query_params.get("artist_id")
        monitored = request.query_params.get("monitored")
        artist_id_int = int(artist_id) if artist_id else None
        monitored_bool = None
        if monitored is not None:
            monitored_bool = monitored.lower() == "true"
        return await client.get_albums(artist_id=artist_id_int, monitored=monitored_bool)
    except (ValueError, ArrError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/arr/wanted")
async def arr_wanted(request: Request, server_id: str, app: str) -> Any:
    """GET /api/fleet/arr/wanted?server_id=X&app=X&page=X&page_size=X.

    Mirrors the ``get_lidarr_wanted`` command, generalised to any *arr app.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _arr_client(server, app)
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 20))
        return await client.get_wanted(page=page, page_size=page_size)
    except (ValueError, ArrError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/arr/queue")
async def arr_queue(request: Request, server_id: str, app: str) -> Any:
    """GET /api/fleet/arr/queue?server_id=X&app=X&page=X&page_size=X.

    Mirrors the ``get_lidarr_queue`` command, generalised to any *arr app.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _arr_client(server, app)
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 20))
        return await client.get_queue(page=page, page_size=page_size)
    except (ValueError, ArrError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/arr/diskspace")
async def arr_diskspace(request: Request, server_id: str, app: str) -> Any:
    """GET /api/fleet/arr/diskspace?server_id=X&app=X — *arr disk space.

    Mirrors the ``get_lidarr_diskspace`` command, generalised to any *arr app.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _arr_client(server, app)
        return await client.get_diskspace()
    except (ValueError, ArrError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/arr/calendar")
async def arr_calendar(request: Request, server_id: str, app: str) -> Any:
    """GET /api/fleet/arr/calendar?server_id=X&app=X&days=X — *arr calendar.

    Mirrors the ``calendar`` endpoint, generalised to any *arr app.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _arr_client(server, app)
        days = int(request.query_params.get("days", 7))
        return await client.get_calendar(days=days)
    except (ValueError, ArrError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/arr/library_total")
async def arr_library_total(request: Request, server_id: str, app: str) -> Any:
    """GET /api/fleet/arr/library_total?server_id=X&app=X — *arr library total.

    Mirrors the library count endpoint, generalised to any *arr app.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _arr_client(server, app)
        return await client.get_library_total()
    except (ValueError, ArrError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.post("/arr/refresh_series")
async def arr_refresh_series(
    request: Request, server_id: str, app: str, artist_id: str
) -> Any:
    """POST /api/fleet/arr/refresh_series?server_id=X&app=X&artist_id=X.

    Mirrors the ``lidarr_refresh_artist`` command, generalised to any *arr app.
    Requires scope=write (enforced by the create_app middleware).
    """
    if not isinstance(server_id, str) or not server_id.strip():
        raise ValueError("field 'server_id' is required")
    if not isinstance(app, str) or not app.strip():
        raise ValueError("field 'app' is required")
    if not isinstance(artist_id, str) or not artist_id.strip():
        raise ValueError("field 'artist_id' is required")
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _arr_client(server, app)
        await client.refresh_series(int(artist_id))
    except (ValueError, ArrError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)
    return {"status": "refreshed", "artist_id": artist_id}


@router.post("/arr/search_missing")
async def arr_search_missing(
    request: Request, server_id: str, app: str, artist_id: str
) -> Any:
    """POST /api/fleet/arr/search_missing?server_id=X&app=X&artist_id=X.

    Mirrors the ``lidarr_search_missing`` command, generalised to any *arr app.
    Requires scope=write (enforced by the create_app middleware).
    """
    if not isinstance(server_id, str) or not server_id.strip():
        raise ValueError("field 'server_id' is required")
    if not isinstance(app, str) or not app.strip():
        raise ValueError("field 'app' is required")
    if not isinstance(artist_id, str) or not artist_id.strip():
        raise ValueError("field 'artist_id' is required")
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _arr_client(server, app)
        await client.search_missing(int(artist_id))
    except (ValueError, ArrError, httpx.HTTPError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)
    return {"status": "searching", "artist_id": artist_id}


# ---------------------------------------------------------------------------
# P11: MeshCentral — device list, device status, execute batch, terminal /
# file-manager URLs, enrollment info, sync to servers.json, fleet stats over
# SSH meshctrl to the Unraid host
# ---------------------------------------------------------------------------


def _meshcentral_client(server: ServerConfig) -> RealMeshCentralClient:
    """Build a RealMeshCentralClient from a server's service_keys."""
    keys = server.service_keys
    server_url = keys.meshcentral_url if keys else None
    admin_user = keys.meshcentral_admin_user if keys else None
    admin_pass = keys.meshcentral_admin_pass if keys else None
    group_id = keys.meshcentral_group_id if keys else None
    if not server_url or not server_url.strip():
        raise ValueError("meshcentral_url not configured")
    config = MeshCentralConfig(
        server_url=server_url,
        admin_user=admin_user or "",
        admin_pass=admin_pass or "",
        group_id=group_id or "",
    )
    return RealMeshCentralClient(config=config, ssh=SshHelper.from_config(server))


def _meshcentral_batch_payload(body: Any) -> tuple[str, list[str], list[dict]] | JSONResponse:
    """Validate an execute_batch body: {server_id, device_ids, commands}."""
    if not isinstance(body, dict) or not body:
        return JSONResponse(
            {"detail": "body must be a non-empty object"}, status_code=422
        )
    server_id = body.get("server_id")
    device_ids = body.get("device_ids")
    commands = body.get("commands")
    if not isinstance(server_id, str) or not server_id.strip():
        return JSONResponse(
            {"detail": "field 'server_id' is required"}, status_code=422
        )
    if not isinstance(device_ids, list) or not all(isinstance(d, str) for d in device_ids):
        return JSONResponse(
            {"detail": "field 'device_ids' must be a list of strings"}, status_code=422
        )
    if not isinstance(commands, list) or not all(
        isinstance(c, dict) and "command" in c and isinstance(c["command"], str)
        for c in commands
    ):
        return JSONResponse(
            {"detail": "field 'commands' must be a list of {command: str} objects"},
            status_code=422,
        )
    return server_id, device_ids, commands


@router.get("/meshcentral/list_devices")
async def meshcentral_list_devices(request: Request, server_id: str) -> Any:
    """GET /api/fleet/meshcentral/list_devices?server_id=X — list MeshCentral devices.

    Mirrors the ``meshcentral_list_devices`` command over SSH meshctrl.
    A failed probe returns a redacted 502.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _meshcentral_client(server)
        devices = await client.list_devices()
        return [
            {
                "id": d.id,
                "name": d.name,
                "group": d.group,
                "conn": d.conn,
                "pwr": d.pwr,
                "platform": d.platform,
                "ip": d.ip,
                "last_connect": d.last_connect,
            }
            for d in devices
        ]
    except (ValueError, MeshCentralError, SshCommandError, TransportError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/meshcentral/get_device_status")
async def meshcentral_get_device_status(
    request: Request, server_id: str, device_id: str
) -> Any:
    """GET /api/fleet/meshcentral/get_device_status?server_id=X&device_id=X.

    Mirrors the ``meshcentral_get_device_status`` command.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _meshcentral_client(server)
        return await client.get_device_status(device_id)
    except (ValueError, MeshCentralError, SshCommandError, TransportError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.post("/meshcentral/execute_batch")
async def meshcentral_execute_batch(
    request: Request,
    body: dict,
    _readonly: None = Depends(require_fleet_write),
) -> Any:
    """POST /api/fleet/meshcentral/execute_batch — run commands on devices.

    Body: {server_id, device_ids: [str], commands: [{command: str, args?: [str]}]}.
    Requires scope=write (enforced by the create_app middleware).
    Mirrors the ``meshcentral_execute_batch`` command.
    """
    validated = _meshcentral_batch_payload(body)
    if isinstance(validated, JSONResponse):
        return validated
    server_id, device_ids, commands = validated
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _meshcentral_client(server)
        batch_cmds = [BatchCommand(command=c["command"], args=c.get("args")) for c in commands]
        results = await client.execute_batch(device_ids, batch_cmds)
        return [
            {
                "device_id": r.device_id,
                "success": r.success,
                "output": r.output,
                "error": r.error,
            }
            for r in results
        ]
    except (ValueError, MeshCentralError, SshCommandError, TransportError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/meshcentral/get_terminal_url")
async def meshcentral_get_terminal_url(
    request: Request, server_id: str, device_id: str
) -> Any:
    """GET /api/fleet/meshcentral/get_terminal_url?server_id=X&device_id=X.

    Mirrors the ``meshcentral_get_terminal_url`` command. No network —
    builds the MeshCentral web terminal URL from the configured server_url.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _meshcentral_client(server)
        return JSONResponse(client.get_terminal_url(device_id))
    except (ValueError, MeshCentralError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/meshcentral/get_file_manager_url")
async def meshcentral_get_file_manager_url(
    request: Request, server_id: str, device_id: str
) -> Any:
    """GET /api/fleet/meshcentral/get_file_manager_url?server_id=X&device_id=X.

    Mirrors the ``meshcentral_get_file_manager_url`` command. No network —
    builds the MeshCentral file manager URL from the configured server_url.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _meshcentral_client(server)
        return JSONResponse(client.get_file_manager_url(device_id))
    except (ValueError, MeshCentralError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/meshcentral/get_enrollment_info")
async def meshcentral_get_enrollment_info(
    request: Request, server_id: str, device_type: str
) -> Any:
    """GET /api/fleet/meshcentral/get_enrollment_info?server_id=X&device_type=X.

    Mirrors the ``meshcentral_get_enrollment_info`` command. No network —
    generates agent install commands from the configured server_url and group_id.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _meshcentral_client(server)
        info = client.get_enrollment_info(device_type)
        return {
            "agent_url": info.agent_url,
            "settings_url": info.settings_url,
            "group_id": info.group_id,
            "install_command_linux": info.install_command_linux,
            "install_command_windows": info.install_command_windows,
        }
    except (ValueError, MeshCentralError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.post("/meshcentral/sync_fleet")
async def meshcentral_sync_fleet(request: Request, body: dict) -> Any:
    """POST /api/fleet/meshcentral/sync_fleet — sync MeshCentral inventory to servers.json.

    Body: {server_id}. Requires scope=write (enforced by the create_app
    middleware). Mirrors the ``meshcentral_sync_fleet`` command.
    """
    if not isinstance(body, dict) or not body:
        return JSONResponse(
            {"detail": "body must be a non-empty object"}, status_code=422
        )
    server_id = body.get("server_id")
    if not isinstance(server_id, str) or not server_id.strip():
        return JSONResponse(
            {"detail": "field 'server_id' is required"}, status_code=422
        )
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _meshcentral_client(server)
        servers = load_servers()
        result = await client.sync_to_servers_json(servers)
        save_servers(servers)
        return {
            "devices_found": result.devices_found,
            "devices_matched": result.devices_matched,
            "devices_new": result.devices_new,
            "devices_updated": result.devices_updated,
            "errors": result.errors,
        }
    except (ValueError, MeshCentralError, SshCommandError, TransportError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/meshcentral/get_fleet_stats")
async def meshcentral_get_fleet_stats(request: Request, server_id: str) -> Any:
    """GET /api/fleet/meshcentral/get_fleet_stats?server_id=X — MeshCentral fleet stats.

    Mirrors the ``meshcentral_get_fleet_stats`` command.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _meshcentral_client(server)
        return await client.get_fleet_stats()
    except (ValueError, MeshCentralError, SshCommandError, TransportError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


# ---------------------------------------------------------------------------
# P12: remote shell, file listing, and process list over mesh or SSH
# ---------------------------------------------------------------------------


def _remote_client(server: ServerConfig) -> RealRemoteClient:
    """Build a RealRemoteClient from a server config (SSH + optional mesh)."""
    return RealRemoteClient(server=server, ssh=SshHelper.from_config(server))


def _remote_shell_payload(body: Any) -> tuple[str, str, int] | JSONResponse:
    """Validate a shell_exec body: {server_id, command, timeout_secs?}."""
    if not isinstance(body, dict) or not body:
        return JSONResponse(
            {"detail": "body must be a non-empty object"}, status_code=422
        )
    server_id = body.get("server_id")
    command = body.get("command")
    timeout_secs = body.get("timeout_secs", 60)
    if not isinstance(server_id, str) or not server_id.strip():
        return JSONResponse(
            {"detail": "field 'server_id' is required"}, status_code=422
        )
    if not isinstance(command, str) or not command.strip():
        return JSONResponse(
            {"detail": "field 'command' is required"}, status_code=422
        )
    if not isinstance(timeout_secs, int) or isinstance(timeout_secs, bool) or timeout_secs < 1:
        return JSONResponse(
            {"detail": "field 'timeout_secs' must be a positive integer"}, status_code=422
        )
    return server_id, command, timeout_secs


@router.post("/meshcentral/shell_exec")
async def meshcentral_shell_exec(
    request: Request,
    body: dict,
    _admin: str = Depends(require_admin),
    _readonly: None = Depends(require_fleet_write),
) -> Any:
    """POST /api/fleet/meshcentral/shell_exec — run a shell command on a device.

    Body: {server_id, command, timeout_secs?}. Requires scope=write (enforced
    by the create_app middleware) and admin identity (require_admin, T2).
    Mirrors the ``meshcentral_shell_exec`` command. A failed probe
    returns a redacted 502.
    """
    validated = _remote_shell_payload(body)
    if isinstance(validated, JSONResponse):
        return validated
    server_id, command, timeout_secs = validated
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _remote_client(server)
        result = await client.execute_shell(command, timeout_secs=timeout_secs)
        return {
            "device_id": result.device_id,
            "command": result.command,
            "exit_code": result.exit_code,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "success": result.success,
        }
    except (ValueError, RemoteError, SshCommandError, TransportError, OSError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/meshcentral/list_dir")
async def meshcentral_list_dir(
    request: Request,
    server_id: str,
    path: str,
    _admin: str = Depends(require_admin),
) -> Any:
    """GET /api/fleet/meshcentral/list_dir?server_id=X&path=X — list a remote dir.

    Mirrors the ``meshcentral_list_dir`` command. A failed probe returns
    a redacted 502. Requires admin identity (require_admin, T2).
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    if not isinstance(path, str) or not path.strip():
        return JSONResponse(
            {"detail": "field 'path' is required"}, status_code=422
        )
    try:
        client = _remote_client(server)
        files = await client.list_dir(path)
        return [
            {
                "path": f.path,
                "is_dir": f.is_dir,
                "size": f.size,
                "modified": f.modified,
                "permissions": f.permissions,
            }
            for f in files
        ]
    except (ValueError, RemoteError, SshCommandError, TransportError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/meshcentral/get_processes")
async def meshcentral_get_processes(
    request: Request,
    server_id: str,
    limit: str = "50",
    _admin: str = Depends(require_admin),
) -> Any:
    """GET /api/fleet/meshcentral/get_processes?server_id=X&limit=X — list procs.

    Mirrors the ``meshcentral_get_processes`` command. A failed probe
    returns a redacted 502. Requires admin identity (require_admin, T2).
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        limit_int = int(limit)
    except (TypeError, ValueError):
        return JSONResponse(
            {"detail": "limit must be an integer"}, status_code=422
        )
    if limit_int < 1:
        return JSONResponse(
            {"detail": "limit must be a positive integer"}, status_code=422
        )
    try:
        client = _remote_client(server)
        processes = await client.get_processes(limit_int)
        return [
            {
                "pid": p.pid,
                "name": p.name,
                "cpu_percent": p.cpu_percent,
                "memory_percent": p.memory_percent,
                "user": p.user,
                "command": p.command,
            }
            for p in processes
        ]
    except (ValueError, RemoteError, SshCommandError, TransportError) as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


# ---------------------------------------------------------------------------
# P13: alerts and metrics series — sqlite-backed store on the backend host.
# Host-local routes (no server_id): the store lives on the machine running
# the backend, like /api/fleet/local/stats. Identity enforcement (401 without
# a token, scope=write for POST) comes from create_app's middleware.
# ---------------------------------------------------------------------------

def _alerts_store() -> AlertsMetricsStore:
    """Build the alert/metric store (db path from KTS_ALERTS_DB or default)."""
    return AlertsMetricsStore()


def _alert_to_dict(alert: Alert) -> dict:
    return {
        "id": alert.id,
        "severity": alert.severity,
        "title": alert.title,
        "message": alert.message,
        "device_id": alert.device_id,
        "source": alert.source,
        "acknowledged": alert.acknowledged,
        "acknowledged_by": alert.acknowledged_by,
        "acknowledged_at": alert.acknowledged_at,
        "created_at": alert.created_at,
        "updated_at": alert.updated_at,
        "auto_ack_rule": alert.auto_ack_rule,
    }


def _alert_create_payload(body: Any) -> tuple[str, str, str, dict] | JSONResponse:
    """Validate an alert_create body: {severity, title, message, source?, device_id?, auto_ack_rule?}."""
    if not isinstance(body, dict) or not body:
        return JSONResponse(
            {"detail": "body must be a non-empty object"}, status_code=422
        )
    severity = body.get("severity")
    title = body.get("title")
    message = body.get("message")
    if severity not in ("critical", "warning", "info"):
        return JSONResponse(
            {"detail": "field 'severity' must be critical, warning or info"}, status_code=422
        )
    if not isinstance(title, str) or not title.strip():
        return JSONResponse(
            {"detail": "field 'title' is required"}, status_code=422
        )
    if not isinstance(message, str):
        return JSONResponse(
            {"detail": "field 'message' is required"}, status_code=422
        )
    return severity, title, message, body


@router.post("/alerts/create")
def alerts_create(request: Request, body: dict) -> Any:
    """POST /api/fleet/alerts/create — create a new alert.

    Mirrors the ``alert_create`` command. Requires scope=write
    (enforced by the create_app middleware).
    """
    validated = _alert_create_payload(body)
    if isinstance(validated, JSONResponse):
        return validated
    severity, title, message, raw = validated
    store = _alerts_store()
    alert = store.create(
        severity=severity,
        title=title,
        message=message,
        source=raw.get("source", "manual"),
        device_id=raw.get("device_id"),
        auto_ack_rule=raw.get("auto_ack_rule"),
    )
    return _alert_to_dict(alert)


@router.get("/alerts/list")
def alerts_list(request: Request) -> Any:
    """GET /api/fleet/alerts/list?severity=&device_id=&acknowledged=&since=&limit=&offset=.

    Mirrors the ``alert_list`` command. Returns alerts newest first.
    """
    f = AlertFilter(
        severity=request.query_params.get("severity") or None,
        device_id=request.query_params.get("device_id") or None,
        acknowledged=(
            request.query_params.get("acknowledged") == "true"
            if request.query_params.get("acknowledged") is not None
            else None
        ),
        since=request.query_params.get("since") or None,
        limit=_positive_int(request.query_params.get("limit"), "limit"),
        offset=_positive_int(request.query_params.get("offset"), "offset"),
    )
    if isinstance(f.limit, JSONResponse) or isinstance(f.offset, JSONResponse):
        return f.limit if isinstance(f.limit, JSONResponse) else f.offset
    store = _alerts_store()
    return [_alert_to_dict(a) for a in store.list(f)]


@router.get("/alerts/get")
def alerts_get(request: Request) -> Any:
    """GET /api/fleet/alerts/get?id=X — return one alert by id, or 404."""
    alert_id = request.query_params.get("id")
    if not alert_id or not alert_id.isdigit():
        return JSONResponse(
            {"detail": "field 'id' is required"}, status_code=422
        )
    store = _alerts_store()
    alert = store.get(int(alert_id))
    if alert is None:
        return JSONResponse(
            {"detail": f"alert {alert_id} not found"}, status_code=404
        )
    return _alert_to_dict(alert)


def _alert_ack_payload(body: Any) -> tuple[int, str] | JSONResponse:
    """Validate an acknowledge body: {id, acknowledged_by}."""
    if not isinstance(body, dict) or not body:
        return JSONResponse(
            {"detail": "body must be a non-empty object"}, status_code=422
        )
    alert_id = body.get("id")
    acknowledged_by = body.get("acknowledged_by")
    if not isinstance(alert_id, int) or isinstance(alert_id, bool) or alert_id < 1:
        return JSONResponse(
            {"detail": "field 'id' must be a positive integer"}, status_code=422
        )
    if not isinstance(acknowledged_by, str) or not acknowledged_by.strip():
        return JSONResponse(
            {"detail": "field 'acknowledged_by' is required"}, status_code=422
        )
    return alert_id, acknowledged_by


@router.post("/alerts/acknowledge")
def alerts_acknowledge(request: Request, body: dict) -> Any:
    """POST /api/fleet/alerts/acknowledge — acknowledge one alert."""
    validated = _alert_ack_payload(body)
    if isinstance(validated, JSONResponse):
        return validated
    alert_id, acknowledged_by = validated
    store = _alerts_store()
    alert = store.acknowledge(alert_id, acknowledged_by)
    if alert is None:
        return JSONResponse(
            {"detail": f"alert {alert_id} not found"}, status_code=404
        )
    return _alert_to_dict(alert)


@router.post("/alerts/acknowledge_all")
def alerts_acknowledge_all(request: Request, body: dict) -> Any:
    """POST /api/fleet/alerts/acknowledge_all — acknowledge all unacknowledged alerts.

    Body: {device_id?, acknowledged_by}. Returns the number acknowledged.
    """
    if not isinstance(body, dict) or not body:
        return JSONResponse(
            {"detail": "body must be a non-empty object"}, status_code=422
        )
    device_id = body.get("device_id")
    acknowledged_by = body.get("acknowledged_by", "user")
    if device_id is not None and not isinstance(device_id, str):
        return JSONResponse(
            {"detail": "field 'device_id' must be a string"}, status_code=422
        )
    if not isinstance(acknowledged_by, str) or not acknowledged_by.strip():
        return JSONResponse(
            {"detail": "field 'acknowledged_by' is required"}, status_code=422
        )
    store = _alerts_store()
    count = store.acknowledge_all(
        device_id=device_id or None, acknowledged_by=acknowledged_by
    )
    return {"acknowledged": count}


@router.post("/alerts/delete")
def alerts_delete(request: Request, body: dict) -> Any:
    """POST /api/fleet/alerts/delete — delete one alert by id. Body: {id}."""
    if not isinstance(body, dict) or not body:
        return JSONResponse(
            {"detail": "body must be a non-empty object"}, status_code=422
        )
    alert_id = body.get("id")
    if not isinstance(alert_id, int) or isinstance(alert_id, bool) or alert_id < 1:
        return JSONResponse(
            {"detail": "field 'id' must be a positive integer"}, status_code=422
        )
    store = _alerts_store()
    if not store.delete(alert_id):
        return JSONResponse(
            {"detail": f"alert {alert_id} not found"}, status_code=404
        )
    return {"deleted": True}


@router.post("/alerts/auto_ack_run")
def alerts_auto_ack_run(request: Request, body: dict) -> Any:
    """POST /api/fleet/alerts/auto_ack_run — run auto-acknowledgment rules.

    Current rule: acknowledge unacknowledged info alerts older than one hour.
    Returns the number acknowledged. Takes an empty body {}.
    """
    if not isinstance(body, dict):
        return JSONResponse(
            {"detail": "body must be a JSON object"}, status_code=422
        )
    store = _alerts_store()
    return {"acknowledged": store.auto_ack_run()}


def _positive_int(value: str | None, field: str) -> int | JSONResponse:
    """Parse a positive integer query param; None when absent."""
    if value is None:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return JSONResponse(
            {"detail": f"field '{field}' must be an integer"}, status_code=422
        )
    if parsed < 1:
        return JSONResponse(
            {"detail": f"field '{field}' must be a positive integer"}, status_code=422
        )
    return parsed


@router.post("/metrics/record")
def metrics_record(request: Request, body: dict) -> Any:
    """POST /api/fleet/metrics/record — record one metric sample.

    Mirrors the ``metric_record`` command. Body: {device_id, metric, value}.
    """
    if not isinstance(body, dict) or not body:
        return JSONResponse(
            {"detail": "body must be a non-empty object"}, status_code=422
        )
    device_id = body.get("device_id")
    metric = body.get("metric")
    value = body.get("value")
    if not isinstance(device_id, str) or not device_id.strip():
        return JSONResponse(
            {"detail": "field 'device_id' is required"}, status_code=422
        )
    if not isinstance(metric, str) or not metric.strip():
        return JSONResponse(
            {"detail": "field 'metric' is required"}, status_code=422
        )
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return JSONResponse(
            {"detail": "field 'value' must be a number"}, status_code=422
        )
    store = _alerts_store()
    store.record(device_id=device_id, metric=metric, value=value)
    return {"ok": True}


@router.get("/metrics/query")
def metrics_query(request: Request) -> Any:
    """GET /api/fleet/metrics/query?device_id=&metric=&from=&to=&limit=.

    Mirrors the ``metric_query`` command.
    """
    device_id = request.query_params.get("device_id")
    metric = request.query_params.get("metric")
    from_ = request.query_params.get("from")
    if not device_id or not metric or not from_:
        return JSONResponse(
            {"detail": "fields 'device_id', 'metric' and 'from' are required"},
            status_code=422,
        )
    limit = _positive_int(request.query_params.get("limit"), "limit")
    if isinstance(limit, JSONResponse):
        return limit
    store = _alerts_store()
    points = store.query(
        device_id=device_id, metric=metric, from_=from_,
        to=request.query_params.get("to") or None, limit=limit or 1000,
    )
    return [{"timestamp": p.timestamp, "value": p.value} for p in points]


@router.get("/metrics/query_multi")
def metrics_query_multi(request: Request) -> Any:
    """GET /api/fleet/metrics/query_multi — multiple device/metric series.

    Query params (repeatable): device_ids, metrics. Plus from and optional to.
    Mirrors the ``metric_query_multi`` command.
    """
    device_ids = request.query_params.getlist("device_ids")
    metrics = request.query_params.getlist("metrics")
    from_ = request.query_params.get("from")
    if not device_ids or not metrics or not from_:
        return JSONResponse(
            {"detail": "fields 'device_ids', 'metrics' and 'from' are required"},
            status_code=422,
        )
    store = _alerts_store()
    series = store.query_multi(
        device_ids=device_ids, metrics=metrics, from_=from_,
        to=request.query_params.get("to") or None,
    )
    return [
        {"metric": s.metric, "device_id": s.device_id,
         "points": [{"timestamp": p.timestamp, "value": p.value} for p in s.points]}
        for s in series
    ]


@router.post("/metrics/collect_all")
def metrics_collect_all(request: Request, body: dict) -> Any:
    """POST /api/fleet/metrics/collect_all — run all metric collectors.

    Mirrors the ``metric_collect_all`` command. No collectors are
    registered yet, so this returns 0 recorded. Takes an empty body {}.
    """
    if not isinstance(body, dict):
        return JSONResponse(
            {"detail": "body must be a JSON object"}, status_code=422
        )
    store = _alerts_store()
    return {"recorded": store.collect_all()}


# ---------------------------------------------------------------------------
# P14: phone (ADB) and KDE Connect — host-local, feature-flagged.
# These run adb/gdbus directly on the backend host (no SSH). When the
# binary is missing the route reports a clean 503 instead of crashing.
# ---------------------------------------------------------------------------


def _phone_unavailable(exc: Exception, server: ServerConfig) -> JSONResponse:
    message = redact_error(f"phone unavailable: {exc}", _secrets(server))
    return JSONResponse({"detail": message}, status_code=503)


@router.get("/phone/device_info")
async def phone_device_info(request: Request, server_id: str) -> Any:
    """GET /api/fleet/phone/device_info?server_id=X — phone device info.

    Mirrors the ``get_phone_device_info`` command. Host-local over ADB.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _phone_client(server)
        return asdict(await client.get_device_info())
    except ValueError as exc:
        return JSONResponse({"detail": redact_error(str(exc), _secrets(server))}, status_code=422)
    except PhoneUnavailableError as exc:
        return _phone_unavailable(exc, server)
    except PhoneError as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/phone/battery")
async def phone_battery(request: Request, server_id: str) -> Any:
    """GET /api/fleet/phone/battery?server_id=X — phone battery state.

    Mirrors the ``get_phone_battery`` command. Host-local over ADB.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _phone_client(server)
        return asdict(await client.get_battery())
    except ValueError as exc:
        return JSONResponse({"detail": redact_error(str(exc), _secrets(server))}, status_code=422)
    except PhoneUnavailableError as exc:
        return _phone_unavailable(exc, server)
    except PhoneError as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/phone/storage")
async def phone_storage(request: Request, server_id: str) -> Any:
    """GET /api/fleet/phone/storage?server_id=X — phone storage.

    Mirrors the ``get_phone_storage`` command. Host-local over ADB.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _phone_client(server)
        return asdict(await client.get_storage())
    except ValueError as exc:
        return JSONResponse({"detail": redact_error(str(exc), _secrets(server))}, status_code=422)
    except PhoneUnavailableError as exc:
        return _phone_unavailable(exc, server)
    except PhoneError as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/phone/memory")
async def phone_memory(request: Request, server_id: str) -> Any:
    """GET /api/fleet/phone/memory?server_id=X — phone memory.

    Mirrors the ``get_phone_memory`` command. Host-local over ADB.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _phone_client(server)
        return asdict(await client.get_memory())
    except ValueError as exc:
        return JSONResponse({"detail": redact_error(str(exc), _secrets(server))}, status_code=422)
    except PhoneUnavailableError as exc:
        return _phone_unavailable(exc, server)
    except PhoneError as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


def _kdeconnect_unavailable(exc: Exception, server: ServerConfig) -> JSONResponse:
    message = redact_error(f"kdeconnect unavailable: {exc}", _secrets(server))
    return JSONResponse({"detail": message}, status_code=503)


@router.get("/kdeconnect/battery")
async def kdeconnect_battery(request: Request, server_id: str) -> Any:
    """GET /api/fleet/kdeconnect/battery?server_id=X — KDE Connect battery.

    Mirrors the ``get_kdeconnect_battery`` command. Host-local over gdbus.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _kdeconnect_client(server)
        return asdict(await client.get_battery())
    except ValueError as exc:
        return JSONResponse({"detail": redact_error(str(exc), _secrets(server))}, status_code=422)
    except KdeConnectUnavailableError as exc:
        return _kdeconnect_unavailable(exc, server)
    except KdeConnectError as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/kdeconnect/connectivity")
async def kdeconnect_connectivity(request: Request, server_id: str) -> Any:
    """GET /api/fleet/kdeconnect/connectivity?server_id=X — connectivity report.

    Mirrors the ``get_kdeconnect_connectivity`` command. Host-local over gdbus.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _kdeconnect_client(server)
        return asdict(await client.get_connectivity())
    except ValueError as exc:
        return JSONResponse({"detail": redact_error(str(exc), _secrets(server))}, status_code=422)
    except KdeConnectUnavailableError as exc:
        return _kdeconnect_unavailable(exc, server)
    except KdeConnectError as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)


@router.get("/kdeconnect/list_devices")
async def kdeconnect_list_devices(request: Request, server_id: str) -> Any:
    """GET /api/fleet/kdeconnect/list_devices?server_id=X — paired device list.

    Mirrors the ``kdeconnect_list_devices`` command. Host-local over gdbus.
    """
    server = _find_server(server_id)
    if server is None:
        return JSONResponse(
            {"detail": f"server {server_id!r} not found"}, status_code=404
        )
    try:
        client = _kdeconnect_client(server)
        return await client.list_devices()
    except ValueError as exc:
        return JSONResponse({"detail": redact_error(str(exc), _secrets(server))}, status_code=422)
    except KdeConnectUnavailableError as exc:
        return _kdeconnect_unavailable(exc, server)
    except KdeConnectError as exc:
        return _probe_error(exc, server)
    except Exception as exc:  # pragma: no cover — secrets must never leak
        return _probe_error(exc, server)
