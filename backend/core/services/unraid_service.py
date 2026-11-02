"""Unraid API client — pluggable client for Unraid server monitoring.

Two implementations:
- RealUnraidClient: makes HTTP requests to the Unraid server
- FixtureUnraidClient: returns recorded fixtures (used in tests)

No secrets are stored in this module. The API token is read from the
KTS_UNRAID_TOKEN environment variable at construction time.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import Any


class UnraidClient(ABC):
    """Abstract base class for Unraid API clients."""

    @abstractmethod
    async def get_array(self) -> dict:
        """Return array status."""
        ...

    @abstractmethod
    async def get_shares(self) -> dict:
        """Return list of shares."""
        ...

    @abstractmethod
    async def get_docker(self) -> dict:
        """Return Docker container status."""
        ...

    @abstractmethod
    async def get_summary(self) -> dict:
        """Return combined array + docker summary."""
        ...


class RealUnraidClient(UnraidClient):
    """Real Unraid API client using HTTP requests."""

    def __init__(
        self,
        base_url: str = "http://localhost:8080",
        token: str | None = None,
    ):
        self.base_url = base_url.rstrip("/")
        self.token = token or os.environ.get("KTS_UNRAID_TOKEN", "")
        self._headers = {}
        if self.token:
            self._headers["Authorization"] = f"Bearer {self.token}"

    async def _request(self, path: str) -> dict:
        """Make an authenticated GET request to the Unraid API."""
        import aiohttp

        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.base_url}{path}",
                headers=self._headers,
            ) as resp:
                if resp.status == 401:
                    raise PermissionError("Invalid Unraid API token")
                if resp.status == 403:
                    raise PermissionError("Unauthorized access to Unraid API")
                resp.raise_for_status()
                return await resp.json()

    async def get_array(self) -> dict:
        return await self._request("/api/v1/array")

    async def get_shares(self) -> dict:
        return await self._request("/api/v1/shares")

    async def get_docker(self) -> dict:
        return await self._request("/api/v1/docker")

    async def get_summary(self) -> dict:
        array = await self.get_array()
        docker = await self.get_docker()
        from datetime import datetime

        return {
            "array": array,
            "docker": docker,
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }


class FixtureUnraidClient(UnraidClient):
    """Fixture-based Unraid client for testing.

    Returns recorded fixture data instead of making live HTTP requests.
    No live Unraid server is required.
    """

    def __init__(self, fixtures: dict[str, dict] | None = None):
        self.fixtures = fixtures or {}

    async def get_array(self) -> dict:
        return self.fixtures.get("array", {})

    async def get_shares(self) -> dict:
        return self.fixtures.get("shares", {})

    async def get_docker(self) -> dict:
        return self.fixtures.get("docker", {})

    async def get_summary(self) -> dict:
        return self.fixtures.get("summary", {})
