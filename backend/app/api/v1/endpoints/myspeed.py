"""MySpeed endpoints (WS-2.7).

GET /servers/{id}/myspeed/summary|tests|servers
"""

from typing import Any, Optional

from fastapi import APIRouter

from app.crud.myspeed import get_myspeed_servers, get_myspeed_summary, get_myspeed_tests
from app.schemas.myspeed import MySpeedServer, MySpeedSummary, MySpeedTest

router = APIRouter()


@router.get("/servers/{server_id}/myspeed/summary", response_model=MySpeedSummary)
async def get_myspeed_summary_endpoint(server_id: str, limit: Optional[int] = None) -> Any:
    """Get MySpeed summary (formerly Tauri `get_myspeed_summary`)."""
    return await get_myspeed_summary(server_id, limit)


@router.get("/servers/{server_id}/myspeed/tests", response_model=list[MySpeedTest])
async def get_myspeed_tests_endpoint(server_id: str, limit: int = 10) -> Any:
    """Get MySpeed tests (formerly Tauri `get_myspeed_tests`)."""
    return await get_myspeed_tests(server_id, limit)


@router.get("/servers/{server_id}/myspeed/servers", response_model=list[MySpeedServer])
async def get_myspeed_servers_endpoint(server_id: str) -> Any:
    """List MySpeed servers (formerly Tauri `get_myspeed_servers`)."""
    return await get_myspeed_servers(server_id)
