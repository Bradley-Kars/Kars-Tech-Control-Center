"""Phone endpoints integration tests (WS-2.9).

Hits the real backend against the real test DB. No fetch stubbing.
Includes parity gap G3: get_phone_contacts.
"""

import pytest


@pytest.mark.asyncio
async def test_get_phone_device_info(client):
    res = await client.get("/phone/phone-001/device-info")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_phone_battery(client):
    res = await client.get("/phone/phone-001/battery")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_phone_thermal(client):
    res = await client.get("/phone/phone-001/thermal")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_phone_storage(client):
    res = await client.get("/phone/phone-001/storage")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_phone_memory(client):
    res = await client.get("/phone/phone-001/memory")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_phone_cpu(client):
    res = await client.get("/phone/phone-001/cpu")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_phone_screen(client):
    res = await client.get("/phone/phone-001/screen")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_phone_network(client):
    res = await client.get("/phone/phone-001/network")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_phone_apps(client):
    res = await client.get("/phone/phone-001/apps")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_phone_processes(client):
    res = await client.get("/phone/phone-001/processes")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_phone_activity(client):
    res = await client.get("/phone/phone-001/activity")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_get_phone_contacts(client):
    """Parity gap G3: get_phone_contacts."""
    res = await client.get("/phone/phone-001/contacts")
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body, list)


@pytest.mark.asyncio
async def test_get_phone_call_log(client):
    res = await client.get("/phone/phone-001/call-log")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_phone_set_screen(client):
    res = await client.post("/phone/phone-001/screen?on=true")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_phone_set_brightness(client):
    res = await client.post("/phone/phone-001/brightness?value=70")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_phone_volume_up(client):
    res = await client.post("/phone/phone-001/volume/up")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_phone_reboot(client):
    res = await client.post("/phone/phone-001/reboot")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_phone_get_sms_inbox(client):
    res = await client.get("/phone/phone-001/sms/inbox?limit=10")
    assert res.status_code == 200, res.text


@pytest.mark.asyncio
async def test_phone_send_sms(client):
    res = await client.post(
        "/phone/phone-001/sms/send?address=%2B1234567890&body=hello"
    )
    assert res.status_code == 200, res.text
