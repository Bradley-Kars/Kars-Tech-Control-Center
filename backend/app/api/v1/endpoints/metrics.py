"""Metrics endpoints (WS-2.14).

PostgreSQL-backed time-series store (replaces Tauri rusqlite metrics.db).

POST /metrics, GET /metrics/query, POST /metrics/query-multi, POST /metrics/collect-all
"""

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.crud.metrics import (
    metric_collect_all,
    metric_query,
    metric_query_multi,
    metric_record,
)
from app.schemas.metrics import (
    MetricCollectAllResult,
    MetricPoint,
    MetricRecord,
    MetricSeries,
)

router = APIRouter()


@router.post("/metrics")
async def metric_record_endpoint(
    record_in: MetricRecord,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Record a metric (formerly Tauri `metric_record`)."""
    data = {
        "device_id": record_in.device_id,
        "metric": record_in.metric,
        "value": record_in.value,
    }
    db_metric = await metric_record(db, data)
    return {"message": f"recorded metric {db_metric.metric} for {db_metric.device_id}"}


@router.get("/metrics/query", response_model=list[MetricPoint])
async def metric_query_endpoint(
    device_id: str,
    metric: str,
    from_ts: Optional[str] = None,
    to: Optional[str] = None,
    limit: Optional[int] = None,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Query metrics (formerly Tauri `metric_query`)."""
    rows = await metric_query(db, device_id, metric, from_ts, to, limit)
    return [{"timestamp": r.timestamp.isoformat(), "value": r.value} for r in rows]


@router.post("/metrics/query-multi", response_model=list[MetricSeries])
async def metric_query_multi_endpoint(
    device_ids: list[str],
    metrics: list[str],
    from_ts: Optional[str] = None,
    to: Optional[str] = None,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Query multiple metrics (formerly Tauri `metric_query_multi`)."""
    rows = await metric_query_multi(db, device_ids, metrics, from_ts, to)
    series: dict[str, dict[str, Any]] = {}
    for r in rows:
        key = f"{r.device_id}:{r.metric}"
        if key not in series:
            series[key] = {"metric": r.metric, "device_id": r.device_id, "points": []}
        series[key]["points"].append(
            {"timestamp": r.timestamp.isoformat(), "value": r.value}
        )
    return list(series.values())


@router.post("/metrics/collect-all", response_model=MetricCollectAllResult)
async def metric_collect_all_endpoint(
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Collect all metrics (formerly Tauri `metric_collect_all`)."""
    count = await metric_collect_all(db)
    return {"recorded": count}
