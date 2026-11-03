"""PlexStub — Plex /identity and /library/sections endpoints.

Serves fixture data keyed by endpoint name (e.g. "identity",
"library/sections"). Maps to GET /{path} endpoints.

Auth: X-Plex-Token header — accepted but not validated.
"""

from __future__ import annotations

from typing import Any

from aiohttp import web

from .base import StubServer

DEFAULT_FIXTURES: dict[str, Any] = {
    "identity": {
        "MediaContainer": {
            "machineIdentifier": "plex-test-001",
            "version": "1.43.4.10903-e5521bd8c",
            "claimed": True,
        }
    },
    "library/sections": {
        "MediaContainer": {
            "Directory": [
                {"title": "Movies", "key": "1", "type": "movie"},
                {"title": "TV Shows", "key": "2", "type": "show"},
            ]
        }
    },
}


class PlexStub(StubServer):
    """Plex stub."""

    def __init__(self, fixtures: dict[str, Any] | None = None):
        merged = dict(DEFAULT_FIXTURES)
        merged.update(fixtures or {})
        super().__init__(merged)

    def _setup_routes(self) -> None:
        self._get(r"/{tail:.*}", self._handle_api_get)

    async def _handle_api_get(self, request: web.Request) -> web.Response:
        tail = request.match_info["tail"]
        if tail in self.fixtures:
            return web.json_response(self.fixtures[tail])
        return web.json_response(
            {"error": "not found", "path": tail}, status=404
        )
