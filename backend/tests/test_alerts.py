"""Alerts endpoints integration tests (WS-2.13).

PostgreSQL-backed alert store. Hits the real backend against the real test DB.
No fetch stubbing.
"""

import pytest
from sqlalchemy import text


@pytest.fixture
async def ensure_server(test_engine):
    """Insert srv-test-001 into servers so alert FK constraint passes."""
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
async def test_alert_create(client, ensure_server):
    res = await client.post(
        "/alerts",
        json={
            "severity": "critical",
            "title": "Disk full",
            "message": "Root filesystem at 98%",
            "deviceId": "srv-test-001",
            "source": "manual",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["severity"] == "critical"
    assert body["title"] == "Disk full"
    assert body["id"] is not None


@pytest.mark.asyncio
async def test_alert_list(client, ensure_server):
    await client.post(
        "/alerts",
        json={
            "severity": "warning",
            "title": "High memory",
            "message": "Memory usage at 85%",
            "deviceId": "srv-test-001",
            "source": "manual",
        },
    )
    res = await client.get("/alerts")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)
    assert len(body) >= 1


@pytest.mark.asyncio
async def test_alert_list_filter_by_severity(client, ensure_server):
    res = await client.get("/alerts?severity=critical")
    assert res.status_code == 200, res.text
    body = res.json()
    assert all(a["severity"] == "critical" for a in body)


@pytest.mark.asyncio
async def test_alert_get(client, ensure_server):
    create = await client.post(
        "/alerts",
        json={
            "severity": "info",
            "title": "Info alert",
            "message": "Just info",
            "deviceId": "srv-test-001",
            "source": "manual",
        },
    )
    alert_id = create.json()["id"]
    res = await client.get(f"/alerts/{alert_id}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["id"] == alert_id


@pytest.mark.asyncio
async def test_alert_get_not_found(client):
    res = await client.get("/alerts/999999")
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_alert_acknowledge(client, ensure_server):
    create = await client.post(
        "/alerts",
        json={
            "severity": "warning",
            "title": "To ack",
            "message": "Acknowledge me",
            "deviceId": "srv-test-001",
            "source": "manual",
        },
    )
    alert_id = create.json()["id"]
    res = await client.post(
        f"/alerts/{alert_id}/acknowledge",
        json={"acknowledgedBy": "ops-agent"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["acknowledged"] is True
    assert body["acknowledgedBy"] == "ops-agent"


@pytest.mark.asyncio
async def test_alert_acknowledge_not_found(client):
    res = await client.post(
        "/alerts/999999/acknowledge",
        json={"acknowledgedBy": "ops-agent"},
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_alert_delete(client, ensure_server):
    create = await client.post(
        "/alerts",
        json={
            "severity": "info",
            "title": "To delete",
            "message": "Delete me",
            "deviceId": "srv-test-001",
            "source": "manual",
        },
    )
    alert_id = create.json()["id"]
    res = await client.delete(f"/alerts/{alert_id}")
    assert res.status_code == 200, res.text
    # confirm gone
    res2 = await client.get(f"/alerts/{alert_id}")
    assert res2.status_code == 404


@pytest.mark.asyncio
async def test_alert_acknowledge_all(client, ensure_server):
    res = await client.post(
        "/alerts/acknowledge-all",
        json={"acknowledgedBy": "ops-agent"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert "count" in body


@pytest.mark.asyncio
async def test_alert_auto_ack(client, ensure_server):
    res = await client.post("/alerts/auto-ack")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "count" in body
