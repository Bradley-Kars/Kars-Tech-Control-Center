"""Docker endpoints (WS-2.2).

GET/POST/DELETE /servers/{id}/docker/containers/{name}/*
GET /servers/{id}/docker/containers/{name}/info
"""

from typing import Any

from fastapi import APIRouter

from app.crud.docker import container_action, container_info, container_logs, list_containers
from app.schemas.docker import ContainerInfo, DockerActionResult, DockerContainerInfo

router = APIRouter()


@router.get("/servers/{server_id}/docker/containers", response_model=list[ContainerInfo])
async def get_docker_containers(server_id: str) -> Any:
    """List Docker containers for a server (formerly Tauri `get_docker_containers`)."""
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
