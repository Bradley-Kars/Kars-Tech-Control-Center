"""backend/fleet/emhttp.py — Unraid emhttp client (P4).

Port of src-tauri/src/emhttp/mod.rs: array, parity, shares and disks over
Unraid's emhttp HTTP API (/api/v2/*). Built on httpx (already a project
dependency); tests replay recorded fixtures via FixtureEmhttpClient — no
real network, no real Unraid server.

The Rust client connects to ``https://<hostname>:443`` and sends an
``X-Api-Key`` header on every request. The Python port mirrors that: the
API key is passed explicitly or read from the ``KTS_UNRAID_TOKEN``
environment variable.
"""

from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod
from typing import Any

import httpx


class EmhttpError(Exception):
    """Raised when an emhttp API request fails."""


class EmhttpClient(ABC):
    """Abstract base for Unraid emhttp API clients."""

    @abstractmethod
    async def get_array_info(self) -> dict[str, Any]:
        """Return array configuration (GET /api/v2/system/ini/var)."""
        ...

    @abstractmethod
    async def get_array_check_status(self) -> dict[str, Any]:
        """Return parity/check status (GET /api/v2/system/parity)."""
        ...

    @abstractmethod
    async def get_shares(self) -> dict[str, Any]:
        """Return list of shares (GET /api/v2/shares)."""
        ...

    @abstractmethod
    async def get_disks(self) -> dict[str, Any]:
        """Return list of disks (GET /api/v2/disks)."""
        ...


class RealEmhttpClient(EmhttpClient):
    """Real emhttp client using httpx against a Unraid server.

    Connects to ``https://<hostname>:443`` and sends ``X-Api-Key`` on every
    request. The API key is passed explicitly or read from
    ``KTS_UNRAID_TOKEN``.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str | None = None,
        timeout: float = 30.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key or os.environ.get("KTS_UNRAID_TOKEN", "")
        self.timeout = timeout
        self._headers: dict[str, str] = {}
        if self.api_key:
            self._headers["X-Api-Key"] = self.api_key

    async def _request(self, path: str) -> dict[str, Any]:
        """GET ``{base_url}/{path}`` and parse the JSON response."""
        url = f"{self.base_url}/{path}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self._headers)
            if resp.status_code >= 400:
                raise EmhttpError(
                    f"emhttp API error {resp.status_code}: "
                    f"{resp.text[:200]}"
                )
            try:
                return json.loads(resp.text)
            except json.JSONDecodeError as exc:
                raise EmhttpError(
                    f"emhttp API parse error from {path}: {exc}"
                ) from exc

    async def get_array_info(self) -> dict[str, Any]:
        return await self._request("api/v2/system/ini/var")

    async def get_array_check_status(self) -> dict[str, Any]:
        return await self._request("api/v2/system/parity")

    async def get_shares(self) -> dict[str, Any]:
        return await self._request("api/v2/shares")

    async def get_disks(self) -> dict[str, Any]:
        return await self._request("api/v2/disks")


class FixtureEmhttpClient(EmhttpClient):
    """Fixture-based emhttp client for testing.

    Returns recorded fixture data instead of making live HTTP requests.
    No live Unraid server is required.
    """

    def __init__(self, fixtures: dict[str, dict[str, Any]] | None = None):
        self.fixtures = dict(fixtures or {})

    async def get_array_info(self) -> dict[str, Any]:
        return dict(self.fixtures.get("array_info", {}))

    async def get_array_check_status(self) -> dict[str, Any]:
        return dict(self.fixtures.get("parity", {}))

    async def get_shares(self) -> dict[str, Any]:
        return dict(self.fixtures.get("shares", {}))

    async def get_disks(self) -> dict[str, Any]:
        return dict(self.fixtures.get("disks", {}))


__all__ = [
    "EmhttpClient",
    "EmhttpError",
    "FixtureEmhttpClient",
    "RealEmhttpClient",
]
