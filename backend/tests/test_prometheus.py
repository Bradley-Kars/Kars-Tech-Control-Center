"""Prometheus endpoints integration tests (WS-2.15).

Hits the real backend against the real test DB. No fetch stubbing.
"""

import pytest


@pytest.mark.asyncio
async def test_prom_query_range(client):
    res = await client.get(
        "/prometheus/query-range?base_url=http://localhost:9090&query=up&start=0&end=100&step=15"
    )
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_prometheus_health(client):
    res = await client.get("/prometheus/health?base_url=http://localhost:9090")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_poll_prometheus_alerts(client):
    res = await client.post("/alerts/poll/prometheus?base_url=http://localhost:9090")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_poll_meshcentral_status_changes(client):
    res = await client.post("/alerts/poll/meshcentral")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_poll_all_alert_sources(client):
    res = await client.post("/alerts/poll/all?prometheus_base_url=http://localhost:9090")
    assert res.status_code == 200, res.text
