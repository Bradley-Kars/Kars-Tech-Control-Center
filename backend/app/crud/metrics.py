"""CRUD operations for Metrics endpoints (WS-2.14).

PostgreSQL-backed time-series store (replaces Tauri rusqlite metrics.db).
Uses the Metric SQLAlchemy model from app/models/__init__.py.
"""

from typing import Any, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Metric


async def metric_record(db: AsyncSession, record_in: dict[str, Any]) -> Metric:
    db_metric = Metric(**record_in)
    db.add(db_metric)
    await db.commit()
    await db.refresh(db_metric)
    return db_metric


async def metric_query(
    db: AsyncSession,
    device_id: str,
    metric: str,
    from_ts: Optional[str] = None,
    to: Optional[str] = None,
    limit: Optional[int] = None,
) -> Sequence[Metric]:
    stmt = select(Metric).where(
        Metric.device_id == device_id, Metric.metric == metric
    )
    if from_ts:
        stmt = stmt.where(Metric.timestamp >= from_ts)
    if to:
        stmt = stmt.where(Metric.timestamp <= to)
    stmt = stmt.order_by(Metric.timestamp)
    if limit:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


async def metric_query_multi(
    db: AsyncSession,
    device_ids: list[str],
    metrics: list[str],
    from_ts: Optional[str] = None,
    to: Optional[str] = None,
) -> Sequence[Metric]:
    stmt = select(Metric).where(
        Metric.device_id.in_(device_ids), Metric.metric.in_(metrics)
    )
    if from_ts:
        stmt = stmt.where(Metric.timestamp >= from_ts)
    if to:
        stmt = stmt.where(Metric.timestamp <= to)
    stmt = stmt.order_by(Metric.device_id, Metric.metric, Metric.timestamp)
    result = await db.execute(stmt)
    return result.scalars().all()


async def metric_collect_all(db: AsyncSession) -> int:
    """Placeholder collect-all — returns count of metrics rows that would be collected."""
    result = await db.execute(select(Metric))
    return len(result.scalars().all())
