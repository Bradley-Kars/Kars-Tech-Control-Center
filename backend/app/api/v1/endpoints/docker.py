"""Docker endpoints (WS-2.2).

GET/POST/DELETE /servers/{id}/docker/containers/{name}/*
GET /servers/{id}/docker/containers/{name}/info
"""

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.crud.docker import container_action, container_info, container_logs, list_containers
from app.crud.servers import get_server
from app.schemas.docker import ContainerInfo, DockerActionResult, DockerContainerInfo
from app.services import transports

router = APIRouter()


@router.get("/servers/{server_id}/docker/containers", response_model=list[ContainerInfo])
async def get_docker_containers(
    server_id: str, db: AsyncSession = Depends(get_session)
) -> Any:
    """List Docker containers for a server (formerly Tauri `get_docker_containers`).

    Unraid hosts are queried via the real GraphQL API; other hosts fall back
    to the CRUD stub.
    """
    server = await get_server(db, server_id)
    if server and server.device_type == "unraid":
        entry = transports.find_entry(hostname=server.hostname, server_id=server.id)
        if entry:
            try:
                return await transports.unraid_docker(entry)
            except Exception:  # noqa: BLE001 - fall through to stub
                pass
    return await list_containers(server_id)


@router.post("/servers/{server_id}/docker/containers/{container}/start", response_model=DockerActionResult)
async def docker_start(server_id: str, container: str) -> Any:
    """Start a container (formerly Tauri `docker_start`)."""
    return await container_action(server_id, container, "start")


@router.post("/servers/{server_id}/docker/containers/{container}/stop", response_model=DockerActionResult)
async def docker_stop(server_id: str, container: str) -> Any:
    """Stop a container (formerly Tauri `docker_stop`)."""
    return await container_action(server_id, container, "stop")


@router.post("/servers/{server_id}/docker/containers/{container}/restart", response_model=DockerActionResult)
async def docker_restart(server_id: str, container: str) -> Any:
    """Restart a container (formerly Tauri `docker_restart`)."""
    return await container_action(server_id, container, "restart")


@router.delete("/servers/{server_id}/docker/containers/{container}", response_model=DockerActionResult)
async def docker_remove(server_id: str, container: str) -> Any:
    """Remove a container (formerly Tauri `docker_remove`)."""
    return await container_action(server_id, container, "remove")


@router.get("/servers/{server_id}/docker/containers/{container}/logs")
async def docker_logs(server_id: str, container: str, lines: int = 100) -> Any:
    """Fetch container logs (formerly Tauri `docker_logs`)."""
    return await container_logs(server_id, container, lines)


@router.get("/servers/{server_id}/docker/containers/{container}/info", response_model=DockerContainerInfo)
async def docker_container_info(server_id: str, container: str) -> Any:
    """Get container inspect info (formerly Tauri `get_docker_container_info`)."""
    return await container_info(server_id, container)
