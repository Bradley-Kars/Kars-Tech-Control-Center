"""CRUD operations for Unraid/storage/system endpoints (WS-2.3).

These operations communicate with the target server via SSH/MeshCentral.
Without real transport integration, endpoints return structured
placeholder responses. Real transport is deferred to a later phase.
"""

from typing import Any, Optional


async def get_disks(server_id: str) -> list[dict[str, Any]]:
    return []


async def get_smart_data(server_id: str, device: str) -> dict[str, Any]:
    return {}


async def get_shares(server_id: str) -> list[dict[str, Any]]:
    return []


async def get_array_info(server_id: str) -> dict[str, Any]:
    return {}


async def get_gpu_info(server_id: str) -> dict[str, Any]:
    return {}


async def get_processes(server_id: str) -> dict[str, Any]:
    return {"processes": []}


async def get_syslog(server_id: str, lines: int) -> dict[str, str]:
    return {"syslog": ""}


async def get_user_scripts(server_id: str) -> dict[str, Any]:
    return {"scripts": []}


async def run_user_script(server_id: str, name: str) -> dict[str, str]:
    return {"output": ""}


async def get_plugins(server_id: str) -> list[dict[str, Any]]:
    return []


async def get_network_interfaces(server_id: str) -> dict[str, Any]:
    return {"interfaces": []}


async def get_tailscale_peers(server_id: str) -> dict[str, Any]:
    return {"peers": []}


async def reboot_server(server_id: str) -> dict[str, str]:
    return {"message": f"reboot initiated for {server_id}"}


async def shutdown_server(server_id: str) -> dict[str, str]:
    return {"message": f"shutdown initiated for {server_id}"}
