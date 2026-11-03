"""AdGuard service tests — fixture-only, no live AdGuard calls."""

import asyncio
import json
from pathlib import Path

from core.services.adguard_service import FixtureAdGuardClient, RealAdGuardClient

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "adguard"


def _load_fixture(name: str) -> dict:
    with open(FIXTURE_DIR / name) as f:
        return json.load(f)


class TestFixtureAdGuardClient:
    """FixtureAdGuardClient returns recorded fixtures, never calls AdGuard."""

    def test_get_status(self):
        client = FixtureAdGuardClient({"status": _load_fixture("status.json")})
        result = asyncio.run(client.get_status())
        assert result["protection_enabled"] is True

    def test_get_protection(self):
        client = FixtureAdGuardClient({"protection": _load_fixture("protection.json")})
        result = asyncio.run(client.get_protection())
        assert result["enabled"] is True
        assert result["protection_enabled"] is True

    def test_get_summary(self):
        client = FixtureAdGuardClient({"summary": _load_fixture("summary.json")})
        result = asyncio.run(client.get_summary())
        assert result["protection_enabled"] is True
        assert result["updated_at"] == "2026-11-02T10:30:00Z"


class TestRealAdGuardClient:
    """RealAdGuardClient construction — no live calls."""

    def test_constructs_with_env_token(self):
        import os

        os.environ["KTS_ADGUARD_TOKEN"] = "test-token-123"
        try:
            client = RealAdGuardClient()
            assert client.token == "test-token-123"
            assert client.base_url == "http://localhost:3000"
            assert "Authorization" in client._headers
        finally:
            del os.environ["KTS_ADGUARD_TOKEN"]

    def test_constructs_with_explicit_token(self):
        client = RealAdGuardClient(
            base_url="http://adguard.local:3000", token="my-token"
        )
        assert client.token == "my-token"
        assert client.base_url == "http://adguard.local:3000"

    def test_no_token_means_empty_headers(self):
        client = RealAdGuardClient()
        assert client.token == ""
        assert client._headers == {}
