"""Pydantic schemas for Nextcloud endpoints (WS-2.4)."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class NextcloudServerInfo(BaseModel):
    version: Optional[str] = None
    versionString: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class NextcloudSystemStatus(BaseModel):
    version: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class NextcloudStorageStats(BaseModel):
    free: Optional[int] = None
    used: Optional[int] = None
    total: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class NextcloudUser(BaseModel):
    id: str
    displayName: Optional[str] = None
    email: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class NextcloudActivity(BaseModel):
    activities: list[dict[str, Any]] = []

    model_config = ConfigDict(from_attributes=True)
