"""Docker endpoints integration tests (WS-2.2).

Hits the real backend against the real test DB. No fetch stubbing.
"""

import pytest


@pytest.mark.asyncio
async def test_list_docker_containers(client):
    res = await client.get("/servers/srv-test-001/docker/containers")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)


@pytest.mark.asyncio
async def test_docker_start(client):
    res = await client.post("/servers/srv-test-001/docker/containers/webapp/start")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "message" in body


@pytest.mark.asyncio
async def test_docker_stop(client):
    res = await client.post("/servers/srv-test-001/docker/containers/webapp/stop")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "message" in body


@pytest.mark.asyncio
async def test_docker_restart(client):
    res = await client.post("/servers/srv-test-001/docker/containers/webapp/restart")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "message" in body


@pytest.mark.asyncio
async def test_docker_remove(client):
    res = await client.delete("/servers/srv-test-001/docker/containers/webapp")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "message" in body


@pytest.mark.asyncio
async def test_docker_logs(client):
    res = await client.get("/servers/srv-test-001/docker/containers/webapp/logs?lines=50")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "logs" in body


@pytest.mark.asyncio
async def test_docker_container_info(client):
    res = await client.get("/servers/srv-test-001/docker/containers/webapp/info")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "inspect_json" in body
