"""Pydantic schemas for AdGuard endpoints (WS-2.8)."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class AdGuardStatus(BaseModel):
    protectionEnabled: Optional[bool] = None
    queriesBlocked: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class AdGuardStats(BaseModel):
    queriesBlocked: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class AdGuardActionResult(BaseModel):
    message: str

    model_config = ConfigDict(from_attributes=True)
