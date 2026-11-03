"""Test that Nextcloud endpoints never forward caller Authorization header to Nextcloud client.

Only KTS_NEXTCLOUD_TOKEN environment variable is used; the caller's bearer
token is ignored. This guards against token leakage from the bridge to
Nextcloud.

KTS_NEXTCLOUD_TOKEN must be set before core.bridge is (re)imported, because
_NEXTCLOUD_TOKEN is read at module import time.
"""

import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import core.bridge  # noqa: E402  (needs env var set in setUp)
from core.auth import TokenTable  # noqa: E402
from core.bridge import create_app  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


class TestNextcloudTokenNotForwarded(unittest.TestCase):
    """Caller's Authorization header must never reach the Nextcloud client.
    Only KTS_NEXTCLOUD_TOKEN env var is used.
    """

    def setUp(self):
        self.captured_token = None
        os.environ["KTS_NEXTCLOUD_TOKEN"] = "env-token-12345"
        importlib.reload(core.bridge)

    def _fake_client(self, token):
        """Fake RealNextcloudClient that captures the token passed to constructor."""
        self.captured_token = token
        mock = MagicMock()
        mock.get_status = AsyncMock(return_value={"version": "mocked"})
        mock.get_capabilities = AsyncMock(return_value={"capabilities": {}})
        mock.get_summary = AsyncMock(return_value={"version": "mocked"})
        return mock

    def _make_app_with_token(self):
        """Create app with a valid bridge token in the token table."""
        tmp = Path(tempfile.mkdtemp(prefix="nextcloud-token-test-"))
        table = TokenTable(tmp / "auth" / "token-table.json")
        tid, secret = table.mint("desktop", actor_id="desktop-1")
        app = create_app(table)
        return app, secret

    def test_caller_authorization_header_not_forwarded(self):
        """Caller's Bearer token must not be forwarded to Nextcloud client.
        Only KTS_NEXTCLOUD_TOKEN env var is used.
        """
        # Reload bridge so module-level _NEXTCLOUD_TOKEN picks up this env var
        # (important when test modules run in any order).
        importlib.reload(core.bridge)
        try:
            app, bridge_token = self._make_app_with_token()
            with patch(
                "core.services.nextcloud_service.RealNextcloudClient",
                side_effect=self._fake_client,
            ):
                client = TestClient(app, base_url="http://localhost")
                response = client.get(
                    "/api/nextcloud/status",
                    headers={
                        "X-API-Token": bridge_token,
                        "Authorization": "Bearer caller-secret-token-999",
                    },
                )
                self.assertEqual(response.status_code, 200)
                # Token used must be KTS_NEXTCLOUD_TOKEN, not caller's header
                self.assertEqual(
                    self.captured_token,
                    "env-token-12345",
                    f"Caller token leaked! Got {self.captured_token!r}",
                )
                self.assertNotEqual(
                    self.captured_token,
                    "caller-secret-token-999",
                    "Caller Authorization header was forwarded to Nextcloud client",
                )
        finally:
            os.environ.pop("KTS_NEXTCLOUD_TOKEN", None)


if __name__ == "__main__":
    unittest.main()
