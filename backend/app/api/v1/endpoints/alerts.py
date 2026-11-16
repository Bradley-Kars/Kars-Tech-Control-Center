"""Alerts endpoints (WS-2.13).

PostgreSQL-backed alert store (replaces Tauri rusqlite alerts.db).

POST /alerts, GET /alerts, GET /alerts/{id}, DELETE /alerts/{id},
POST /alerts/{id}/acknowledge, POST /alerts/acknowledge-all,
POST /alerts/auto-ack
"""

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.crud.alerts import (
    alert_acknowledge,
    alert_acknowledge_all,
    alert_create,
    alert_delete,
    alert_evaluate_auto_ack,
    alert_get,
    alert_list,
)
from app.schemas.alerts import (
    AlertAcknowledge,
    AlertAcknowledgeAll,
    AlertCreate,
    AlertFilter,
    AlertOut,
)

router = APIRouter()


@router.post("/alerts", response_model=AlertOut)
async def alert_create_endpoint(
    alert_in: AlertCreate,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Create an alert (formerly Tauri `alert_create`)."""
    data = alert_in.model_dump()
    # camelCase (Pydantic) → snake_case (SQLAlchemy model)
    mapped = {
        "severity": data["severity"],
        "title": data["title"],
        "message": data["message"],
        "device_id": data.get("deviceId"),
        "source": data["source"],
        "acknowledged": data.get("acknowledged", False),
        "acknowledged_by": data.get("acknowledgedBy"),
        "acknowledged_at": data.get("acknowledgedAt"),
        "auto_ack_rule": data.get("autoAckRule"),
    }
    db_alert = await alert_create(db, mapped)
    return db_alert


@router.get("/alerts", response_model=list[AlertOut])
async def alert_list_endpoint(
    severity: Optional[str] = None,
    device_id: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    since: Optional[str] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """List alerts with optional filters (formerly Tauri `alert_list`)."""
    return await alert_list(
        db,
        severity=severity,
        device_id=device_id,
        acknowledged=acknowledged,
        since=since,
        limit=limit,
        offset=offset,
    )


@router.get("/alerts/{alert_id}", response_model=AlertOut)
async def alert_get_endpoint(
    alert_id: int,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Get one alert by id (formerly Tauri `alert_get`)."""
    db_alert = await alert_get(db, alert_id)
    if not db_alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return db_alert


@router.delete("/alerts/{alert_id}")
async def alert_delete_endpoint(
    alert_id: int,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Delete an alert (formerly Tauri `alert_delete`)."""
    db_alert = await alert_delete(db, alert_id)
    if not db_alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"message": f"alert {alert_id} deleted"}


@router.post("/alerts/{alert_id}/acknowledge", response_model=AlertOut)
async def alert_acknowledge_endpoint(
    alert_id: int,
    ack: AlertAcknowledge,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Acknowledge an alert (formerly Tauri `alert_acknowledge`)."""
    db_alert = await alert_acknowledge(db, alert_id, ack.acknowledgedBy)
    if not db_alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return db_alert


@router.post("/alerts/acknowledge-all")
async def alert_acknowledge_all_endpoint(
    ack_all: AlertAcknowledgeAll,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Acknowledge all alerts (formerly Tauri `alert_acknowledge_all`)."""
    count = await alert_acknowledge_all(
        db, ack_all.deviceId, ack_all.acknowledgedBy
    )
    return {"count": count}


@router.post("/alerts/auto-ack")
async def alert_evaluate_auto_ack_endpoint(
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Evaluate auto-ack rules (formerly Tauri `alert_evaluate_auto_ack`)."""
    count = await alert_evaluate_auto_ack(db)
    return {"count": count}
