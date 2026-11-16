"""CRUD operations for KDE Connect endpoints (WS-2.10).

KDE Connect operations communicate with a KDE Connect device over the network.
Without real integration, endpoints return structured placeholder responses.
"""

from typing import Any


async def get_kdeconnect_battery(device_id: str) -> dict[str, Any]:
    return {"charge": 0, "isCharging": False, "hasBattery": True}


async def get_kdeconnect_notifications(device_id: str) -> list[dict[str, Any]]:
    return []


async def kdeconnect_mpris_play(device_id: str) -> dict[str, str]:
    return {"message": "play"}


async def kdeconnect_mpris_pause(device_id: str) -> dict[str, str]:
    return {"message": "pause"}


async def kdeconnect_ring_device(device_id: str) -> dict[str, str]:
    return {"message": "ringing"}


async def kdeconnect_send_ping(device_id: str, message: str) -> dict[str, str]:
    return {"message": f"ping: {message}"}
