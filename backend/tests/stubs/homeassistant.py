"""HomeAssistantStub — Home Assistant /api/* endpoints.

Serves fixture data keyed by endpoint name (e.g. "states", "config",
"services"). Maps to /api/{key} GET endpoints.

Auth: Bearer token — accepted but not validated.
"""

from __future__ import annotations

from typing import Any

from aiohttp import web

from .base import StubServer

DEFAULT_FIXTURES: dict[str, Any] = {
    "states": [
        {"entity_id": "light.kitchen", "state": "on", "attributes": {}},
        {"entity_id": "sensor.temperature", "state": "21.5", "attributes": {}},
    ],
    "config": {
        "version": "2026.1.0",
        "location_name": "Home",
    },
}


class HomeAssistantStub(StubServer):
    """Home Assistant stub."""

    def __init__(self, fixtures: dict[str, Any] | None = None):
        merged = dict(DEFAULT_FIXTURES)
        merged.update(fixtures or {})
        super().__init__(merged)

    def _setup_routes(self) -> None:
        self._get(r"/api/states/{entity_id}", self._handle_state_get)
        self._get(r"/api/{key}", self._handle_api_get)
        self._post(
            r"/api/services/{domain}/{service}", self._handle_service_post
        )

    async def _handle_api_get(self, request: web.Request) -> web.Response:
        key = request.match_info["key"]
        if key in self.fixtures:
            return web.json_response(self.fixtures[key])
        return web.json_response(
            {"error": "not found", "key": key}, status=404
        )

    async def _handle_state_get(self, request: web.Request) -> web.Response:
        entity_id = request.match_info["entity_id"]
        states = self.fixtures.get("states", [])
        for state in states:
            if state.get("entity_id") == entity_id:
                return web.json_response(state)
        return web.json_response(
            {"error": "not found", "entity_id": entity_id}, status=404
        )

    async def _handle_service_post(self, request: web.Request) -> web.Response:
        domain = request.match_info["domain"]
        service = request.match_info["service"]
        body = await request.read()
        self.requests[-1]["body"] = body.decode("utf-8", errors="replace")
        return web.json_response(
            {"result": "ok", "domain": domain, "service": service}
        )
