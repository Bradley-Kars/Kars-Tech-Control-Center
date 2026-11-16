"""Pydantic schemas for Steam Deck endpoints (WS-2.11)."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class MeshSystemStats(BaseModel):
    hostname: Optional[str] = None
    kernel: Optional[str] = None
    osRelease: Optional[str] = None
    arch: Optional[str] = None
    uptime: Optional[str] = None
    cpuUsage: Optional[float] = None
    cpuCores: Optional[int] = None
    cpuThreads: Optional[int] = None
    cpuBrand: Optional[str] = None
    memoryTotalMb: Optional[int] = None
    memoryUsedMb: Optional[int] = None
    memoryFreeMb: Optional[int] = None
    memoryUsagePct: Optional[float] = None
    loadAvg: list[float] = []
    platform: Optional[str] = None
    source: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SteamDeckActionResult(BaseModel):
    message: str

    model_config = ConfigDict(from_attributes=True)


class DeskflowStatus(BaseModel):
    connected: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)
