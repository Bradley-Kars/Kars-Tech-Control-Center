"""MeshCentral endpoints (WS-2.12).

GET/POST /meshcentral/* (devices, execute-batch, terminal-url, etc.)
GET/POST /meshcentral/servers/{id}/* (shell, files, docker, stats, processes, reboot, shutdown)
"""

from typing import Any, Optional

from fastapi import APIRouter

from app.crud.meshcentral import (
    meshcentral_docker_containers,
    meshcentral_docker_start,
    meshcentral_docker_stop,
    meshcentral_docker_restart,
    meshcentral_execute_batch,
    meshcentral_get_device_status,
    meshcentral_get_enrollment_info,
    meshcentral_get_file_manager_url,
    meshcentral_get_fleet_stats,
    meshcentral_get_processes,
    meshcentral_get_system_stats,
    meshcentral_get_terminal_url,
    meshcentral_list_devices,
    meshcentral_read_file,
    meshcentral_reboot,
    meshcentral_shutdown,
    meshcentral_sync_fleet,
    meshcentral_write_file,
    meshcentral_list_dir,
    meshcentral_shell_exec,
    meshcentral_shell_batch,
    meshcentral_shell_fleet,
)
from app.schemas.meshcentral import (
    BatchResult,
    DeviceStatus,
    EnrollmentInfo,
    MeshCentralActionResult,
    MeshDevice,
    RemoteFileInfo,
    RemoteProcess,
    ShellResult,
    SyncResult,
)

router = APIRouter()


@router.get("/meshcentral/devices", response_model=list[MeshDevice])
async def meshcentral_list_devices_endpoint() -> Any:
    """List MeshCentral devices (formerly Tauri `meshcentralListDevices`)."""
    return await meshcentral_list_devices()


@router.get("/meshcentral/devices/{device_id}/status", response_model=DeviceStatus)
async def meshcentral_get_device_status_endpoint(device_id: str) -> Any:
    """Get MeshCentral device status (formerly Tauri `meshcentralGetDeviceStatus`)."""
    return await meshcentral_get_device_status(device_id)


@router.post("/meshcentral/execute-batch", response_model=list[BatchResult])
async def meshcentral_execute_batch_endpoint(
    device_ids: list[str], commands: list[dict[str, Any]]
) -> Any:
    """Execute batch commands (formerly Tauri `meshcentralExecuteBatch`)."""
    return await meshcentral_execute_batch(device_ids, commands)


@router.get("/meshcentral/devices/{device_id}/terminal-url")
async def meshcentral_get_terminal_url_endpoint(device_id: str) -> Any:
    """Get MeshCentral terminal URL (formerly Tauri `meshcentralGetTerminalUrl`)."""
    return await meshcentral_get_terminal_url(device_id)


@router.get("/meshcentral/devices/{device_id}/file-manager-url")
async def meshcentral_get_file_manager_url_endpoint(device_id: str) -> Any:
    """Get MeshCentral file manager URL (formerly Tauri `meshcentralGetFileManagerUrl`)."""
    return await meshcentral_get_file_manager_url(device_id)


@router.get("/meshcentral/enrollment-info", response_model=EnrollmentInfo)
async def meshcentral_get_enrollment_info_endpoint(
    device_type: str,
) -> Any:
    """Get MeshCentral enrollment info (formerly Tauri `meshcentralGetEnrollmentInfo`)."""
    return await meshcentral_get_enrollment_info(device_type)


@router.post("/meshcentral/sync-fleet", response_model=SyncResult)
async def meshcentral_sync_fleet_endpoint() -> Any:
    """Sync MeshCentral fleet (formerly Tauri `meshcentralSyncFleet`)."""
    return await meshcentral_sync_fleet()


@router.get("/meshcentral/fleet/stats")
async def meshcentral_get_fleet_stats_endpoint() -> Any:
    """Get MeshCentral fleet stats (formerly Tauri `meshcentralGetFleetStats`)."""
    return await meshcentral_get_fleet_stats()


# --- MeshCentral transport (per-server) ---


@router.post("/meshcentral/servers/{server_id}/shell/exec", response_model=ShellResult)
async def meshcentral_shell_exec_endpoint(
    server_id: str, command: str, timeout_secs: Optional[int] = None
) -> Any:
    """Execute shell command (formerly Tauri `meshcentralShellExec`)."""
    return await meshcentral_shell_exec(server_id, command, timeout_secs)


@router.post("/meshcentral/servers/{server_id}/shell/batch", response_model=list[ShellResult])
async def meshcentral_shell_batch_endpoint(
    server_id: str, commands: list[str], timeout_secs: Optional[int] = None
) -> Any:
    """Execute shell batch (formerly Tauri `meshcentralShellBatch`)."""
    return await meshcentral_shell_batch(server_id, commands, timeout_secs)


@router.post("/meshcentral/shell/fleet", response_model=list[ShellResult])
async def meshcentral_shell_fleet_endpoint(
    server_ids: list[str], command: str, timeout_secs: Optional[int] = None
) -> Any:
    """Execute shell on fleet (formerly Tauri `meshcentralShellFleet`)."""
    return await meshcentral_shell_fleet(server_ids, command, timeout_secs)


@router.get("/meshcentral/servers/{server_id}/files/read", response_model=RemoteFileInfo)
async def meshcentral_read_file_endpoint(server_id: str, path: str) -> Any:
    """Read file via MeshCentral (formerly Tauri `meshcentralReadFile`)."""
    return await meshcentral_read_file(server_id, path)


@router.post("/meshcentral/servers/{server_id}/files/write")
async def meshcentral_write_file_endpoint(
    server_id: str, path: str, content: str, mode: Optional[int] = None
) -> Any:
    """Write file via MeshCentral (formerly Tauri `meshcentralWriteFile`)."""
    return await meshcentral_write_file(server_id, path, content, mode)


@router.get("/meshcentral/servers/{server_id}/files/list", response_model=list[RemoteFileInfo])
async def meshcentral_list_dir_endpoint(server_id: str, path: str) -> Any:
    """List directory via MeshCentral (formerly Tauri `meshcentralListDir`)."""
    return await meshcentral_list_dir(server_id, path)


@router.get("/meshcentral/servers/{server_id}/stats")
async def meshcentral_get_system_stats_endpoint(server_id: str) -> Any:
    """Get MeshCentral system stats (formerly Tauri `meshcentralGetSystemStats`)."""
    return await meshcentral_get_system_stats(server_id)


@router.get("/meshcentral/servers/{server_id}/processes", response_model=list[RemoteProcess])
async def meshcentral_get_processes_endpoint(
    server_id: str, limit: Optional[int] = None
) -> Any:
    """Get MeshCentral processes (formerly Tauri `meshcentralGetProcesses`)."""
    return await meshcentral_get_processes(server_id, limit)


@router.post("/meshcentral/servers/{server_id}/reboot", response_model=MeshCentralActionResult)
async def meshcentral_reboot_endpoint(server_id: str) -> Any:
    """Reboot via MeshCentral (formerly Tauri `meshcentralReboot`)."""
    return await meshcentral_reboot(server_id)


@router.post("/meshcentral/servers/{server_id}/shutdown", response_model=MeshCentralActionResult)
async def meshcentral_shutdown_endpoint(server_id: str) -> Any:
    """Shutdown via MeshCentral (formerly Tauri `meshcentralShutdown`)."""
    return await meshcentral_shutdown(server_id)


@router.get("/meshcentral/servers/{server_id}/docker/containers", response_model=list[MeshDevice])
async def meshcentral_docker_containers_endpoint(server_id: str) -> Any:
    """List Docker containers via MeshCentral (formerly Tauri `meshcentralDockerContainers`)."""
    return await meshcentral_docker_containers(server_id)


@router.post("/meshcentral/servers/{server_id}/docker/containers/{container}/start", response_model=MeshCentralActionResult)
async def meshcentral_docker_start_endpoint(server_id: str, container: str) -> Any:
    """Start Docker container via MeshCentral (formerly Tauri `meshcentralDockerStart`)."""
    return await meshcentral_docker_start(server_id, container)


@router.post("/meshcentral/servers/{server_id}/docker/containers/{container}/stop", response_model=MeshCentralActionResult)
async def meshcentral_docker_stop_endpoint(server_id: str, container: str) -> Any:
    """Stop Docker container via MeshCentral (formerly Tauri `meshcentralDockerStop`)."""
    return await meshcentral_docker_stop(server_id, container)


@router.post("/meshcentral/servers/{server_id}/docker/containers/{container}/restart", response_model=MeshCentralActionResult)
async def meshcentral_docker_restart_endpoint(server_id: str, container: str) -> Any:
    """Restart Docker container via MeshCentral (formerly Tauri `meshcentralDockerRestart`)."""
    return await meshcentral_docker_restart(server_id, container)
