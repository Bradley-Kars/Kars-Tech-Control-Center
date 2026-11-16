"""Unraid/storage/system endpoints integration tests (WS-2.3).

Hits the real backend against the real test DB. No fetch stubbing.
Covers parity gaps G1 (reboot_server) and G2 (shutdown_server).
"""

import pytest


@pytest.mark.asyncio
async def test_get_disks(client):
    res = await client.get("/servers/srv-test-001/disks")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)


@pytest.mark.asyncio
async def test_get_smart_data(client):
    res = await client.get("/servers/srv-test-001/disks/sda/smart")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "device" in body


@pytest.mark.asyncio
async def test_get_shares(client):
    res = await client.get("/servers/srv-test-001/shares")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)


@pytest.mark.asyncio
async def test_get_array_info(client):
    res = await client.get("/servers/srv-test-001/array")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_gpu_info(client):
    res = await client.get("/servers/srv-test-001/gpu")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "name" in body


@pytest.mark.asyncio
async def test_get_processes(client):
    res = await client.get("/servers/srv-test-001/processes")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "processes" in body


@pytest.mark.asyncio
async def test_get_syslog(client):
    res = await client.get("/servers/srv-test-001/syslog?lines=50")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_user_scripts(client):
    res = await client.get("/servers/srv-test-001/user-scripts")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_run_user_script(client):
    res = await client.post("/servers/srv-test-001/user-scripts/backup/run")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_plugins(client):
    res = await client.get("/servers/srv-test-001/plugins")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_network_interfaces(client):
    res = await client.get("/servers/srv-test-001/network/interfaces")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_tailscale_peers(client):
    res = await client.get("/servers/srv-test-001/tailscale/peers")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_reboot_server(client):
    """Parity gap G1: reboot_server."""
    res = await client.post("/servers/srv-test-001/reboot")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "message" in body


@pytest.mark.asyncio
async def test_shutdown_server(client):
    """Parity gap G2: shutdown_server."""
    res = await client.post("/servers/srv-test-001/shutdown")
    assert res.status_code == 200, res.text
    body = res.json()
    assert "message" in body
