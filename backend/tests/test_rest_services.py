"""REST service endpoints integration tests (WS-2.18).

Hits the real backend against the real test DB. No fetch stubbing.
"""

import pytest


@pytest.mark.asyncio
async def test_get_rest_service_health(client):
    res = await client.get("/services/health?server_id=srv-test-001")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)


@pytest.mark.asyncio
async def test_get_plex_identity(client):
    res = await client.get("/services/plex/identity?server_id=srv-test-001")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "machine_identifier" in body


@pytest.mark.asyncio
async def test_get_plex_libraries(client):
    res = await client.get("/services/plex/libraries?server_id=srv-test-001")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)
