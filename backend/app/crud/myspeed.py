"""CRUD operations for MySpeed endpoints (WS-2.7).

MySpeed operations communicate with a MySpeed instance.
Without real integration, endpoints return structured placeholder responses.
"""

from typing import Any, Optional


async def get_myspeed_summary(server_id: str, limit: Optional[int] = None) -> dict[str, Any]:
    return {"download": 0, "upload": 0, "ping": 0, "timestamp": ""}


async def get_myspeed_tests(server_id: str, limit: int) -> list[dict[str, Any]]:
    return []


async def get_myspeed_servers(server_id: str) -> list[dict[str, Any]]:
    return []
