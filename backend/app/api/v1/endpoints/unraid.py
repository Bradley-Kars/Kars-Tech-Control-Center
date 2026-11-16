"""Unraid/storage/system endpoints (WS-2.3).

GET /servers/{id}/disks, /disks/{device}/smart, /shares, /array, /gpu,
/processes, /syslog, /user-scripts, /plugins, /network/interfaces,
/tailscale/peers
POST /servers/{id}/reboot, /shutdown, /user-scripts/{name}/run
"""

from typing import Any

from fastapi import APIRouter

from app.crud.unraid import (
    get_array_info,
    get_disks,
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

router = APIRouter()


@router.get("/servers/{server_id}/disks", response_model=list[DiskInfo])
async def get_disks_endpoint(server_id: str) -> Any:
    """List disks (formerly Tauri `get_disks`)."""
    return await get_disks(server_id)


@router.get("/servers/{server_id}/disks/{device}/smart", response_model=SmartInfo)
async def get_smart_data_endpoint(server_id: str, device: str) -> Any:
    """Get SMART data for a disk (formerly Tauri `get_smart_data`)."""
    return await get_smart_data(server_id, device)


@router.get("/servers/{server_id}/shares", response_model=list[ShareInfo])
async def get_shares_endpoint(server_id: str) -> Any:
    """List shares (formerly Tauri `get_shares`)."""
    return await get_shares(server_id)


@router.get("/servers/{server_id}/array")
async def get_array_info_endpoint(server_id: str) -> Any:
    """Get array info (formerly Tauri `get_array_info`)."""
    return await get_array_info(server_id)


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
