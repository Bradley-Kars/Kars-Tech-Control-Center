"""AdGuardStub — AdGuard Home /control/* endpoints.

Serves fixture data keyed by endpoint name (e.g. "status", "protection",
"summary"). Maps to /control/{key} GET endpoints.

Auth: basic auth (username/password) — accepted but not validated in the stub.
"""

from __future__ import annotations

from typing import Any

from aiohttp import web

from .base import StubServer

DEFAULT_FIXTURES: dict[str, Any] = {
    "status": {"protection_enabled": True, "running": True},
}


class AdGuardStub(StubServer):
    """AdGuard Home stub."""

    def __init__(self, fixtures: dict[str, Any] | None = None):
        merged = dict(DEFAULT_FIXTURES)
        merged.update(fixtures or {})
        super().__init__(merged)

    def _setup_routes(self) -> None:
        self._get(r"/control/{key}", self._handle_control_get)
        self._post(r"/control/{key}", self._handle_control_post)

    async def _handle_control_get(self, request: web.Request) -> web.Response:
        key = request.match_info["key"]
        if key in self.fixtures:
            return web.json_response(self.fixtures[key])
        return web.json_response(
            {"error": "not found", "key": key}, status=404
        )

    async def _handle_control_post(self, request: web.Request) -> web.Response:
        key = request.match_info["key"]
        body = await request.read()
        self.requests[-1]["body"] = body.decode("utf-8", errors="replace")
        if key in ("dns/enable", "dns/disable"):
            return web.json_response({"result": "ok", "action": key})
        if key in ("clients/add", "clients/delete"):
            return web.json_response({"result": "ok", "action": key})
        return web.json_response(
            {"error": "not found", "key": key}, status=404
        )
