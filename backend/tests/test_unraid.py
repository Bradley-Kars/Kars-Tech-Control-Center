"""Unraid service tests — fixture-only, no live Unraid calls."""

import asyncio
import json
import os
from pathlib import Path

from core.services.unraid_service import FixtureUnraidClient, RealUnraidClient

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "unraid"


def _load_fixture(name: str) -> dict:
    with open(FIXTURE_DIR / name) as f:
        return json.load(f)


class TestFixtureUnraidClient:
    """FixtureUnraidClient returns recorded fixtures, never calls Unraid."""

    def test_get_array(self):
        client = FixtureUnraidClient({"array": _load_fixture("array_started.json")})
        result = asyncio.run(client.get_array())
        assert result["state"] == "STARTED"
        assert len(result["disks"]) == 2
        assert result["disks"][0]["name"] == "disk1"

    def test_get_shares(self):
        client = FixtureUnraidClient({"shares": _load_fixture("shares.json")})
        result = asyncio.run(client.get_shares())
        assert len(result["shares"]) == 2
        assert result["shares"][0]["name"] == "array"

    def test_get_docker(self):
        client = FixtureUnraidClient({"docker": _load_fixture("docker_running.json")})
        result = asyncio.run(client.get_docker())
        assert len(result["containers"]) == 2
        assert result["containers"][0]["name"] == "nextcloud"

    def test_get_summary(self):
        client = FixtureUnraidClient({"summary": _load_fixture("summary_normal.json")})
        result = asyncio.run(client.get_summary())
        assert result["array"]["state"] == "STARTED"
        assert result["docker"]["containers"][0]["name"] == "nextcloud"
        assert result["updated_at"] == "2026-11-02T10:30:00Z"


class TestRealUnraidClient:
    """RealUnraidClient construction — no live calls."""

    def test_constructs_with_env_token(self):
        os.environ["KTS_UNRAID_TOKEN"] = "test-token-123"
        try:
            client = RealUnraidClient()
            assert client.token == "test-token-123"
            assert client.base_url == "http://localhost:8080"
            assert "Authorization" in client._headers
        finally:
            del os.environ["KTS_UNRAID_TOKEN"]

    def test_constructs_with_explicit_token(self):
        client = RealUnraidClient(base_url="http://unraid.local:8080", token="my-token")
        assert client.token == "my-token"
        assert client.base_url == "http://unraid.local:8080"

    def test_no_token_means_empty_headers(self):
        client = RealUnraidClient()
        assert client.token == ""
        assert client._headers == {}
