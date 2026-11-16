"""Pydantic schemas for Prometheus endpoints (WS-2.15)."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class PromSeries(BaseModel):
    instance: str
    points: list[dict[str, Any]] = []

    model_config = ConfigDict(from_attributes=True)


class PrometheusHealth(BaseModel):
    healthy: bool

    model_config = ConfigDict(from_attributes=True)
