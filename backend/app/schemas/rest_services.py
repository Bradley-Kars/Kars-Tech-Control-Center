"""Pydantic schemas for REST service endpoints (WS-2.18)."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class ServiceHealth(BaseModel):
    service: str
    label: str
    url: str
    reachable: bool
    detail: str

    model_config = ConfigDict(from_attributes=True)


class PlexIdentity(BaseModel):
    machine_identifier: str
    version: str
    claimed: bool

    model_config = ConfigDict(from_attributes=True)


class PlexLibrary(BaseModel):
    key: str
    title: str
    library_type: str
    uuid: str
    scanning: bool
    updated_at: int

    model_config = ConfigDict(from_attributes=True)
