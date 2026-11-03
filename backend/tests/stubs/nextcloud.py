"""NextcloudStub — Nextcloud /ocs/v2.php/* endpoints.

Serves fixture data keyed by endpoint name (e.g. "status", "capabilities").
Maps to /ocs/v2.php/cloud/{key} GET endpoints.

Auth: basic auth + OCS-APIRequest header — accepted but not validated.
"""

from __future__ import annotations

from typing import Any

from aiohttp import web

from .base import StubServer

DEFAULT_FIXTURES: dict[str, Any] = {
    "status": {"version": "28.0.0", "edition": "community"},
    "capabilities": {
        "capabilities": {"core": {"pollinterval": 3600}}
    },
    "info": {
        "version": "28.0.0",
        "versionstring": "28.0.0",
        "edition": "Community",
        "productname": "Nextcloud",
    },
}


class NextcloudStub(StubServer):
    """Nextcloud stub."""

    def __init__(self, fixtures: dict[str, Any] | None = None):
        merged = dict(DEFAULT_FIXTURES)
        merged.update(fixtures or {})
        super().__init__(merged)

    def _setup_routes(self) -> None:
        self._get(r"/ocs/v2.php/cloud/{key}", self._handle_cloud_get)
        self._get(
            r"/ocs/v2.php/apps/serverinfo/api/v1/info", self._handle_info_get
        )
        self._get(
            r"/ocs/v2.php/serverinfo/api/v1/info", self._handle_info_get
        )

    async def _handle_cloud_get(self, request: web.Request) -> web.Response:
        key = request.match_info["key"]
        if key in self.fixtures:
            return web.json_response(
                {
                    "ocs": {
                        "meta": {"ok": 200},
                        "data": self.fixtures[key],
                    }
                }
            )
        return web.json_response(
            {"error": "not found", "key": key}, status=404
        )

    async def _handle_info_get(self, request: web.Request) -> web.Response:
        info = self.fixtures.get(
            "info",
            {
                "version": "28.0.0",
                "versionstring": "28.0.0",
                "edition": "Community",
                "productname": "Nextcloud",
            },
        )
        return web.json_response(
            {
                "ocs": {
                    "meta": {"ok": 200},
                    "data": {"nextcloud": {"system": info}},
                }
            }
        )
