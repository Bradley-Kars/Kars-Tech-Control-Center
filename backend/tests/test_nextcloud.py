"""Nextcloud service tests — fixture-only, no live Nextcloud calls."""

import asyncio
import json
from pathlib import Path

from core.services.nextcloud_service import FixtureNextcloudClient, RealNextcloudClient

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "nextcloud"


def _load_fixture(name: str) -> dict:
    with open(FIXTURE_DIR / name) as f:
        return json.load(f)


class TestFixtureNextcloudClient:
    """FixtureNextcloudClient returns recorded fixtures, never calls Nextcloud."""

    def test_get_status(self):
        client = FixtureNextcloudClient({"status": _load_fixture("status.json")})
        result = asyncio.run(client.get_status())
        assert result["version"] == "28.0.0"
        assert result["edition"] == "community"

    def test_get_capabilities(self):
        client = FixtureNextcloudClient({"capabilities": _load_fixture("capabilities.json")})
        result = asyncio.run(client.get_capabilities())
        assert "capabilities" in result
        assert result["capabilities"]["core"]["pollinterval"] == 3600

    def test_get_summary(self):
        client = FixtureNextcloudClient({"summary": _load_fixture("summary.json")})
        result = asyncio.run(client.get_summary())
        assert result["version"] == "28.0.0"
        assert result["updated_at"] == "2026-11-02T10:30:00Z"


class TestRealNextcloudClient:
    """RealNextcloudClient construction — no live calls."""

    def test_constructs_with_env_token(self):
        import os

        os.environ["KTS_NEXTCLOUD_TOKEN"] = "test-token-123"
        try:
            client = RealNextcloudClient()
            assert client.token == "test-token-123"
            assert client.base_url == "http://localhost:8080"
            assert "Authorization" in client._headers
        finally:
            del os.environ["KTS_NEXTCLOUD_TOKEN"]

    def test_constructs_with_explicit_token(self):
        client = RealNextcloudClient(
            base_url="http://nextcloud.local:8080", token="my-token"
        )
        assert client.token == "my-token"
        assert client.base_url == "http://nextcloud.local:8080"

    def test_no_token_means_empty_headers(self):
        client = RealNextcloudClient()
        assert client.token == ""
        assert client._headers == {}
