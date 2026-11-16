"""Lidarr endpoints (WS-2.5).

GET/POST /servers/{id}/lidarr/* (status, health, artists, albums, wanted,
queue, diskspace, refresh, search-missing)
"""

from typing import Any, Optional

from fastapi import APIRouter

from app.crud.lidarr import (
    get_lidarr_albums,
    get_lidarr_artists,
    get_lidarr_diskspace,
    get_lidarr_health,
    get_lidarr_queue,
    get_lidarr_status,
    get_lidarr_wanted,
    lidarr_refresh_artist,
    lidarr_search_missing,
)
from app.schemas.lidarr import (
    LidarrActionResult,
    LidarrAlbum,
    LidarrArtist,
    LidarrSystemStatus,
)

router = APIRouter()


@router.get("/servers/{server_id}/lidarr/status", response_model=LidarrSystemStatus)
async def get_lidarr_status_endpoint(server_id: str) -> Any:
    """Get Lidarr status (formerly Tauri `get_lidarr_status`)."""
    return await get_lidarr_status(server_id)


@router.get("/servers/{server_id}/lidarr/health", response_model=LidarrSystemStatus)
async def get_lidarr_health_endpoint(server_id: str) -> Any:
    """Get Lidarr health (formerly Tauri `get_lidarr_health`)."""
    return await get_lidarr_health(server_id)


@router.get("/servers/{server_id}/lidarr/artists", response_model=list[LidarrArtist])
async def get_lidarr_artists_endpoint(server_id: str) -> Any:
    """List Lidarr artists (formerly Tauri `get_lidarr_artists`)."""
    return await get_lidarr_artists(server_id)


@router.get("/servers/{server_id}/lidarr/albums", response_model=list[LidarrAlbum])
async def get_lidarr_albums_endpoint(server_id: str) -> Any:
    """List Lidarr albums (formerly Tauri `get_lidarr_albums`)."""
    return await get_lidarr_albums(server_id)


@router.get("/servers/{server_id}/lidarr/wanted")
async def get_lidarr_wanted_endpoint(server_id: str) -> Any:
    """Get Lidarr wanted/missing (formerly Tauri `get_lidarr_wanted`)."""
    return await get_lidarr_wanted(server_id)


@router.get("/servers/{server_id}/lidarr/queue")
async def get_lidarr_queue_endpoint(server_id: str) -> Any:
    """Get Lidarr queue (formerly Tauri `get_lidarr_queue`)."""
    return await get_lidarr_queue(server_id)


@router.get("/servers/{server_id}/lidarr/diskspace")
async def get_lidarr_diskspace_endpoint(server_id: str) -> Any:
    """Get Lidarr diskspace (formerly Tauri `get_lidarr_diskspace`)."""
    return await get_lidarr_diskspace(server_id)


@router.post(
    "/servers/{server_id}/lidarr/artists/{artist_id}/refresh",
    response_model=LidarrActionResult,
)
async def lidarr_refresh_artist_endpoint(server_id: str, artist_id: int) -> Any:
    """Refresh a Lidarr artist (formerly Tauri `lidarr_refresh_artist`)."""
    return await lidarr_refresh_artist(server_id, artist_id)


@router.post(
    "/servers/{server_id}/lidarr/artists/{artist_id}/search-missing",
    response_model=LidarrActionResult,
)
async def lidarr_search_missing_endpoint(server_id: str, artist_id: int) -> Any:
    """Search missing for a Lidarr artist (formerly Tauri `lidarr_search_missing`)."""
    return await lidarr_search_missing(server_id, artist_id)
