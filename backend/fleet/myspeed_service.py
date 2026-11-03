"""backend/fleet/myspeed_service.py — MySpeed port (P10).

Port of src-tauri/src/services/myspeed.rs: speedtest summary, recent tests,
and per-server results over SSH against a local MySpeed SQLite database.
Credentials/tokens never leave the backend; the router redacts any error
before it reaches the client.

Uses SshHelper to run sqlite3 queries against the db_path configured in
server.service_keys.myspeed_db_path. Query output is pipe-delimited
(sqlite3's default separator). Tests replay recorded SSH responses via
FixtureMySpeedClient / patched SshHelper — no real network, no real
MySpeed server, no asyncssh in tests.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field


class MySpeedError(Exception):
    """Raised when a MySpeed query fails."""


class MySpeedClient(ABC):
    """Abstract base for MySpeed API clients."""

    @abstractmethod
    async def get_summary(self, limit: int = 50) -> MySpeedSummary:
        """Return summary: stats + recent tests + servers."""
        ...

    @abstractmethod
    async def get_stats(self) -> MySpeedStats:
        """Return aggregate speedtest stats."""
        ...

    @abstractmethod
    async def get_recent_tests(self) -> list[MySpeedTest]:
        """Return the most recent speedtest results."""
        ...

    @abstractmethod
    async def get_servers(self) -> list[MySpeedServer]:
        """Return configured MySpeed test servers."""
        ...


# ---------------------------------------------------------------------------
# Response shapes (mirror src-tauri/src/services/myspeed.rs)
# ---------------------------------------------------------------------------


@dataclass
class MySpeedTest:
    id: int = 0
    timestamp: str = ""
    download: float = 0.0
    upload: float = 0.0
    ping: float = 0.0
    jitter: float | None = None
    server_id: int | None = None
    result_id: str | None = None


@dataclass
class MySpeedServer:
    id: int = 0
    name: str = ""
    host: str = ""
    location: str = ""
    country: str = ""
    port: int = 0
    secure: bool = False


@dataclass
class MySpeedStats:
    total_tests: int = 0
    avg_download: float = 0.0
    avg_upload: float = 0.0
    avg_ping: float = 0.0
    max_download: float = 0.0
    max_upload: float = 0.0
    min_ping: float = 0.0
    latest_test: str | None = None


@dataclass
class MySpeedSummary:
    stats: MySpeedStats = field(default_factory=MySpeedStats)
    recent_tests: list[MySpeedTest] = field(default_factory=list)
    servers: list[MySpeedServer] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Pure response parsing (network-free, easy to unit test)
# ---------------------------------------------------------------------------


def _as_int(value: str, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _as_float(value: str, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_bool(value: str) -> bool:
    return value.strip().lower() in ("1", "true", "yes", "on")


def parse_myspeed_test(row: str) -> MySpeedTest:
    """Parse one pipe-delimited test row:

    id|timestamp|download|upload|ping|server_id|result_id[,jitter]
    """
    parts = row.split("|") if row else []
    test = MySpeedTest()
    if len(parts) >= 1 and parts[0]:
        test.id = _as_int(parts[0])
    if len(parts) >= 2:
        test.timestamp = parts[1]
    if len(parts) >= 3 and parts[2]:
        test.download = _as_float(parts[2])
    if len(parts) >= 4 and parts[3]:
        test.upload = _as_float(parts[3])
    if len(parts) >= 5 and parts[4]:
        test.ping = _as_float(parts[4])
    if len(parts) >= 6 and parts[5]:
        test.server_id = _as_int(parts[5])
    if len(parts) >= 7 and parts[6]:
        test.result_id = parts[6]
    if len(parts) >= 8 and parts[7]:
        test.jitter = _as_float(parts[7])
    return test


def parse_myspeed_server(row: str) -> MySpeedServer:
    """Parse one pipe-delimited server row:

    id|name|host|location|country|port|secure
    """
    parts = row.split("|") if row else []
    server = MySpeedServer()
    if len(parts) >= 1 and parts[0]:
        server.id = _as_int(parts[0])
    if len(parts) >= 2:
        server.name = parts[1]
    if len(parts) >= 3:
        server.host = parts[2]
    if len(parts) >= 4:
        server.location = parts[3]
    if len(parts) >= 5:
        server.country = parts[4]
    if len(parts) >= 6 and parts[5]:
        server.port = _as_int(parts[5])
    if len(parts) >= 7:
        server.secure = _as_bool(parts[6])
    return server


def parse_stats_row(row: str) -> MySpeedStats:
    """Parse one pipe-delimited stats row:

    total_tests|avg_download|avg_upload|avg_ping|max_download|max_upload|min_ping
    """
    parts = row.split("|") if row else []
    stats = MySpeedStats()
    if len(parts) >= 1 and parts[0]:
        stats.total_tests = _as_int(parts[0])
    if len(parts) >= 2 and parts[1]:
        stats.avg_download = _as_float(parts[1])
    if len(parts) >= 3 and parts[2]:
        stats.avg_upload = _as_float(parts[2])
    if len(parts) >= 4 and parts[3]:
        stats.avg_ping = _as_float(parts[3])
    if len(parts) >= 5 and parts[4]:
        stats.max_download = _as_float(parts[4])
    if len(parts) >= 6 and parts[5]:
        stats.max_upload = _as_float(parts[5])
    if len(parts) >= 7 and parts[6]:
        stats.min_ping = _as_float(parts[6])
    return stats


# ---------------------------------------------------------------------------
# Real client — SSH + sqlite3
# ---------------------------------------------------------------------------


class RealMySpeedClient(MySpeedClient):
    """Real MySpeed client running sqlite3 queries over SSH.

    Mirrors the Tauri ``get_myspeed_*`` commands: each query runs
    ``sqlite3 <db_path> "<sql>"`` over SSH on the target server. The db path
    comes from ``service_keys.myspeed_db_path``.
    """

    def __init__(self, db_path: str, helper) -> None:
        if not db_path or not db_path.strip():
            raise ValueError("myspeed_db_path not configured")
        self.db_path = db_path
        self.helper = helper

    async def _query(self, sql: str) -> str:
        """Run one sqlite3 query over SSH and return the pipe-delimited stdout."""
        result = await self.helper.run(f'sqlite3 {self.db_path} "{sql}"')
        return result.stdout

    async def get_summary(self, limit: int = 50) -> MySpeedSummary:
        stats_row = await self._query(
            "SELECT COUNT(*), AVG(download), AVG(upload), AVG(ping), "
            "MAX(download), MAX(upload), MIN(ping) FROM tests;"
        )
        tests_row = await self._query(
            f"SELECT id, timestamp, download, upload, ping, server_id, "
            f"result_id, jitter FROM tests ORDER BY id DESC LIMIT {limit};"
        )
        servers_row = await self._query(
            "SELECT id, name, host, location, country, port, secure FROM nodes;"
        )
        return MySpeedSummary(
            stats=parse_stats_row(stats_row),
            recent_tests=[parse_myspeed_test(line) for line in tests_row.splitlines() if line.strip()],
            servers=[parse_myspeed_server(line) for line in servers_row.splitlines() if line.strip()],
        )

    async def get_stats(self) -> MySpeedStats:
        row = await self._query(
            "SELECT COUNT(*), AVG(download), AVG(upload), AVG(ping), "
            "MAX(download), MAX(upload), MIN(ping) FROM tests;"
        )
        return parse_stats_row(row)

    async def get_recent_tests(self, limit: int = 50) -> list[MySpeedTest]:
        row = await self._query(
            f"SELECT id, timestamp, download, upload, ping, server_id, "
            f"result_id, jitter FROM tests ORDER BY id DESC LIMIT {limit};"
        )
        return [parse_myspeed_test(line) for line in row.splitlines() if line.strip()]

    async def get_servers(self) -> list[MySpeedServer]:
        row = await self._query(
            "SELECT id, name, host, location, country, port, secure FROM nodes;"
        )
        return [parse_myspeed_server(line) for line in row.splitlines() if line.strip()]


# ---------------------------------------------------------------------------
# Fixture client — recorded responses for tests
# ---------------------------------------------------------------------------


class FixtureMySpeedClient(MySpeedClient):
    """Fixture-based MySpeed client for testing.

    Returns recorded fixture data instead of making live SSH requests.
    No real MySpeed server is required.
    """

    def __init__(self, summary: MySpeedSummary | None = None) -> None:
        self._summary = summary or MySpeedSummary()

    async def get_summary(self, limit: int = 50) -> MySpeedSummary:  # noqa: ARG002
        return self._summary

    async def get_stats(self) -> MySpeedStats:
        return self._summary.stats

    async def get_recent_tests(self, limit: int = 50) -> list[MySpeedTest]:  # noqa: ARG002
        return self._summary.recent_tests

    async def get_servers(self) -> list[MySpeedServer]:
        return self._summary.servers


__all__ = [
    "MySpeedError",
    "MySpeedClient",
    "RealMySpeedClient",
    "FixtureMySpeedClient",
    "MySpeedTest",
    "MySpeedServer",
    "MySpeedStats",
    "MySpeedSummary",
    "parse_myspeed_test",
    "parse_myspeed_server",
    "parse_stats_row",
]
