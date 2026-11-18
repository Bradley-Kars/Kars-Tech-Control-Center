"""CRUD operations for Alerts endpoints (WS-2.13).

PostgreSQL-backed (replaces the Tauri rusqlite alerts.db).
Uses the Alert SQLAlchemy model from app/models/__init__.py.
"""

from datetime import datetime

from typing import Any, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session
from app.db.session_test import test_async_session
from app.models import Alert, Server


async def alert_create(db: AsyncSession, alert_in: dict[str, Any]) -> Alert:
    # Defensive FK coercion: a synthetic/unknown device_id (e.g. the dashboard's
    # 'local' tile) has no row in `servers`. Store NULL instead of raising
    # alerts_device_id_fkey, so ingest of alerts can never crash on a bad device.
    device_id = alert_in.get("device_id")
    if device_id is not None:
        exists = await db.execute(select(Server.id).where(Server.id == device_id))
        if exists.scalar_one_or_none() is None:
            alert_in = {**alert_in, "device_id": None}
    db_alert = Alert(**alert_in)
    db.add(db_alert)
    await db.commit()
    await db.refresh(db_alert)
    return db_alert


async def alert_list(
    db: AsyncSession,
    severity: Optional[str] = None,
    device_id: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    since: Optional[str] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
) -> Sequence[Alert]:
    stmt = select(Alert)
    if severity:
        stmt = stmt.where(Alert.severity == severity)
    if device_id:
        stmt = stmt.where(Alert.device_id == device_id)
    if acknowledged is not None:
        stmt = stmt.where(Alert.acknowledged == acknowledged)
    if since:
        stmt = stmt.where(Alert.created_at >= since)
    if offset:
        stmt = stmt.offset(offset)
    if limit:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


async def alert_get(db: AsyncSession, alert_id: int) -> Optional[Alert]:
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    return result.scalar_one_or_none()


async def alert_delete(db: AsyncSession, alert_id: int) -> Optional[Alert]:
    db_alert = await alert_get(db, alert_id)
    if db_alert:
        await db.delete(db_alert)
        await db.commit()
    return db_alert


async def alert_acknowledge(
    db: AsyncSession, alert_id: int, acknowledged_by: str
) -> Optional[Alert]:
    db_alert = await alert_get(db, alert_id)
    if not db_alert:
        return None
    db_alert.acknowledged = True
    db_alert.acknowledged_by = acknowledged_by

    db_alert.acknowledged_at = datetime.now()
    await db.commit()
    await db.refresh(db_alert)
    return db_alert


async def alert_acknowledge_all(
    db: AsyncSession, device_id: Optional[str], acknowledged_by: str
) -> int:
    stmt = select(Alert).where(Alert.acknowledged == False)  # noqa: E712
    if device_id:
        stmt = stmt.where(Alert.device_id == device_id)
    result = await db.execute(stmt)
    alerts = result.scalars().all()
    now = datetime.now()
    for a in alerts:
        a.acknowledged = True
        a.acknowledged_by = acknowledged_by
        a.acknowledged_at = now
    await db.commit()
    return len(alerts)


async def alert_evaluate_auto_ack(db: AsyncSession) -> int:
    """Placeholder auto-ack evaluation — returns count of alerts that would be acked."""
    stmt = select(Alert).where(Alert.acknowledged == False)  # noqa: E712
    result = await db.execute(stmt)
    return len(result.scalars().all())
