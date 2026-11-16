"""Pydantic schemas for MeshCentral endpoints (WS-2.12)."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class MeshDevice(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    group: Optional[str] = None
    conn: Optional[int] = None
    pwr: Optional[int] = None
    platform: Optional[str] = None
    ip: Optional[str] = None
    lastConnect: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DeviceStatus(BaseModel):
    deviceId: Optional[str] = None
    connected: Optional[bool] = None
    conn: Optional[int] = None
    status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ShellResult(BaseModel):
    deviceId: Optional[str] = None
    command: Optional[str] = None
    exitCode: Optional[int] = None
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    success: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)


class BatchResult(BaseModel):
    deviceId: Optional[str] = None
    command: Optional[str] = None
    exitCode: Optional[int] = None
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    success: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)


class RemoteProcess(BaseModel):
    pid: Optional[int] = None
    name: Optional[str] = None
    cpuPercent: Optional[float] = None
    memoryPercent: Optional[float] = None
    user: Optional[str] = None
    command: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class RemoteFileInfo(BaseModel):
    path: Optional[str] = None
    isDir: Optional[bool] = None
    size: Optional[int] = None
    modified: Optional[str] = None
    permissions: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class EnrollmentInfo(BaseModel):
    agentUrl: Optional[str] = None
    settingsUrl: Optional[str] = None
    groupId: Optional[str] = None
    installCommandLinux: Optional[str] = None
    installCommandWindows: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SyncResult(BaseModel):
    devicesFound: Optional[int] = None
    devicesMatched: Optional[int] = None
    devicesNew: Optional[int] = None
    devicesUpdated: Optional[int] = None
    errors: list[str] = []

    model_config = ConfigDict(from_attributes=True)


class MeshCentralActionResult(BaseModel):
    message: str

    model_config = ConfigDict(from_attributes=True)
