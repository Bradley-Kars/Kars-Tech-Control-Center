"""CRUD operations for MeshCentral endpoints (WS-2.12).

MeshCentral operations communicate with a MeshCentral server via its API.
Without real integration, endpoints return structured placeholder responses.
"""

from typing import Any, Optional


async def meshcentral_list_devices() -> list[dict[str, Any]]:
    return []


async def meshcentral_get_device_status(device_id: str) -> dict[str, Any]:
    return {"deviceId": device_id, "connected": False, "conn": 0, "status": "offline"}


async def meshcentral_execute_batch(
    device_ids: list[str], commands: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    return []


async def meshcentral_get_terminal_url(device_id: str) -> dict[str, str]:
    return {"url": f"ws://127.0.0.1:8799/meshcentral/devices/{device_id}/terminal-url"}


async def meshcentral_get_file_manager_url(device_id: str) -> dict[str, str]:
    return {"url": f"http://127.0.0.1:8799/meshcentral/devices/{device_id}/file-manager-url"}


async def meshcentral_get_enrollment_info(device_type: str) -> dict[str, Any]:
    return {
        "agentUrl": "",
        "settingsUrl": "",
        "groupId": "",
        "installCommandLinux": "",
        "installCommandWindows": "",
    }


async def meshcentral_sync_fleet() -> dict[str, Any]:
    return {
        "devicesFound": 0,
        "devicesMatched": 0,
        "devicesNew": 0,
        "devicesUpdated": 0,
        "errors": [],
    }


async def meshcentral_get_fleet_stats() -> dict[str, Any]:
    return {}


async def meshcentral_shell_exec(
    server_id: str, command: str, timeout_secs: Optional[int] = None
) -> dict[str, Any]:
    return {
        "deviceId": server_id,
        "command": command,
        "exitCode": 0,
        "stdout": "",
        "stderr": "",
        "success": True,
    }


async def meshcentral_shell_batch(
    server_id: str, commands: list[str], timeout_secs: Optional[int] = None
) -> list[dict[str, Any]]:
    return []


async def meshcentral_shell_fleet(
    server_ids: list[str], command: str, timeout_secs: Optional[int] = None
) -> list[dict[str, Any]]:
    return []


async def meshcentral_read_file(server_id: str, path: str) -> dict[str, str]:
    return {"content": ""}


async def meshcentral_write_file(
    server_id: str, path: str, content: str, mode: Optional[int] = None
) -> dict[str, str]:
    return {"message": f"wrote {path}"}


async def meshcentral_list_dir(server_id: str, path: str) -> list[dict[str, Any]]:
    return []


async def meshcentral_get_system_stats(server_id: str) -> dict[str, Any]:
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


async def meshcentral_get_processes(server_id: str, limit: Optional[int] = None) -> list[dict[str, Any]]:
    return []


async def meshcentral_reboot(server_id: str) -> dict[str, str]:
    return {"message": f"reboot initiated for {server_id}"}


async def meshcentral_shutdown(server_id: str) -> dict[str, str]:
    return {"message": f"shutdown initiated for {server_id}"}


async def meshcentral_docker_containers(server_id: str) -> list[dict[str, Any]]:
    return []


async def meshcentral_docker_start(
    server_id: str, container: str
) -> dict[str, str]:
    return {"message": f"started {container}"}


async def meshcentral_docker_stop(
    server_id: str, container: str
) -> dict[str, str]:
    return {"message": f"stopped {container}"}


async def meshcentral_docker_restart(
    server_id: str, container: str
) -> dict[str, str]:
    return {"message": f"restarted {container}"}
