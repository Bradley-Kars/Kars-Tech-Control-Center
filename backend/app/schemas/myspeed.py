"""Pydantic schemas for MySpeed endpoints (WS-2.7)."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class MySpeedSummary(BaseModel):
    download: Optional[float] = None
    upload: Optional[float] = None
    ping: Optional[float] = None
    timestamp: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class MySpeedTest(BaseModel):
    id: Optional[str] = None
    download: Optional[float] = None
    upload: Optional[float] = None
    ping: Optional[float] = None
    timestamp: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class MySpeedServer(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    country: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
