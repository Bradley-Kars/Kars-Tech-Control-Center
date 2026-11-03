"""LidarrStub — Lidarr /api/v1/* endpoints.

Serves fixture data keyed by endpoint name (e.g. "system/status", "health").
Maps to /api/v1/{key} GET endpoints.

Auth: X-Api-Key header — accepted but not validated.
"""

from __future__ import annotations

from typing import Any

from aiohttp import web

from .base import StubServer

DEFAULT_FIXTURES: dict[str, Any] = {
    "system/status": {
        "appName": "Lidarr",
        "version": "1.0.0",
        "isDebug": False,
        "isProduction": True,
        "isAdmin": True,
        "startupPath": "/",
        "appData": "/data",
        "osName": "Linux",
        "osVersion": "6.0",
        "isLinux": True,
        "isOsx": False,
        "isWindows": False,
        "branch": "master",
        "authentication": "None",
        "urlBase": "",
    },
    "health": [],
}


class LidarrStub(StubServer):
    """Lidarr stub."""

    def __init__(self, fixtures: dict[str, Any] | None = None):
        merged = dict(DEFAULT_FIXTURES)
        merged.update(fixtures or {})
        super().__init__(merged)

    def _setup_routes(self) -> None:
        self._get(r"/api/v1/{tail:.*}", self._handle_api_get)
        self._post(r"/api/v1/command", self._handle_command_post)

    async def _handle_api_get(self, request: web.Request) -> web.Response:
        tail = request.match_info["tail"]
        if tail in self.fixtures:
            return web.json_response(self.fixtures[tail])
        return web.json_response(
            {"error": "not found", "key": tail}, status=404
        )

    async def _handle_command_post(self, request: web.Request) -> web.Response:
        body = await request.read()
        self.requests[-1]["body"] = body.decode("utf-8", errors="replace")
        return web.json_response({"result": "ok", "command": "received"})
