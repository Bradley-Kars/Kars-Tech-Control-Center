"""Pydantic schemas for Home Assistant endpoints (WS-2.6)."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class HomeAssistantState(BaseModel):
    entityId: Optional[str] = None
    state: Optional[str] = None
    attributes: dict[str, Any] = {}
    lastChanged: Optional[str] = None
    lastUpdated: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class HomeAssistantConfigData(BaseModel):
    version: Optional[str] = None
    configDir: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class HomeAssistantArea(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class HomeAssistantDevice(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class HomeAssistantEntity(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class HAActionResult(BaseModel):
    message: str

    model_config = ConfigDict(from_attributes=True)
