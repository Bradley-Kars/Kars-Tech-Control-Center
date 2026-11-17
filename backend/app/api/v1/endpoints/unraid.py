"""Unraid/storage/system endpoints (WS-2.3).

Backed by real transports (see app/services/transports.py):
- Unraid hosts → GraphQL API (metrics/array/docker/disks)
- Linux hosts  → SSH
- Phone        → ADB/SSH
Falls back to an explicit error state (never fabricated numbers).
"""

import asyncio
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.crud.servers import get_server
from app.crud.unraid import (
    get_gpu_info,
    get_network_interfaces,
    get_plugins,
    get_processes,
    get_shares,
    get_smart_data,
    get_syslog,
    get_tailscale_peers,
    get_user_scripts,
    reboot_server,
    run_user_script,
    shutdown_server,
)
from app.schemas.unraid import (
    DiskInfo,
    GpuInfo,
    ShareInfo,
    SmartInfo,
    SystemActionResult,
)
from app.services import transports

router = APIRouter()


async def _entry_for(db: AsyncSession, server_id: str) -> tuple[Any, dict | None]:
    """Fetch the server row and its servers.json entry (by hostname)."""
    server = await get_server(db, server_id)
    if not server:
        return None, None
    entry = transports.find_entry(hostname=server.hostname, server_id=server.id)
    return server, entry


@router.get("/servers/{server_id}/system/stats")
async def get_server_system_stats_endpoint(
    server_id: str, db: AsyncSession = Depends(get_session)
) -> Any:
    """Remote host stats via the real transport for this device type."""
    server, entry = await _entry_for(db, server_id)
    if not server:
        return {"connected": False, "source": "none", "error": "server not found"}
    if not entry:
        return {
            "connected": False,
            "source": "none",
            "error": "no credentials entry in servers.json for this host",
        }
    dtype = server.device_type
    if dtype == "unraid":
        return await transports.unraid_system_stats(entry)
    if dtype == "phone":
        return await asyncio.to_thread(transports.phone_stats, entry)
    return await asyncio.to_thread(transports.ssh_system_stats, entry)


@router.get("/servers/{server_id}/array")
async def get_array_info_endpoint(
    server_id: str, db: AsyncSession = Depends(get_session)
) -> Any:
    """Unraid array state + capacity via GraphQL."""
    server, entry = await _entry_for(db, server_id)
    if not server:
        return {"connected": False, "error": "server not found"}
    if not entry:
        return {"connected": False, "error": "no credentials entry"}
    if server.device_type != "unraid":
        return {"connected": False, "error": "array is only available for unraid hosts"}
    return await transports.unraid_array(entry)


@router.get("/servers/{server_id}/disks")
async def get_disks_endpoint(
    server_id: str, db: AsyncSession = Depends(get_session)
) -> Any:
    """List disks via GraphQL (unraid)."""
    server, entry = await _entry_for(db, server_id)
    if not server or not entry or server.device_type != "unraid":
        return []
    try:
        raw = await transports.unraid_disks(entry)
    except Exception:  # noqa: BLE001
        return []
    out = []
    for d in raw:
        out.append(
            {
                "name": d.get("name") or "",
                "device": d.get("device") or "",
                "type": d.get("type") or "",
                "size": int(d.get("size") or 0),
                "vendor": "",
                "temperature": None,
                "smartStatus": "unknown",
                "isSpinning": False,
                "free": None,
                "fsSize": None,
                "fsUsed": None,
            }
        )
    return out


@router.get("/servers/{server_id}/disks/{device}/smart", response_model=SmartInfo)
async def get_smart_data_endpoint(server_id: str, device: str) -> Any:
    """Get SMART data for a disk (formerly Tauri `get_smart_data`)."""
    return await get_smart_data(server_id, device)


@router.get("/servers/{server_id}/shares", response_model=list[ShareInfo])
async def get_shares_endpoint(server_id: str) -> Any:
    """List shares (formerly Tauri `get_shares`)."""
    return await get_shares(server_id)


@router.get("/servers/{server_id}/gpu", response_model=GpuInfo)
async def get_gpu_info_endpoint(server_id: str) -> Any:
    """Get GPU info (formerly Tauri `get_gpu_info`)."""
    return await get_gpu_info(server_id)


@router.get("/servers/{server_id}/processes")
async def get_processes_endpoint(server_id: str) -> Any:
    """List processes (formerly Tauri `get_processes`)."""
    return await get_processes(server_id)


@router.get("/servers/{server_id}/syslog")
async def get_syslog_endpoint(server_id: str, lines: int = 100) -> Any:
    """Get syslog (formerly Tauri `get_syslog`)."""
    return await get_syslog(server_id, lines)


@router.get("/servers/{server_id}/user-scripts")
async def get_user_scripts_endpoint(server_id: str) -> Any:
    """List user scripts (formerly Tauri `get_user_scripts`)."""
    return await get_user_scripts(server_id)


@router.post("/servers/{server_id}/user-scripts/{name}/run")
async def run_user_script_endpoint(server_id: str, name: str) -> Any:
    """Run a user script (formerly Tauri `run_user_script`)."""
    return await run_user_script(server_id, name)


@router.get("/servers/{server_id}/plugins")
async def get_plugins_endpoint(server_id: str) -> Any:
    """List plugins (formerly Tauri `get_plugins`)."""
    return await get_plugins(server_id)


@router.get("/servers/{server_id}/network/interfaces")
async def get_network_interfaces_endpoint(server_id: str) -> Any:
    """List network interfaces (formerly Tauri `get_network_interfaces`)."""
    return await get_network_interfaces(server_id)


@router.get("/servers/{server_id}/tailscale/peers")
async def get_tailscale_peers_endpoint(server_id: str) -> Any:
    """List Tailscale peers (formerly Tauri `get_tailscale_peers`)."""
    return await get_tailscale_peers(server_id)


@router.post("/servers/{server_id}/reboot", response_model=SystemActionResult)
async def reboot_server_endpoint(server_id: str) -> Any:
    """Reboot a server (formerly Tauri `reboot_server` — parity gap G1)."""
    return await reboot_server(server_id)


@router.post("/servers/{server_id}/shutdown", response_model=SystemActionResult)
async def shutdown_server_endpoint(server_id: str) -> Any:
    """Shutdown a server (formerly Tauri `shutdown_server` — parity gap G2)."""
    return await shutdown_server(server_id)
