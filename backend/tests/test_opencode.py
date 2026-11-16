"""Hermes sidecar endpoints integration tests (WS-2.17).

Hits the real backend against the real test DB. No fetch stubbing.
"""

import pytest


@pytest.mark.asyncio
async def test_opencode_start(client):
    res = await client.post("/opencode/start")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["running"] is True


@pytest.mark.asyncio
async def test_opencode_status(client):
    await client.post("/opencode/stop")  # ensure clean state
    res = await client.get("/opencode/status")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["running"] is False


@pytest.mark.asyncio
async def test_opencode_start_stop(client):
    res = await client.post("/opencode/start")
    assert res.status_code == 200, res.text
    res = await client.post("/opencode/stop")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["running"] is False


@pytest.mark.asyncio
async def test_opencode_session_lifecycle(client):
    # create session
    res = await client.post("/opencode/sessions?title=test")
    assert res.status_code == 200, res.text
    session_id = res.json()["session_id"]

    # send message
    res = await client.post(
        f"/opencode/sessions/{session_id}/message",
        json={"message": "hello", "agent": None},
    )
    assert res.status_code == 200, res.text
    messages = res.json()
    assert len(messages) >= 2

    # get history
    res = await client.get(f"/opencode/sessions/{session_id}/history")
    assert res.status_code == 200, res.text

    # abort session
    res = await client.post(f"/opencode/sessions/{session_id}/abort")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["aborted"] is True


@pytest.mark.asyncio
async def test_opencode_session_not_found(client):
    res = await client.post(
        "/opencode/sessions/nonexistent/message", json={"message": "hello"}
    )
    assert res.status_code == 404, res.text
