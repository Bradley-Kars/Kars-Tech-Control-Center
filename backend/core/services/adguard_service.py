"""AdGuard Home API client — pluggable client for AdGuard DNS protection monitoring.

Two implementations:
- RealAdGuardClient: makes HTTP requests to the AdGuard Home server
- FixtureAdGuardClient: returns recorded fixtures (used in tests)

No secrets are stored in this module. The API token is read from the
KTS_ADGUARD_TOKEN environment variable at construction time.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import Any


class AdGuardClient(ABC):
    """Abstract base class for AdGuard Home API clients."""

    @abstractmethod
    async def get_status(self) -> dict:
        """Return AdGuard Home status."""
        ...

    @abstractmethod
    async def get_protection(self) -> dict:
        """Return AdGuard Home protection status."""
        ...

    @abstractmethod
    async def get_summary(self) -> dict:
        """Return combined status + protection summary."""
        ...


class RealAdGuardClient(AdGuardClient):
    """Real AdGuard Home API client using HTTP requests."""

    def __init__(
        self,
        base_url: str = "http://localhost:3000",
        token: str | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.token = token or os.environ.get("KTS_ADGUARD_TOKEN", "")
        self._headers = {}
        if self.token:
            self._headers["Authorization"] = f"Bearer {self.token}"

    async def _request(self, path: str) -> dict:
        """Make an authenticated GET request to the AdGuard Home API."""
        import aiohttp

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.base_url}{path}",
                headers=self._headers,
            ) as resp:
                if resp.status == 401:
                    raise PermissionError("Invalid AdGuard API token")
                if resp.status == 403:
                    raise PermissionError("Unauthorized access to AdGuard API")
                resp.raise_for_status()
                return await resp.json()

    async def get_status(self) -> dict:
        return await self._request("/control/status")

    async def get_protection(self) -> dict:
        return await self._request("/control/status")

    async def get_summary(self) -> dict:
        status = await self.get_status()
        protection = await self.get_protection()
        from datetime import datetime

        return {
            "protection_enabled": protection.get("protection_enabled", False),
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }


class FixtureAdGuardClient(AdGuardClient):
    """Fixture-based AdGuard Home client for testing.

    Returns recorded fixture data instead of making live HTTP requests.
    No live AdGuard Home server is required.
    """

    def __init__(self, fixtures: dict[str, dict] | None = None):
        self.fixtures = fixtures or {}

    async def get_status(self) -> dict:
        return self.fixtures.get("status", {})

    async def get_protection(self) -> dict:
        return self.fixtures.get("protection", {})

    async def get_summary(self) -> dict:
        return self.fixtures.get("summary", {})
