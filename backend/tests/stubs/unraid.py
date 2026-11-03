"""UnraidStub — Unraid emhttp /api/v2/* endpoints.

Serves fixture data keyed by endpoint name (e.g. "array", "docker",
"shares", "summary"). Maps to /api/v2/{path} GET endpoints.

Auth: X-Api-Key header — accepted but not validated.
"""

from __future__ import annotations

from typing import Any

from aiohttp import web

from .base import StubServer

DEFAULT_FIXTURES: dict[str, Any] = {
    "docker": {"containers": [{"name": "nextcloud"}, {"name": "lidarr"}]},
    "disks": {"disks": [{"name": "disk1", "device": "sda", "status": "READY"}]},
    "shares": {"shares": []},
}


class UnraidStub(StubServer):
    """Unraid emhttp stub."""

    ENDPOINT_MAP = {
        "system/ini/var": "docker",
        "system/parity": "docker",
        "docker": "docker",
        "disks": "disks",
        "shares": "shares",
        "system/info": "docker",
        "system/stats": "docker",
        "system/process": "docker",
        "network": "docker",
        "plugin": "docker",
        "log": "docker",
        "notification": "docker",
    }

    def __init__(self, fixtures: dict[str, Any] | None = None):
        merged = dict(DEFAULT_FIXTURES)
        merged.update(fixtures or {})
        super().__init__(merged)

    def _setup_routes(self) -> None:
        self._get(r"/api/v2/{tail:.*}", self._handle_api_get)
        self._post(r"/api/v2/{tail:.*}", self._handle_api_post)

    async def _handle_api_get(self, request: web.Request) -> web.Response:
        tail = request.match_info["tail"]
        key = tail
        if key in self.fixtures:
            return web.json_response(self.fixtures[key])
        mapped = self.ENDPOINT_MAP.get(key)
        if mapped and mapped in self.fixtures:
            return web.json_response(self.fixtures[mapped])
        return web.json_response(
            {"error": "not found", "path": tail}, status=404
        )

    async def _handle_api_post(self, request: web.Request) -> web.Response:
        tail = request.match_info["tail"]
        body = await request.read()
        self.requests[-1]["body"] = body.decode("utf-8", errors="replace")
        if tail in ("system/reboot", "system/shutdown"):
            action = tail.split("/")[-1]
            return web.json_response({"result": "ok", "action": action})
        # Docker container actions: /api/v2/docker/container/{name}
        if tail.startswith("docker/container/"):
            name = tail.split("/")[-1]
            return web.json_response({"name": name, "action": "start"})
        return web.json_response(
            {"error": "not found", "path": tail}, status=404
        )
