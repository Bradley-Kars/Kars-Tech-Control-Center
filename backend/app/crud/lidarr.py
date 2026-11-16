"""CRUD operations for Lidarr endpoints (WS-2.5).

Lidarr operations communicate with a Lidarr instance via HTTP API.
Without real integration, endpoints return structured placeholder responses.
"""

from typing import Any, Optional


async def get_lidarr_status(server_id: str) -> dict[str, Any]:
    return {"version": ""}


async def get_lidarr_health(server_id: str) -> dict[str, Any]:
    return {"version": ""}


async def get_lidarr_artists(server_id: str) -> list[dict[str, Any]]:
    return []


async def get_lidarr_albums(server_id: str) -> list[dict[str, Any]]:
    return []


async def get_lidarr_wanted(server_id: str) -> dict[str, Any]:
    return {"records": [], "page": 1, "pageSize": 0, "totalRecords": 0}


async def get_lidarr_queue(server_id: str) -> dict[str, Any]:
    return {"records": [], "page": 1, "pageSize": 0, "totalRecords": 0}


async def get_lidarr_diskspace(server_id: str) -> dict[str, Any]:
    return {}


async def lidarr_refresh_artist(server_id: str, artist_id: int) -> dict[str, str]:
    return {"message": f"refresh initiated for artist {artist_id}"}


async def lidarr_search_missing(server_id: str, artist_id: int) -> dict[str, str]:
    return {"message": f"search-missing initiated for artist {artist_id}"}
