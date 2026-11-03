"""Base class for small aiohttp HTTP stub servers used in tests.

Subclasses override :meth:`_setup_routes` to register the endpoints the
service exposes. Every request is appended to :attr:`requests` so tests can
assert on what the client sent. No real network is touched.
"""

from __future__ import annotations

import socket
from typing import Callable

from aiohttp import web


def free_port(host: str = "127.0.0.1") -> int:
    """Return a currently-free TCP port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        return s.getsockname()[1]


class StubServer:
    """A stub HTTP server bound to a free localhost port.

    The server is started with :meth:`start` and stopped with :meth:`stop`.
    While running it answers on :attr:`url`. Subclasses register routes in
    :meth:`_setup_routes`.
    """

    def __init__(
        self,
        fixtures: dict[str, object] | None = None,
        host: str = "127.0.0.1",
        port: int = 0,
    ):
        self.fixtures: dict[str, object] = dict(fixtures or {})
        self.host = host
        self.port = port or free_port(host)
        self._app = web.Application()
        self._runner: web.AppRunner | None = None
        self._site: web.TCPSite | None = None
        self.requests: list[dict[str, object]] = []
        self._setup_routes()

    # ------------------------------------------------------------------ hooks
    def _setup_routes(self) -> None:
        """Register routes on ``self._app``. Override in subclasses."""

    # ------------------------------------------------------------------ routing
    def _record(self, request: web.Request) -> None:
        self.requests.append(
            {
                "method": request.method,
                "path": request.path,
                "query": request.query_string,
            }
        )

    def _get(self, path: str, handler: Callable) -> None:
        self._app.router.add_get(path, self._wrap(handler))

    def _post(self, path: str, handler: Callable) -> None:
        self._app.router.add_post(path, self._wrap(handler))

    def _wrap(self, handler: Callable):
        async def wrapped(request: web.Request):
            self._record(request)
            return await handler(request)

        return wrapped

    # ------------------------------------------------------------------ lifecycle
    async def start(self) -> "StubServer":
        self._runner = web.AppRunner(self._app)
        await self._runner.setup()
        self._site = web.TCPSite(self._runner, self.host, self.port)
        await self._site.start()
        return self

    async def stop(self) -> None:
        if self._runner is not None:
            await self._runner.cleanup()
            self._runner = None
            self._site = None

    async def __aenter__(self) -> "StubServer":
        await self.start()
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.stop()

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}"
