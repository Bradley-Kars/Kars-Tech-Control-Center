"""Nextcloud API client — pluggable client for Nextcloud server monitoring.

Two implementations:
- RealNextcloudClient: makes HTTP requests to the Nextcloud server
- FixtureNextcloudClient: returns recorded fixtures (used in tests)

No secrets are stored in this module. The API token is read from the
KTS_NEXTCLOUD_TOKEN environment variable at construction time.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import Any


class NextcloudClient(ABC):
    """Abstract base class for Nextcloud API clients."""

    @abstractmethod
    async def get_status(self) -> dict:
        """Return Nextcloud status (version, edition)."""
        ...

    @abstractmethod
    async def get_capabilities(self) -> dict:
        """Return Nextcloud capabilities."""
        ...

    @abstractmethod
    async def get_summary(self) -> dict:
        """Return combined status + capabilities summary."""
        ...


class RealNextcloudClient(NextcloudClient):
    """Real Nextcloud API client using HTTP requests."""

    def __init__(
        self,
        base_url: str = "http://localhost:8080",
        token: str | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.token = token or os.environ.get("KTS_NEXTCLOUD_TOKEN", "")
        self._headers = {}
        if self.token:
            self._headers["Authorization"] = f"Bearer {self.token}"

    async def _request(self, path: str) -> dict:
        """Make an authenticated GET request to the Nextcloud API."""
        import aiohttp

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.base_url}{path}",
                headers=self._headers,
            ) as resp:
                if resp.status == 401:
                    raise PermissionError("Invalid Nextcloud API token")
                if resp.status == 403:
                    raise PermissionError("Unauthorized access to Nextcloud API")
                resp.raise_for_status()
                return await resp.json()

    async def get_status(self) -> dict:
        return await self._request("/ocs/v2.php/cloud/status")

    async def get_capabilities(self) -> dict:
        return await self._request("/ocs/v2.php/cloud/capabilities")

    async def get_summary(self) -> dict:
        status = await self.get_status()
        capabilities = await self.get_capabilities()
        from datetime import datetime

        return {
            "version": status.get("ocs", {}).get("data", {}).get("version", ""),
            "edition": status.get("ocs", {}).get("data", {}).get("edition", ""),
            "capabilities": capabilities,
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }


class FixtureNextcloudClient(NextcloudClient):
    """Fixture-based Nextcloud client for testing.

    Returns recorded fixture data instead of making live HTTP requests.
    No live Nextcloud server is required.
    """

    def __init__(self, fixtures: dict[str, dict] | None = None):
        self.fixtures = fixtures or {}

    async def get_status(self) -> dict:
        return self.fixtures.get("status", {})

    async def get_capabilities(self) -> dict:
        return self.fixtures.get("capabilities", {})

    async def get_summary(self) -> dict:
        return self.fixtures.get("summary", {})
