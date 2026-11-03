"""backend/fleet/emhttp tests — port of src-tauri/src/emhttp/mod.rs.

Fixture-only: never calls a real Unraid server. HTTP tests mock httpx.
Placeholder values only — no real hostnames or tokens.
"""

import asyncio
import os
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from fleet.emhttp import (
    EmhttpClient,
    EmhttpError,
    FixtureEmhttpClient,
    RealEmhttpClient,
)


class TestFixtureEmhttpClient:
    """FixtureEmhttpClient returns recorded fixtures, never calls Unraid."""

    def test_get_array_info(self):
        client = FixtureEmhttpClient({"array_info": {"serverName": "tower"}})
        result = asyncio.run(client.get_array_info())
        assert result == {"serverName": "tower"}

    def test_get_array_check_status(self):
        client = FixtureEmhttpClient(
            {"parity": {"status": "active", "sync": 100.0}}
        )
        result = asyncio.run(client.get_array_check_status())
        assert result["status"] == "active"
        assert result["sync"] == 100.0

    def test_get_shares(self):
        client = FixtureEmhttpClient(
            {"shares": {"shares": [{"name": "array"}, {"name": "media"}]}}
        )
        result = asyncio.run(client.get_shares())
        assert len(result["shares"]) == 2
        assert result["shares"][0]["name"] == "array"

    def test_get_disks(self):
        client = FixtureEmhttpClient(
            {"disks": {"disks": [{"name": "disk1", "device": "sda"}]}}
        )
        result = asyncio.run(client.get_disks())
        assert len(result["disks"]) == 1
        assert result["disks"][0]["name"] == "disk1"

    def test_missing_fixture_defaults_empty(self):
        client = FixtureEmhttpClient({})
        assert asyncio.run(client.get_array_info()) == {}
        assert asyncio.run(client.get_array_check_status()) == {}
        assert asyncio.run(client.get_shares()) == {}
        assert asyncio.run(client.get_disks()) == {}


class TestRealEmhttpClient:
    """RealEmhttpClient construction — no live calls."""

    def test_constructs_with_explicit_url_and_key(self):
        client = RealEmhttpClient(
            base_url="https://tower.local:443", api_key="my-key"
        )
        assert client.base_url == "https://tower.local:443"
        assert client.api_key == "my-key"
        assert client._headers == {"X-Api-Key": "my-key"}

    def test_constructs_from_env_token(self):
        os.environ["KTS_UNRAID_TOKEN"] = "env-token-123"
        try:
            client = RealEmhttpClient(base_url="https://tower.local:443")
            assert client.api_key == "env-token-123"
            assert client._headers == {"X-Api-Key": "env-token-123"}
        finally:
            del os.environ["KTS_UNRAID_TOKEN"]

    def test_no_token_means_empty_headers(self):
        client = RealEmhttpClient(base_url="https://tower.local:443")
        assert client.api_key == ""
        assert client._headers == {}

    def test_base_url_strips_trailing_slash(self):
        client = RealEmhttpClient(
            base_url="https://tower.local:443/", api_key="k"
        )
        assert client.base_url == "https://tower.local:443"


class TestRealEmhttpClientRequests:
    """RealEmhttpClient HTTP behaviour — httpx mocked, no network."""

    @pytest.fixture(autouse=True)
    def _mock_httpx(self):
        with patch("fleet.emhttp.httpx", MagicMock()) as m:
            yield m

    def _make_client(self):
        return RealEmhttpClient(
            base_url="https://tower.local:443", api_key="test-key"
        )

    def test_get_array_info_parses_json(self, _mock_httpx):
        client = self._make_client()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = '{"serverName": "tower"}'
        _mock_httpx.AsyncClient.return_value.__aenter__.return_value.get.return_value = (
            mock_resp
        )
        result = asyncio.run(client.get_array_info())
        assert result == {"serverName": "tower"}
        _mock_httpx.AsyncClient.return_value.__aenter__.return_value.get.assert_called_once()
        call_args = _mock_httpx.AsyncClient.return_value.__aenter__.return_value.get.call_args
        assert "api/v2/system/ini/var" in call_args[0][0]
        assert call_args[1]["headers"]["X-Api-Key"] == "test-key"

    def test_non_success_raises_emhttp_error(self, _mock_httpx):
        client = self._make_client()
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.text = "Unauthorized"
        _mock_httpx.AsyncClient.return_value.__aenter__.return_value.get.return_value = (
            mock_resp
        )
        with pytest.raises(EmhttpError):
            asyncio.run(client.get_shares())
