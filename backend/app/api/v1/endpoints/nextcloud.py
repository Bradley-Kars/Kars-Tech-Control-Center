"""Nextcloud endpoints (WS-2.4).

GET /servers/{id}/nextcloud/info|status|storage|users|activity
"""

from typing import Any, Optional

from fastapi import APIRouter

from app.crud.nextcloud import (
    get_nextcloud_activity,
    get_nextcloud_info,
    get_nextcloud_storage,
    get_nextcloud_status,
    get_nextcloud_users,
)
from app.schemas.nextcloud import (
    NextcloudActivity,
    NextcloudServerInfo,
    NextcloudStorageStats,
    NextcloudSystemStatus,
    NextcloudUser,
)

router = APIRouter()


@router.get("/servers/{server_id}/nextcloud/info", response_model=NextcloudServerInfo)
async def get_nextcloud_info_endpoint(server_id: str) -> Any:
    """Get Nextcloud info (formerly Tauri `get_nextcloud_info`)."""
    return await get_nextcloud_info(server_id)


@router.get("/servers/{server_id}/nextcloud/status", response_model=NextcloudSystemStatus)
async def get_nextcloud_status_endpoint(server_id: str) -> Any:
    """Get Nextcloud status (formerly Tauri `get_nextcloud_status`)."""
    return await get_nextcloud_status(server_id)


@router.get("/servers/{server_id}/nextcloud/storage", response_model=NextcloudStorageStats)
async def get_nextcloud_storage_endpoint(server_id: str) -> Any:
    """Get Nextcloud storage stats (formerly Tauri `get_nextcloud_storage`)."""
    return await get_nextcloud_storage(server_id)


@router.get("/servers/{server_id}/nextcloud/users", response_model=list[NextcloudUser])
async def get_nextcloud_users_endpoint(server_id: str) -> Any:
    """List Nextcloud users (formerly Tauri `get_nextcloud_users`)."""
    return await get_nextcloud_users(server_id)


@router.get("/servers/{server_id}/nextcloud/activity", response_model=NextcloudActivity)
async def get_nextcloud_activity_endpoint(
    server_id: str, limit: Optional[int] = None
) -> Any:
    """Get Nextcloud activity (formerly Tauri `get_nextcloud_activity`)."""
    return await get_nextcloud_activity(server_id, limit)
