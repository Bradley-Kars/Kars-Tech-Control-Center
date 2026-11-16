"""Steam Deck endpoints (WS-2.11).

GET/POST /steamdeck/{id}/* (stats, battery, thermal, disk, network, gpu,
rustdesk, deskflow, provision, agent)
"""

from typing import Any

from fastapi import APIRouter

from app.crud.steamdeck import (
    ally_launch_agent,
    ally_provision,
    steamdeck_get_battery,
    steamdeck_get_deskflow_status,
    steamdeck_get_disk,
    steamdeck_get_gpu,
    steamdeck_get_network,
    steamdeck_get_system_stats,
    steamdeck_get_thermal,
    steamdeck_launch_rustdesk,
)
from app.schemas.steamdeck import (
    DeskflowStatus,
    MeshSystemStats,
    SteamDeckActionResult,
)

router = APIRouter()


@router.get("/steamdeck/{device_id}/stats", response_model=MeshSystemStats)
async def steamdeck_get_system_stats_endpoint(device_id: str) -> Any:
    """Get Steam Deck system stats (formerly Tauri `steamdeckGetSystemStats`)."""
    return await steamdeck_get_system_stats(device_id)


@router.get("/steamdeck/{device_id}/battery")
async def steamdeck_get_battery_endpoint(device_id: str) -> Any:
    """Get Steam Deck battery (formerly Tauri `steamdeckGetBattery`)."""
    return await steamdeck_get_battery(device_id)


@router.get("/steamdeck/{device_id}/thermal")
async def steamdeck_get_thermal_endpoint(device_id: str) -> Any:
    """Get Steam Deck thermal (formerly Tauri `steamdeckGetThermal`)."""
    return await steamdeck_get_thermal(device_id)


@router.get("/steamdeck/{device_id}/disk")
async def steamdeck_get_disk_endpoint(device_id: str) -> Any:
    """Get Steam Deck disk (formerly Tauri `steamdeckGetDisk`)."""
    return await steamdeck_get_disk(device_id)


@router.get("/steamdeck/{device_id}/network")
async def steamdeck_get_network_endpoint(device_id: str) -> Any:
    """Get Steam Deck network (formerly Tauri `steamdeckGetNetwork`)."""
    return await steamdeck_get_network(device_id)


@router.get("/steamdeck/{device_id}/gpu")
async def steamdeck_get_gpu_endpoint(device_id: str) -> Any:
    """Get Steam Deck GPU (formerly Tauri `steamdeckGetGpu`)."""
    return await steamdeck_get_gpu(device_id)


@router.post("/steamdeck/{device_id}/rustdesk/launch", response_model=SteamDeckActionResult)
async def steamdeck_launch_rustdesk_endpoint(device_id: str) -> Any:
    """Launch RustDesk on Steam Deck (formerly Tauri `steamdeckLaunchRustdesk`)."""
    return await steamdeck_launch_rustdesk(device_id)


@router.get("/steamdeck/{device_id}/deskflow", response_model=DeskflowStatus)
async def steamdeck_get_deskflow_status_endpoint(device_id: str) -> Any:
    """Get Steam Deck Deskflow status (formerly Tauri `steamdeckGetDeskflowStatus`)."""
    return await steamdeck_get_deskflow_status(device_id)


@router.post("/steamdeck/{device_id}/provision")
async def ally_provision_endpoint(device_id: str) -> Any:
    """Protect Ally provision (formerly Tauri `allyProvision`)."""
    return await ally_provision(device_id)


@router.post("/steamdeck/{device_id}/agent/launch")
async def ally_launch_agent_endpoint(device_id: str) -> Any:
    """Launch Ally agent (formerly Tauri `allyLaunchAgent`)."""
    return await ally_launch_agent(device_id)
