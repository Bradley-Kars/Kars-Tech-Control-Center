"""CRUD operations for Docker endpoints (WS-2.2).

Docker operations are external (SSH/Docker socket to the target server),
so these are thin pass-through wrappers. Real Docker integration is
deferred to a later phase; endpoints return structured responses.
"""

from typing import Any, Optional


async def list_containers(server_id: str) -> list[dict[str, Any]]:
    """List containers for a server. Returns empty list (no Docker integration yet)."""
    return []


async def container_action(server_id: str, container: str, action: str) -> dict[str, str]:
    """Perform start/stop/restart/remove on a container."""
    return {"message": f"{action} initiated for container {container}"}


async def container_logs(server_id: str, container: str, lines: int) -> dict[str, str]:
    """Fetch container logs."""
    return {"logs": ""}


async def container_info(server_id: str, container: str) -> dict[str, str]:
    """Get container inspect info."""
    return {"inspect_json": "{}"}
