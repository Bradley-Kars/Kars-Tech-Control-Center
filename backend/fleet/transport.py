"""backend/fleet/transport.py — async HTTP client wrapper and SSH helper.

Async HTTP transport built on httpx (already a project dependency):
- timeouts, TLS verify options from server config
- retries on idempotent GETs
- FixtureTransport for tests that replays recorded responses (no real network)

SSH helper built on asyncssh (one new dependency, logged in this module):
- password and key-based auth from ServerConfig
- command execution with exit code, stdout, stderr

Fixture-only: tests never touch the real network.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any

import httpx

try:
    import asyncssh
except ImportError:  # pragma: no cover - asyncssh is optional until needed
    asyncssh = None  # type: ignore[assignment]

from .config import ServerConfig


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class TransportError(Exception):
    """Base error for transport failures."""


class SshCommandError(TransportError):
    """Raised when an SSH command exits non-zero."""


# ---------------------------------------------------------------------------
# Recorded request (for FixtureTransport introspection)
# ---------------------------------------------------------------------------


@dataclass
class RecordedRequest:
    method: str
    url: str
    headers: dict[str, str] = field(default_factory=dict)
    content: bytes | None = None


# ---------------------------------------------------------------------------
# FixtureTransport — replay recorded responses (no network)
# ---------------------------------------------------------------------------


class FixtureTransport:
    """In-memory transport that replays recorded responses.

    Used by tests to avoid real network calls. Records every request made
    so tests can assert on what was sent.
    """

    def __init__(self, responses: dict[tuple[str, str], tuple[int, dict[str, str], bytes]] | None = None):
        self.responses: dict[tuple[str, str], tuple[int, dict[str, str], bytes]] = (
            dict(responses) if responses else {}
        )
        self.requests: list[RecordedRequest] = []

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        content: bytes | None = None,
        json: Any = None,
    ) -> tuple[int, dict[str, str], bytes]:
        """Return the recorded (status, headers, body) for (method, url).

        Raises TransportError when no fixture is recorded for the request.
        """
        key = (method.upper(), url)
        recorded = RecordedRequest(
            method=method.upper(),
            url=url,
            headers=dict(headers or {}),
            content=content,
        )
        if json is not None:
            recorded.content = json.dumps(json).encode("utf-8")
            if "content-type" not in (headers or {}):
                recorded.headers["content-type"] = "application/json"
        self.requests.append(recorded)

        if key not in self.responses:
            raise TransportError(
                f"FixtureTransport: no fixture recorded for {method} {url}"
            )

        status, resp_headers, body = self.responses[key]
        return status, dict(resp_headers), body

    def add_fixture(
        self,
        method: str,
        url: str,
        status: int,
        headers: dict[str, str] | None = None,
        body: bytes = b"",
    ) -> None:
        """Record a response for (method, url)."""
        self.responses[(method.upper(), url)] = (status, dict(headers or {}), body)


# ---------------------------------------------------------------------------
# FleetTransport — async httpx wrapper
# ---------------------------------------------------------------------------


@dataclass
class HttpResponse:
    status: int
    headers: dict[str, str]
    body: bytes


class FleetTransport:
    """Async HTTP client wrapper with timeouts, TLS options, and idempotent retries.

    GET requests are retried on transient network errors (idempotent).
    POST/PUT/DELETE/PATCH are attempted once.
    """

    IDEMPOTENT_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

    def __init__(
        self,
        *,
        timeout: float = 30.0,
        verify: bool = True,
        max_retries: int = 3,
        retry_backoff: float = 0.5,
    ):
        self.timeout_float = timeout
        self.timeout = httpx.Timeout(timeout)
        self.verify = verify
        self.max_retries = max_retries
        self.retry_backoff = retry_backoff
        self._client: httpx.AsyncClient | None = None

    @classmethod
    def from_config(cls, config: ServerConfig) -> "FleetTransport":
        """Build a FleetTransport from a ServerConfig.

        TLS verification defaults to True; servers may opt out via
        service_keys.tls_verify == "false".
        """
        verify = True
        extra = getattr(config.service_keys, "model_extra", None) or {}
        tls = extra.get("tls_verify")
        if isinstance(tls, str):
            verify = tls.lower() not in ("false", "0", "no")
        return cls(timeout=30.0, verify=verify, max_retries=3)

    async def _client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self.timeout,
                verify=self.verify,
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def __aenter__(self) -> "FleetTransport":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.aclose()

    def _is_idempotent(self, method: str) -> bool:
        return method.upper() in self.IDEMPOTENT_METHODS

    async def request(
        self,
        method: str,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        content: bytes | None = None,
        data: Any = None,
        json: Any = None,
        params: dict[str, Any] | None = None,
    ) -> HttpResponse:
        """Perform an HTTP request, retrying idempotent methods on transient error."""
        client = await self._client()
        method_up = method.upper()
        last_error: Exception | None = None

        for attempt in range(self.max_retries):
            try:
                resp = await client.request(
                    method=method_up,
                    url=url,
                    headers=headers,
                    content=content,
                    data=data,
                    json=json,
                    params=params,
                )
                return HttpResponse(
                    status=resp.status_code,
                    headers={k: v for k, v in resp.headers.items()},
                    body=resp.content,
                )
            except (httpx.TransportError, httpx.NetworkError, asyncio.TimeoutError) as exc:
                last_error = exc
                if not self._is_idempotent(method_up) or attempt == self.max_retries - 1:
                    raise TransportError(
                        f"{method_up} {url} failed after {attempt + 1} attempt(s): {exc}"
                    ) from exc
                await asyncio.sleep(self.retry_backoff * (attempt + 1))

        # Unreachable: the loop either returns or raises.
        raise TransportError(f"{method_up} {url} failed: {last_error}")  # type: ignore[unreachable]

    async def get(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
    ) -> HttpResponse:
        """Convenience: idempotent GET with retries."""
        return await self.request("GET", url, headers=headers, params=params)


# ---------------------------------------------------------------------------
# Module-level async convenience functions (backed by FixtureTransport in tests)
# ---------------------------------------------------------------------------

_transport: FleetTransport | None = None


def _default_transport() -> FleetTransport:
    global _transport
    if _transport is None:
        _transport = FleetTransport()
    return _transport


async def async_get(url: str, **kwargs: Any) -> tuple[int, dict[str, str], bytes]:
    """Convenience async GET returning (status, headers, body)."""
    transport = _default_transport()
    resp = await transport.get(url, **kwargs)
    return resp.status, resp.headers, resp.body


async def async_request(method: str, url: str, **kwargs: Any) -> tuple[int, dict[str, str], bytes]:
    """Convenience async request returning (status, headers, body)."""
    transport = _default_transport()
    resp = await transport.request(method, url, **kwargs)
    return resp.status, resp.headers, resp.body


# ---------------------------------------------------------------------------
# SshHelper — async SSH command execution
# ---------------------------------------------------------------------------


@dataclass
class SshResult:
    exit_code: int
    stdout: str
    stderr: str


class SshHelper:
    """SSH command execution over asyncssh.

    Supports password and key-based auth from ServerConfig.
    """

    def __init__(
        self,
        *,
        hostname: str,
        port: int = 22,
        username: str = "root",
        auth: dict[str, Any],
    ):
        # asyncssh is an optional dependency: only required when actually
        # connecting, not when constructing or configuring the helper. This
        # keeps the module importable and testable without asyncssh installed.
        self.hostname = hostname
        self.port = port
        self.username = username
        self.auth = auth

    @classmethod
    def from_config(cls, config: ServerConfig) -> "SshHelper":
        """Build an SshHelper from a ServerConfig's auth block."""
        auth = config.auth
        if isinstance(auth, dict):
            auth_type = auth.get("type", "password")
        else:
            auth_type = getattr(auth, "type", "password")

        if auth_type == "key":
            auth_dict = {
                "type": "key",
                "key_path": auth.get("key_path") if isinstance(auth, dict) else auth.key_path,
                "passphrase": auth.get("passphrase") if isinstance(auth, dict) else getattr(auth, "passphrase", None),
            }
        else:
            auth_dict = {
                "type": "password",
                "password": auth.get("password") if isinstance(auth, dict) else auth.password,
            }
        return cls(
            hostname=config.hostname,
            port=config.port,
            username=config.username,
            auth=auth_dict,
        )

    async def _connect(self) -> Any:
        """Open an asyncssh connection (patched in tests)."""
        if asyncssh is None:
            raise TransportError("asyncssh is not installed")
        auth = self.auth
        if auth["type"] == "key":
            return await asyncssh.connect(
                host=self.hostname,
                port=self.port,
                username=self.username,
                client_keys=[auth["key_path"]],
                passphrase=auth.get("passphrase"),
                known_hosts=None,
            )
        return await asyncssh.connect(
            host=self.hostname,
            port=self.port,
            username=self.username,
            password=auth["password"],
            known_hosts=None,
        )

    async def run(
        self,
        command: str,
        *,
        timeout: float = 60.0,
    ) -> SshResult:
        """Run a command over SSH and return exit_code, stdout, stderr.

        Raises SshCommandError on non-zero exit.
        """
        conn = await self._connect()
        try:
            result = await asyncio.wait_for(
                conn.run(command, check=False), timeout=timeout
            )
            stdout = result.stdout.decode("utf-8", errors="replace")
            stderr = result.stderr.decode("utf-8", errors="replace")
            if result.exit_status != 0:
                raise SshCommandError(
                    f"SSH command '{command}' exited with code "
                    f"{result.exit_status}: {stderr.strip() or stdout.strip()}"
                )
            return SshResult(
                exit_code=result.exit_status,
                stdout=stdout,
                stderr=stderr,
            )
        finally:
            conn.close()
            await conn.wait_closed()

    async def __aenter__(self) -> "SshHelper":
        return self

    async def __aexit__(self, *args: Any) -> None:
        pass


__all__ = [
    "FleetTransport",
    "FixtureTransport",
    "HttpResponse",
    "RecordedRequest",
    "SshHelper",
    "SshResult",
    "SshCommandError",
    "TransportError",
    "async_get",
    "async_request",
]
