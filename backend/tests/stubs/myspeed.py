"""MySpeedStub — MySpeed /api/* speed test endpoints.

Serves fixture data keyed by endpoint name (e.g. "tests", "stats", "servers").
Maps to /api/{key} GET endpoints.

The real MySpeed client uses SSH + sqlite3; this stub serves the same data
shape over HTTP so tests never need SSH or a real MySpeed install.
"""

from __future__ import annotations

from typing import Any

from aiohttp import web

from .base import StubServer

DEFAULT_FIXTURES: dict[str, Any] = {
    "tests": [
        {
            "id": 1,
            "timestamp": "2026-11-02T10:30:00Z",
            "download": 100.5,
            "upload": 50.2,
            "ping": 12.0,
            "result_id": "result-abc",
        }
    ],
    "stats": {
        "total_tests": 42,
        "avg_download": 95.0,
        "avg_upload": 48.0,
        "avg_ping": 15.0,
        "latest_test": {
            "result_id": "result-abc",
        },
    },
    "summary": {
        "stats": {
            "total_tests": 42,
            "latest_test": {
                "result_id": "result-abc",
            },
        },
    },
    "servers": [],
}


class MySpeedStub(StubServer):
    """MySpeed stub."""

    def __init__(self, fixtures: dict[str, Any] | None = None):
        merged = dict(DEFAULT_FIXTURES)
        merged.update(fixtures or {})
        super().__init__(merged)

    def _setup_routes(self) -> None:
        self._get(r"/{tail:.*}", self._handle_api_get)

    async def _handle_api_get(self, request: web.Request) -> web.Response:
        tail = request.match_info["tail"]
        # Strip leading "api/" if present
        key = tail[4:] if tail.startswith("api/") else tail
        if key in self.fixtures:
            return web.json_response(self.fixtures[key])
        return web.json_response(
            {"error": "not found", "key": key}, status=404
        )
