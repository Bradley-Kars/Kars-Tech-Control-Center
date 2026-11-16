"""CRUD operations for Prometheus endpoints (WS-2.15).

Prometheus operations query external Prometheus instances via HTTP.
Without real integration, endpoints return structured placeholder responses.
"""

from typing import Any


async def prom_query_range(
    base_url: str, query: str, start: str, end: str, step: str
) -> list[dict[str, Any]]:
    return []


async def prometheus_health(base_url: str) -> dict[str, Any]:
    return {"healthy": False}


async def poll_prometheus_alerts(base_url: str) -> list[dict[str, Any]]:
    return []


async def poll_meshcentral_status_changes() -> list[dict[str, Any]]:
    return []


async def poll_all_alert_sources(prometheus_base_url: str) -> list[dict[str, Any]]:
    return []
