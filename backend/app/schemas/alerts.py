"""Pydantic schemas for Alerts endpoints (WS-2.13).

Reuses SQLAlchemy Alert model fields from app/models/__init__.py.
"""

from datetime import datetime, UTC
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, model_serializer


class AlertBase(BaseModel):
    severity: str
    title: str
    message: str
    deviceId: Optional[str] = None
    source: str
    acknowledged: Optional[bool] = False
    acknowledgedBy: Optional[str] = None
    acknowledgedAt: Optional[str] = None
    autoAckRule: Optional[str] = None


class AlertCreate(AlertBase):
    pass


class AlertOut(AlertBase):
    id: Optional[int] = None
    device_id: Optional[str] = None
    source: str
    acknowledged: Optional[bool] = False
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    auto_ack_rule: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @model_serializer
    def ser_model(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "severity": self.severity,
            "title": self.title,
            "message": self.message,
            "deviceId": self.device_id,
            "source": self.source,
            "acknowledged": self.acknowledged,
            "acknowledgedBy": self.acknowledged_by,
            "acknowledgedAt": (
                self.acknowledged_at.isoformat()
                if self.acknowledged_at is not None
                else None
            ),
            "autoAckRule": self.auto_ack_rule,
            "createdAt": (
                self.created_at.isoformat() if self.created_at is not None else None
            ),
            "updatedAt": (
                self.updated_at.isoformat() if self.updated_at is not None else None
            ),
        }


class AlertAcknowledge(BaseModel):
    acknowledgedBy: str

    model_config = ConfigDict(from_attributes=True)


class AlertAcknowledgeAll(BaseModel):
    deviceId: Optional[str] = None
    acknowledgedBy: str = "user"

    model_config = ConfigDict(from_attributes=True)


class AlertFilter(BaseModel):
    severity: Optional[str] = None
    deviceId: Optional[str] = None
    acknowledged: Optional[bool] = None
    since: Optional[str] = None
    limit: Optional[int] = None
    offset: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)
