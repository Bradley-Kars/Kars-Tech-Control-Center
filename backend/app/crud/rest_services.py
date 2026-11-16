"""CRUD operations for REST service endpoints (WS-2.18).

REST service operations query external services (Plex, etc.) via HTTP.
Without real integration, endpoints return structured placeholder responses.
"""

from typing import Any


async def get_rest_service_health(server_id: str) -> list[dict[str, Any]]:
    return []


async def get_plex_identity(server_id: str) -> dict[str, Any]:
    return {"machine_identifier": "", "version": "", "claimed": False}


async def get_plex_libraries(server_id: str) -> list[dict[str, Any]]:
    return []
