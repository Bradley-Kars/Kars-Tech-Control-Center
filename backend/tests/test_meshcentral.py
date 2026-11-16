"""MeshCentral endpoints integration tests (WS-2.12).

Hits the real backend against the real test DB. No fetch stubbing.
"""

import pytest


@pytest.mark.asyncio
async def test_meshcentral_list_devices(client):
    res = await client.get("/meshcentral/devices")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)


@pytest.mark.asyncio
async def test_meshcentral_get_device_status(client):
    res = await client.get("/meshcentral/devices/device-001/status")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_meshcentral_execute_batch(client):
    res = await client.post(
        "/meshcentral/execute-batch",
        json={"device_ids": ["d1"], "commands": [{"command": "echo hi"}]},
    )
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_meshcentral_get_terminal_url(client):
    res = await client.get("/meshcentral/devices/device-001/terminal-url")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_meshcentral_get_file_manager_url(client):
    res = await client.get("/meshcentral/devices/device-001/file-manager-url")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_meshcentral_get_enrollment_info(client):
    res = await client.get("/meshcentral/enrollment-info?device_type=unraid")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_meshcentral_sync_fleet(client):
    res = await client.post("/meshcentral/sync-fleet")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_meshcentral_get_fleet_stats(client):
    res = await client.get("/meshcentral/fleet/stats")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_meshcentral_shell_exec(client):
    res = await client.post(
        "/meshcentral/servers/srv-001/shell/exec?command=echo+hi&timeout_secs=10"
    )
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_meshcentral_read_file(client):
    res = await client.get(
        "/meshcentral/servers/srv-001/files/read?path=/etc/hosts"
    )
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_meshcentral_reboot(client):
    res = await client.post("/meshcentral/servers/srv-001/reboot")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_meshcentral_shutdown(client):
    res = await client.post("/meshcentral/servers/srv-001/shutdown")
    assert res.status_code == 200, res.text
