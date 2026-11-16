"""CRUD operations for AdGuard endpoints (WS-2.8).

AdGuard operations communicate with an AdGuard Home instance via HTTP API.
Without real integration, endpoints return structured placeholder responses.
"""

from typing import Any


async def get_adguard_status(server_id: str) -> dict[str, Any]:
    return {"protectionEnabled": True, "queriesBlocked": 0}


async def get_adguard_stats(server_id: str) -> dict[str, Any]:
    return {"queriesBlocked": 0}


async def get_adguard_query_log(server_id: str, limit: int, offset: int) -> list[dict[str, Any]]:
    return []


async def get_adguard_clients(server_id: str) -> list[dict[str, Any]]:
    return []


async def get_adguard_filters(server_id: str) -> list[dict[str, Any]]:
    return []


async def get_adguard_dhcp(server_id: str) -> list[dict[str, Any]]:
    return []


async def adguard_enable(server_id: str) -> dict[str, str]:
    return {"message": "AdGuard protection enabled"}


async def adguard_disable(server_id: str) -> dict[str, str]:
    return {"message": "AdGuard protection disabled"}
