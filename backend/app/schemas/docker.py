"""Pydantic schemas for Docker endpoints (WS-2.2)."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class ContainerInfo(BaseModel):
    id: str
    name: str
    image: str
    state: str
    status: str
    autoStart: bool

    model_config = ConfigDict(from_attributes=True)


class DockerActionResult(BaseModel):
    message: str


class DockerContainerInfo(BaseModel):
    inspect_json: str

    model_config = ConfigDict(from_attributes=True)
