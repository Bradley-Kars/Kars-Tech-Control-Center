"""Pydantic schemas for Metrics endpoints (WS-2.14)."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class MetricPoint(BaseModel):
    timestamp: str
    value: float

    model_config = ConfigDict(from_attributes=True)


class MetricSeries(BaseModel):
    metric: str
    device_id: str
    points: list[MetricPoint] = []

    model_config = ConfigDict(from_attributes=True)


class MetricRecord(BaseModel):
    device_id: str
    metric: str
    value: float

    model_config = ConfigDict(from_attributes=True)


class MetricCollectAllResult(BaseModel):
    recorded: int

    model_config = ConfigDict(from_attributes=True)
