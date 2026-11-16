"""Metrics endpoints integration tests (WS-2.14).

PostgreSQL-backed time-series store. Hits the real backend against the real test DB.
No fetch stubbing.
"""

import pytest
from sqlalchemy import text


@pytest.fixture
async def ensure_server(test_engine):
    """Insert srv-test-001 into servers so metrics FK constraint passes."""
    async with test_engine.connect() as conn:
        await conn.execute(
            text(
                "INSERT INTO servers (id, name, hostname, port, username, auth_type, device_type, service_keys) "
                "VALUES ('srv-test-001', 'Test Server', 'test.local', 22, 'root', 'password', 'unraid', '{}') "
                "ON CONFLICT (id) DO NOTHING"
            )
        )
        await conn.commit()


@pytest.mark.asyncio
async def test_metric_record(client, ensure_server):
    res = await client.post(
        "/metrics",
        json={
            "device_id": "srv-test-001",
            "metric": "cpu_usage",
            "value": 42.5,
        },
    )
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_metric_query(client, ensure_server):
    await client.post(
        "/metrics",
        json={"device_id": "srv-test-001", "metric": "cpu_usage", "value": 42.5},
    )
    res = await client.get("/metrics/query?device_id=srv-test-001&metric=cpu_usage")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)
    assert len(body) >= 1
    assert body[0]["value"] == 42.5


@pytest.mark.asyncio
async def test_metric_query_multi(client, ensure_server):
    await client.post(
        "/metrics",
        json={"device_id": "srv-test-001", "metric": "memory_usage_pct", "value": 65.0},
    )
    res = await client.post(
        "/metrics/query-multi",
        json={
            "device_ids": ["srv-test-001"],
            "metrics": ["cpu_usage", "memory_usage_pct"],
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)


@pytest.mark.asyncio
async def test_metric_collect_all(client):
    res = await client.post("/metrics/collect-all")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "recorded" in body
