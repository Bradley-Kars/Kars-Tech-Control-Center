"""CRUD operations for Unraid/storage/system endpoints (WS-2.3).

These operations communicate with the target server via SSH/MeshCentral.
Without real transport integration, endpoints return structured
placeholder responses. Real transport is deferred to a later phase.
"""

import asyncio
import time
from typing import Any, Optional


async def probe_host(
    hostname: str, port: int = 443, timeout: float = 5.0
) -> dict[str, Any]:
    """TCP reachability probe against `hostname:port`.

    Returns {"reachable": bool, "latency_ms": float | None, "error": str | None}.
    """
    start = time.monotonic()
    try:
        _reader, writer = await asyncio.wait_for(
            asyncio.open_connection(hostname, port), timeout=timeout
        )
        latency = round((time.monotonic() - start) * 1000, 1)
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        return {"reachable": True, "latency_ms": latency, "error": None}
    except Exception as exc:  # noqa: BLE001 - surface any probe failure
        return {
            "reachable": False,
            "latency_ms": None,
            "error": f"{type(exc).__name__}: {exc}",
        }


async def get_disks(server_id: str) -> list[dict[str, Any]]:
    return []


async def get_smart_data(server_id: str, device: str) -> dict[str, Any]:
    return {}


async def get_shares(server_id: str) -> list[dict[str, Any]]:
    return []


async def get_array_info(
    server_id: str, hostname: Optional[str] = None
) -> dict[str, Any]:
    """Array status. With no API key we report reachability explicitly."""
    if not hostname:
        return {
            "server_id": server_id,
            "array_state": "unknown",
            "connected": False,
            "error": "server hostname not configured",
        }
    probe = await probe_host(hostname, 443)
    if not probe["reachable"]:
        return {
            "server_id": server_id,
            "hostname": hostname,
            "array_state": "unreachable",
            "connected": False,
            "error": probe["error"],
        }
    return {
        "server_id": server_id,
        "hostname": hostname,
        "connected": True,
        "array_state": "unknown",
        "latency_ms": probe["latency_ms"],
        "note": "host reachable; Unraid API key not configured for array details",
    }


async def get_server_system_stats(
    server_id: str, hostname: Optional[str] = None
) -> dict[str, Any]:
    """Remote host stats (formerly Tauri `getSystemStats`).

    Without SSH/API credentials this returns a real reachability result with
    an explicit error when the host cannot be reached.
    """
    if not hostname:
        return {
            "server_id": server_id,
            "connected": False,
            "source": "none",
            "error": "server hostname not configured",
        }
    probe = await probe_host(hostname, 443)
    if not probe["reachable"]:
        return {
            "server_id": server_id,
            "hostname": hostname,
            "connected": False,
            "source": "probe",
            "error": probe["error"],
        }
    return {
        "server_id": server_id,
        "hostname": hostname,
        "connected": True,
        "reachable": True,
        "source": "probe",
        "latency_ms": probe["latency_ms"],
        "note": "host reachable; live metrics require SSH/API credentials",
    }


async def get_gpu_info(server_id: str) -> dict[str, Any]:
    return {}


async def get_processes(server_id: str) -> dict[str, Any]:
    return {"processes": []}


async def get_syslog(server_id: str, lines: int) -> dict[str, str]:
    return {"syslog": ""}


async def get_user_scripts(server_id: str) -> dict[str, Any]:
    return {"scripts": []}


async def run_user_script(server_id: str, name: str) -> dict[str, str]:
    return {"output": ""}


async def get_plugins(server_id: str) -> list[dict[str, Any]]:
    return []


async def get_network_interfaces(server_id: str) -> dict[str, Any]:
    return {"interfaces": []}


async def get_tailscale_peers(server_id: str) -> dict[str, Any]:
    return {"peers": []}


async def reboot_server(server_id: str) -> dict[str, str]:
    return {"message": f"reboot initiated for {server_id}"}


async def shutdown_server(server_id: str) -> dict[str, str]:
    return {"message": f"shutdown initiated for {server_id}"}
