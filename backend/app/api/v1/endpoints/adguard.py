"""AdGuard endpoints (WS-2.8).

GET/POST /servers/{id}/adguard/* (status, stats, query-log, clients, filters,
dhcp, enable, disable)
"""

from typing import Any, Optional

from fastapi import APIRouter

from app.crud.adguard import (
    adguard_disable,
    adguard_enable,
    get_adguard_clients,
    get_adguard_dhcp,
    get_adguard_filters,
    get_adguard_query_log,
    get_adguard_stats,
    get_adguard_status,
)
from app.schemas.adguard import AdGuardActionResult, AdGuardStatus, AdGuardStats

router = APIRouter()


@router.get("/servers/{server_id}/adguard/status", response_model=AdGuardStatus)
async def get_adguard_status_endpoint(server_id: str) -> Any:
    """Get AdGuard status (formerly Tauri `get_adguard_status`)."""
    return await get_adguard_status(server_id)


@router.get("/servers/{server_id}/adguard/stats", response_model=AdGuardStats)
async def get_adguard_stats_endpoint(server_id: str) -> Any:
    """Get AdGuard stats (formerly Tauri `get_adguard_stats`)."""
    return await get_adguard_stats(server_id)


@router.get("/servers/{server_id}/adguard/query-log")
async def get_adguard_query_log_endpoint(
    server_id: str, limit: int = 100, offset: int = 0
) -> Any:
    """Get AdGuard query log (formerly Tauri `get_adguard_query_log`)."""
    return await get_adguard_query_log(server_id, limit, offset)


@router.get("/servers/{server_id}/adguard/clients")
async def get_adguard_clients_endpoint(server_id: str) -> Any:
    """List AdGuard clients (formerly Tauri `get_adguard_clients`)."""
    return await get_adguard_clients(server_id)


@router.get("/servers/{server_id}/adguard/filters")
async def get_adguard_filters_endpoint(server_id: str) -> Any:
    """List AdGuard filters (formerly Tauri `get_adguard_filters`)."""
    return await get_adguard_filters(server_id)


@router.get("/servers/{server_id}/adguard/dhcp")
async def get_adguard_dhcp_endpoint(server_id: str) -> Any:
    """Get AdGuard DHCP leases (formerly Tauri `get_adguard_dhcp`)."""
    return await get_adguard_dhcp(server_id)


@router.post("/servers/{server_id}/adguard/enable", response_model=AdGuardActionResult)
async def adguard_enable_endpoint(server_id: str) -> Any:
    """Enable AdGuard protection (formerly Tauri `adguard_enable`)."""
    return await adguard_enable(server_id)


@router.post("/servers/{server_id}/adguard/disable", response_model=AdGuardActionResult)
async def adguard_disable_endpoint(server_id: str) -> Any:
    """Disable AdGuard protection (formerly Tauri `adguard_disable`)."""
    return await adguard_disable(server_id)
