"""Tests for GET /api/unraid/parity and GET /api/unraid/disks.

These routes now reuse RealEmhttpClient (built from KTS_UNRAID_TOKEN).
No live Unraid calls are made — the client is patched with a fixture-backed
mock. This also covers the parity/disks routes that previously called
get_parity()/get_disks() on RealUnraidClient, which did not exist.

KTS_UNRAID_TOKEN must be set BEFORE importing core.bridge, because
_UNRAID_TOKEN is read at module import time.
"""

import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

os.environ["KTS_UNRAID_TOKEN"] = "env-token-12345"

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from core.auth import TokenTable  # noqa: E402
from core.bridge import create_app  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


class TestUnraidParityAndDisksRoutes(unittest.TestCase):
    """GET /api/unraid/parity and /api/unraid/disks return client data."""

    def setUp(self):
        os.environ["KTS_UNRAID_TOKEN"] = "env-token-12345"

    def _fake_client(self, *args, **kwargs):
        """Fake RealEmhttpClient that captures the api_key passed to constructor."""
        self.captured_token = kwargs.get("api_key", "")
        mock = MagicMock()
        mock.get_array_check_status = AsyncMock(
            return_value={"status": "active", "sync": 100.0}
        )
        mock.get_disks = AsyncMock(return_value={
            "disks": [{"name": "disk1", "device": "sda", "status": "READY"}]
        })
        return mock

    def _make_app_with_token(self):
        import tempfile
        from pathlib import Path
        tmp = Path(tempfile.mkdtemp(prefix="unraid-route-test-"))
        table = TokenTable(tmp / "auth" / "token-table.json")
        tid, secret = table.mint("desktop", actor_id="desktop-1")
        return create_app(table), secret

    def test_parity_route_returns_client_data(self):
        app, secret = self._make_app_with_token()
        with patch("core.bridge.RealEmhttpClient", side_effect=self._fake_client):
            client = TestClient(app, base_url="http://127.0.0.1")
            response = client.get("/api/unraid/parity",
                                  headers={"X-API-Token": secret})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"status": "active", "sync": 100.0})
            self.assertEqual(self.captured_token, "env-token-12345")

    def test_disks_route_returns_client_data(self):
        app, secret = self._make_app_with_token()
        with patch("core.bridge.RealEmhttpClient", side_effect=self._fake_client):
            client = TestClient(app, base_url="http://127.0.0.1")
            response = client.get("/api/unraid/disks",
                                  headers={"X-API-Token": secret})
            self.assertEqual(response.status_code, 200)
            body = response.json()
            self.assertEqual(len(body["disks"]), 1)
            self.assertEqual(body["disks"][0]["name"], "disk1")
            self.assertEqual(body["disks"][0]["device"], "sda")
