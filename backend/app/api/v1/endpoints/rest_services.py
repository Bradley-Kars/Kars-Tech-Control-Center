"""REST service endpoints (WS-2.18).

GET /services/health, GET /services/plex/identity, GET /services/plex/libraries
"""

from typing import Any, Optional

from fastapi import APIRouter

from app.crud.rest_services import (
    get_plex_identity,
    get_plex_libraries,
    get_rest_service_health,
)
from app.schemas.rest_services import (
    PlexIdentity,
    PlexLibrary,
    ServiceHealth,
)

router = APIRouter()


@router.get("/services/health", response_model=list[ServiceHealth])
async def get_rest_service_health_endpoint(server_id: Optional[str] = None) -> Any:
    """Get REST service health (formerly Tauri `get_rest_service_health`)."""
    return await get_rest_service_health(server_id or "")


@router.get("/services/plex/identity", response_model=PlexIdentity)
async def get_plex_identity_endpoint(server_id: Optional[str] = None) -> Any:
    """Get Plex identity (formerly Tauri `getPlexIdentity`)."""
    return await get_plex_identity(server_id or "")


@router.get("/services/plex/libraries", response_model=list[PlexLibrary])
async def get_plex_libraries_endpoint(server_id: Optional[str] = None) -> Any:
    """Get Plex libraries (formerly Tauri `getPlexLibraries`)."""
    return await get_plex_libraries(server_id or "")
