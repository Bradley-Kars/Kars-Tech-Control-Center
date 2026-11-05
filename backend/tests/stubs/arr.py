"""ArrStub — Lidarr/Sonarr/Radarr endpoints for the A2 port.

Serves fixture data keyed by endpoint name (e.g. "system/status", "health").
Maps to /api/{version}/{key} GET endpoints.

Auth: X-Api-Key header — validated against expected_key when set; a mismatch
returns 401 so clients can exercise the bad-key path.
"""

from __future__ import annotations

from typing import Any

from aiohttp import web

from .base import StubServer


class ArrStub(StubServer):
    """Stub for one *arr app (Lidarr v1, Sonarr/Radarr v3)."""

    def __init__(
        self,
        app: str,
        version: str,
        fixtures: dict[str, Any] | None = None,
        expected_api_key: str | None = None,
    ):
        self.app = app
        self.version = version
        self.expected_api_key = expected_api_key
        merged = dict(DEFAULT_FIXTURES.get(app, {}))
        merged.update(fixtures or {})
        super().__init__(merged)

    def _setup_routes(self) -> None:
        self._post(rf"/api/{self.version}/command", self._handle_command_post)
        self._get(rf"/api/{self.version}/{{tail:.*}}", self._handle_api_get)

    async def _require_key(self, request: web.Request) -> bool:
        if self.expected_api_key is None:
            return True
        return request.headers.get("X-Api-Key", "") == self.expected_api_key

    async def _handle_api_get(self, request: web.Request) -> web.Response:
        if not await self._require_key(request):
            return web.json_response({"error": "unauthorized"}, status=401)
        tail = request.match_info["tail"]
        if tail in self.fixtures:
            return web.json_response(self.fixtures[tail])
        return web.json_response(
            {"error": "not found", "key": tail}, status=404
        )

    async def _handle_command_post(self, request: web.Request) -> web.Response:
        if not await self._require_key(request):
            return web.json_response({"error": "unauthorized"}, status=401)
        body = await request.read()
        self.requests[-1]["body"] = body.decode("utf-8", errors="replace")
        return web.json_response({"result": "ok", "command": "received"})


DEFAULT_FIXTURES: dict[str, dict[str, Any]] = {
    "lidarr": {
        "system/status": {
            "version": "1.2.3",
            "appName": "Lidarr",
            "instanceName": "Music",
            "isDebug": False,
            "isProduction": True,
            "isAdmin": True,
        },
        "health": [],
        "queue": {
            "page": 1,
            "pageSize": 25,
            "sortKey": "title",
            "sortDirection": "asc",
            "totalRecords": 0,
            "records": [],
        },
        "wanted/missing": {
            "page": 1,
            "pageSize": 25,
            "sortKey": "title",
            "sortDirection": "asc",
            "totalRecords": 0,
            "records": [],
        },
        "calendar": [],
        "diskspace": [],
        "artist": [],
    },
    "sonarr": {
        "system/status": {
            "version": "4.0.0",
            "appName": "Sonarr",
            "instanceName": "TV",
            "isDebug": False,
            "isProduction": True,
            "isAdmin": True,
        },
        "health": [],
        "queue": {
            "page": 1,
            "pageSize": 25,
            "sortKey": "title",
            "sortDirection": "asc",
            "totalRecords": 0,
            "records": [],
        },
        "wanted/missing": {
            "page": 1,
            "pageSize": 25,
            "sortKey": "title",
            "sortDirection": "asc",
            "totalRecords": 0,
            "records": [],
        },
        "calendar": [],
        "diskspace": [],
        "series": [],
    },
    "radarr": {
        "system/status": {
            "version": "5.0.0",
            "appName": "Radarr",
            "instanceName": "Movies",
            "isDebug": False,
            "isProduction": True,
            "isAdmin": True,
        },
        "health": [],
        "queue": {
            "page": 1,
            "pageSize": 25,
            "sortKey": "title",
            "sortDirection": "asc",
            "totalRecords": 0,
            "records": [],
        },
        "wanted/missing": {
            "page": 1,
            "pageSize": 25,
            "sortKey": "title",
            "sortDirection": "asc",
            "totalRecords": 0,
            "records": [],
        },
        "calendar": [],
        "diskspace": [],
        "movie": [],
    },
}
