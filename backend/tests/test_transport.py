"""backend/fleet/transport.py tests.

Fixture-only: never touches the real network. HTTP tests mock httpx;
SSH tests mock asyncssh. Placeholder values only — no real hostnames or
tokens.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from fleet.config import ServerConfig
from fleet.transport import (
    FleetTransport,
    FixtureTransport,
    SshCommandError,
    SshHelper,
    SshResult,
    TransportError,
)


@pytest.fixture(autouse=True)
def _mock_asyncssh():
    """Mock asyncssh so SshHelper can be instantiated without the package."""
    with patch("fleet.transport.asyncssh", MagicMock()):
        yield


class TestFixtureTransport:
    """FixtureTransport replays recorded responses without real network."""

    def test_get_returns_recorded_response(self):
        transport = FixtureTransport(
            responses={
                ("GET", "http://example.com/api"): (
                    200,
                    {"content-type": "application/json"},
                    b'{"status": "ok"}',
                )
            }
        )
        status, headers, body = transport.request("GET", "http://example.com/api")
        assert status == 200
        assert headers["content-type"] == "application/json"
        assert body == b'{"status": "ok"}'

    def test_get_records_request(self):
        transport = FixtureTransport(
            responses={
                ("GET", "http://example.com/api"): (200, {}, b"ok")
            }
        )
        transport.request("GET", "http://example.com/api")
        assert len(transport.requests) == 1
        assert transport.requests[0].method == "GET"
        assert transport.requests[0].url == "http://example.com/api"

    def test_unknown_request_raises(self):
        transport = FixtureTransport(responses={})
        with pytest.raises(TransportError) as ctx:
            transport.request("GET", "http://example.com/unrecorded")
        assert "no fixture" in str(ctx.value).lower()

    def test_add_fixture(self):
        transport = FixtureTransport()
        transport.add_fixture("POST", "http://example.com/api", 201, {}, b"created")
        status, _, body = transport.request("POST", "http://example.com/api")
        assert status == 201
        assert body == b"created"


# ---------------------------------------------------------------------------
# FleetTransport
# ---------------------------------------------------------------------------

class TestFleetTransport:
    """FleetTransport wraps httpx.AsyncClient with timeouts, TLS, retries."""

    def test_init_defaults(self):
        transport = FleetTransport()
        assert transport.timeout_float == 30.0
        assert transport.verify is True
        assert transport.max_retries == 3

    def test_init_from_server_config(self):
        config = ServerConfig(
            id="unraid-main",
            name="Unraid",
            hostname="unraid.<tailnet>.ts.net",
            port=22,
            username="root",
            auth={"type": "password", "password": "not-a-real"},
        )
        transport = FleetTransport.from_config(config)
        assert transport.timeout_float == 30.0
        assert transport.verify is True

    def test_init_from_config_tls_verify_false(self):
        config = ServerConfig(
            id="unraid-main",
            name="Unraid",
            hostname="unraid.<tailnet>.ts.net",
            port=22,
            username="root",
            auth={"type": "password", "password": "not-a-real"},
            service_keys={"tls_verify": "false"},
        )
        transport = FleetTransport.from_config(config)
        assert transport.verify is False

    def test_async_get_success(self):
        transport = FleetTransport()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-type": "application/json"}
        mock_resp.content = b'{"ok": true}'

        mock_client = AsyncMock()
        mock_client.request.return_value = mock_resp
        mock_client.is_closed = False

        mock_client_method = AsyncMock(return_value=mock_client)
        with patch.object(transport, "_client", mock_client_method):
            resp = asyncio.run(transport.get("http://example.com/api"))
            assert resp.status == 200
            assert resp.body == b'{"ok": true}'

    def test_async_get_idempotent_retry_on_transport_error(self):
        """GET retries on httpx.TransportError, succeeds on second attempt."""
        transport = FleetTransport(max_retries=3, retry_backoff=0.01)

        mock_client = AsyncMock()
        mock_client.is_closed = False
        # First call raises, second succeeds
        success_resp = MagicMock()
        success_resp.status_code = 200
        success_resp.headers = {}
        success_resp.content = b"ok"
        mock_client.request.side_effect = [
            httpx.ConnectError("boom"),
            success_resp,
        ]

        mock_client_method = AsyncMock(return_value=mock_client)
        with patch.object(transport, "_client", mock_client_method):
            resp = asyncio.run(transport.get("http://example.com/api"))
            assert resp.status == 200
            assert mock_client.request.call_count == 2

    def test_async_post_no_retry_on_error(self):
        """POST is not idempotent: single attempt, error propagates."""
        transport = FleetTransport(max_retries=3, retry_backoff=0.01)

        mock_client = AsyncMock()
        mock_client.is_closed = False
        mock_client.request.side_effect = httpx.ConnectError("boom")

        mock_client_method = AsyncMock(return_value=mock_client)
        with patch.object(transport, "_client", mock_client_method):
            with pytest.raises(TransportError):
                asyncio.run(transport.request("POST", "http://example.com/api", json={"x": 1}))
            assert mock_client.request.call_count == 1

    def test_aclose(self):
        transport = FleetTransport()
        mock_client = AsyncMock()
        mock_client.is_closed = False
        transport._client = mock_client
        asyncio.run(transport.aclose())
        mock_client.aclose.assert_awaited_once()


# ---------------------------------------------------------------------------
# SshHelper
# ---------------------------------------------------------------------------

class TestSshHelper:
    """SshHelper wraps asyncssh for command execution."""

    def test_init_from_server_config(self):
        config = ServerConfig(
            id="unraid-main",
            name="Unraid",
            hostname="unraid.<tailnet>.ts.net",
            port=22,
            username="root",
            auth={"type": "password", "password": "not-a-real"},
        )
        helper = SshHelper.from_config(config)
        assert helper.hostname == "unraid.<tailnet>.ts.net"
        assert helper.port == 22
        assert helper.username == "root"
        assert helper.auth["type"] == "password"

    def test_init_from_config_key_auth(self):
        config = ServerConfig(
            id="rog-ally",
            name="ROG Ally",
            hostname="server.<tailnet>.ts.net",
            port=22,
            username="user",
            auth={"type": "key", "key_path": "/home/user/.ssh/id_ed25519", "passphrase": None},
        )
        helper = SshHelper.from_config(config)
        assert helper.auth["type"] == "key"
        assert helper.auth["key_path"] == "/home/user/.ssh/id_ed25519"

    def test_run_success(self):
        helper = SshHelper(
            hostname="example.ts.net",
            port=22,
            username="root",
            auth={"type": "password", "password": "pw"},
        )
        mock_result = MagicMock()
        mock_result.exit_status = 0
        mock_result.stdout = b"uptime output"
        mock_result.stderr = b""

        mock_conn = MagicMock()
        mock_conn.run = AsyncMock(return_value=mock_result)
        mock_conn.wait_closed = AsyncMock()

        mock_connect = AsyncMock(return_value=mock_conn)
        with patch.object(helper, "_connect", mock_connect):
            result = asyncio.run(helper.run("uptime"))
            assert isinstance(result, SshResult)
            assert result.exit_code == 0
            assert result.stdout == "uptime output"
            assert result.stderr == ""

    def test_run_failure_raises(self):
        helper = SshHelper(
            hostname="example.ts.net",
            port=22,
            username="root",
            auth={"type": "password", "password": "pw"},
        )
        mock_result = MagicMock()
        mock_result.exit_status = 1
        mock_result.stdout = b""
        mock_result.stderr = b"command not found"

        mock_conn = MagicMock()
        mock_conn.run = AsyncMock(return_value=mock_result)
        mock_conn.wait_closed = AsyncMock()

        mock_connect = AsyncMock(return_value=mock_conn)
        with patch.object(helper, "_connect", mock_connect):
            with pytest.raises(SshCommandError) as ctx:
                asyncio.run(helper.run("badcmd"))
            assert "code 1" in str(ctx.value)
