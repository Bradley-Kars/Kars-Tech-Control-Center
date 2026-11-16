"""CRUD operations for Steam Deck endpoints (WS-2.11).

Steam Deck operations communicate with the device via SSH/MeshCentral.
Without real integration, endpoints return structured placeholder responses.
"""

from typing import Any


async def steamdeck_get_system_stats(device_id: str) -> dict[str, Any]:
    return {
        "hostname": "",
        "kernel": "",
        "osRelease": "",
        "arch": "",
        "uptime": "",
        "cpuUsage": 0,
        "cpuCores": 0,
        "cpuThreads": 0,
        "cpuBrand": "",
        "memoryTotalMb": 0,
        "memoryUsedMb": 0,
        "memoryFreeMb": 0,
        "memoryUsagePct": 0,
        "loadAvg": [0, 0, 0],
        "platform": "",
        "source": "",
    }


async def steamdeck_get_battery(device_id: str) -> dict[str, Any]:
    return {"charge": 0, "isCharging": False, "hasBattery": True}


async def steamdeck_get_thermal(device_id: str) -> dict[str, Any]:
    return {"temperature": 0, "throttling": False}


async def steamdeck_get_disk(device_id: str) -> dict[str, Any]:
    return {"total": 0, "used": 0, "free": 0}


async def steamdeck_get_network(device_id: str) -> dict[str, Any]:
    return {"wifi": False, "ipAddress": ""}


async def steamdeck_get_gpu(device_id: str) -> dict[str, Any]:
    return {}


async def steamdeck_launch_rustdesk(device_id: str) -> dict[str, str]:
    return {"message": "rustdesk launched"}


async def steamdeck_get_deskflow_status(device_id: str) -> dict[str, Any]:
    return {"connected": False}


async def ally_provision(device_id: str) -> dict[str, Any]:
    return {"log": "", "pubkeyInstalled": False}


async def ally_launch_agent(device_id: str) -> dict[str, Any]:
    return {"ok": False, "terminal": ""}
