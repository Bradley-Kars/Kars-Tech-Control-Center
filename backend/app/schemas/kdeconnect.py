"""Pydantic schemas for KDE Connect endpoints (WS-2.10)."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class KdeConnectBattery(BaseModel):
    charge: Optional[int] = None
    isCharging: Optional[bool] = None
    hasBattery: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)


class KdeConnectNotification(BaseModel):
    id: Optional[str] = None
    appName: Optional[str] = None
    title: Optional[str] = None
    text: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class KdeConnectActionResult(BaseModel):
    message: str

    model_config = ConfigDict(from_attributes=True)
