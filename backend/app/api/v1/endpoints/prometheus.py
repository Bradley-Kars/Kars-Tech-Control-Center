"""Prometheus endpoints (WS-2.15).

GET /prometheus/query-range, GET /prometheus/health,
POST /alerts/poll/prometheus|meshcentral|all
"""

from typing import Any

from fastapi import APIRouter

from app.crud.prometheus import (
    poll_all_alert_sources,
    poll_meshcentral_status_changes,
    poll_prometheus_alerts,
    prom_query_range,
    prometheus_health,
)
from app.schemas.prometheus import PromSeries, PrometheusHealth

router = APIRouter()


@router.get("/prometheus/query-range", response_model=list[PromSeries])
async def prom_query_range_endpoint(
    base_url: str,
    query: str,
    start: str,
    end: str,
    step: str,
) -> Any:
    """Query Prometheus range (formerly Tauri `prom_query_range`)."""
    return await prom_query_range(base_url, query, start, end, step)


@router.get("/prometheus/health", response_model=PrometheusHealth)
async def prometheus_health_endpoint(base_url: str) -> Any:
    """Check Prometheus health (formerly Tauri `prometheus_health`)."""
    return await prometheus_health(base_url)


@router.post("/alerts/poll/prometheus")
async def poll_prometheus_alerts_endpoint(base_url: str) -> Any:
    """Poll Prometheus alerts (formerly Tauri `poll_prometheus_alerts`)."""
    return await poll_prometheus_alerts(base_url)


@router.post("/alerts/poll/meshcentral")
async def poll_meshcentral_status_changes_endpoint() -> Any:
    """Poll MeshCentral status changes (formerly Tauri `pollMeshcentralStatusChanges`)."""
    return await poll_meshcentral_status_changes()


@router.post("/alerts/poll/all")
async def poll_all_alert_sources_endpoint(prometheus_base_url: str) -> Any:
    """Poll all alert sources (formerly Tauri `pollAllAlertSources`)."""
    return await poll_all_alert_sources(prometheus_base_url)
