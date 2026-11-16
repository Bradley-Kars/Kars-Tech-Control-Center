"""KDE Connect endpoints (WS-2.10).

GET/POST /kdeconnect/{id}/* (battery, notifications, mpris, ring, ping, etc.)
"""

from typing import Any

from fastapi import APIRouter

from app.crud.kdeconnect import (
    get_kdeconnect_battery,
    get_kdeconnect_notifications,
    kdeconnect_mpris_pause,
    kdeconnect_mpris_play,
    kdeconnect_ring_device,
    kdeconnect_send_ping,
)
from app.schemas.kdeconnect import (
    KdeConnectActionResult,
    KdeConnectBattery,
    KdeConnectNotification,
)

router = APIRouter()


@router.get("/kdeconnect/{device_id}/battery", response_model=KdeConnectBattery)
async def get_kdeconnect_battery_endpoint(device_id: str) -> Any:
    """Get KDE Connect battery (formerly Tauri `get_kdeconnect_battery`)."""
    return await get_kdeconnect_battery(device_id)


@router.get("/kdeconnect/{device_id}/notifications", response_model=list[KdeConnectNotification])
async def get_kdeconnect_notifications_endpoint(device_id: str) -> Any:
    """List KDE Connect notifications (formerly Tauri `get_kdeconnect_notifications`)."""
    return await get_kdeconnect_notifications(device_id)


@router.post("/kdeconnect/{device_id}/mpris/play", response_model=KdeConnectActionResult)
async def kdeconnect_mpris_play_endpoint(device_id: str) -> Any:
    """KDE Connect MPRIS play (formerly Tauri `kdeConnectMprisPlay`)."""
    return await kdeconnect_mpris_play(device_id)


@router.post("/kdeconnect/{device_id}/mpris/pause", response_model=KdeConnectActionResult)
async def kdeconnect_mpris_pause_endpoint(device_id: str) -> Any:
    """KDE Connect MPRIS pause (formerly Tauri `kdeConnectMprisPause`)."""
    return await kdeconnect_mpris_pause(device_id)


@router.post("/kdeconnect/{device_id}/ring", response_model=KdeConnectActionResult)
async def kdeconnect_ring_device_endpoint(device_id: str) -> Any:
    """Ring KDE Connect device (formerly Tauri `kdeConnectRingDevice`)."""
    return await kdeconnect_ring_device(device_id)


@router.post("/kdeconnect/{device_id}/ping", response_model=KdeConnectActionResult)
async def kdeconnect_send_ping_endpoint(device_id: str, message: str) -> Any:
    """Send KDE Connect ping (formerly Tauri `kdeConnectSendPing`)."""
    return await kdeconnect_send_ping(device_id, message)
