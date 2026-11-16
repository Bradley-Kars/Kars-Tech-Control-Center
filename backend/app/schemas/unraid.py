"""Pydantic schemas for Unraid/storage/system endpoints (WS-2.3)."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class DiskInfo(BaseModel):
    name: str
    device: str
    type: str
    size: int
    vendor: str
    temperature: Optional[int] = None
    smartStatus: str
    isSpinning: bool
    free: Optional[int] = None
    fsSize: Optional[int] = None
    fsUsed: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class SmartInfo(BaseModel):
    device: str = ""
    model: str = ""
    capacity: str = ""
    powerOnHours: Optional[str] = None
    temperature: Optional[str] = None
    reallocatedSectors: Optional[str] = None
    pendingSectors: Optional[str] = None
    health: str = "unknown"

    model_config = ConfigDict(from_attributes=True)


class ShareInfo(BaseModel):
    name: str
    comment: str
    allocator: str
    cache: Optional[bool] = None
    size: int
    free: int
    used: int

    model_config = ConfigDict(from_attributes=True)


class GpuInfo(BaseModel):
    name: str = ""
    driverVersion: str = ""
    cudaVersion: str = ""
    temperature: str = ""
    powerUsage: str = ""
    powerCap: str = ""
    memoryUsed: str = ""
    memoryTotal: str = ""
    utilization: str = ""
    fanSpeed: str = ""

    model_config = ConfigDict(from_attributes=True)


class SystemActionResult(BaseModel):
    message: str

    model_config = ConfigDict(from_attributes=True)
