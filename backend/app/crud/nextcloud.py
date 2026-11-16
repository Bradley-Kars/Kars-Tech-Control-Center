"""CRUD operations for Nextcloud endpoints (WS-2.4).

Nextcloud operations communicate with a Nextcloud instance via HTTP.
Without real integration, endpoints return structured placeholder responses.
"""

from typing import Any, Optional


async def get_nextcloud_info(server_id: str) -> dict[str, Any]:
    return {"version": "", "versionString": ""}


async def get_nextcloud_status(server_id: str) -> dict[str, Any]:
    return {"version": ""}


async def get_nextcloud_storage(server_id: str) -> dict[str, Any]:
    return {"free": 0, "used": 0, "total": 0}


async def get_nextcloud_users(server_id: str) -> list[dict[str, Any]]:
    return []


async def get_nextcloud_activity(server_id: str, limit: Optional[int] = None) -> dict[str, Any]:
    return {"activities": []}
