"""backend/fleet/myspeed_service.py unit tests (P10).

Fixture-only: no asyncssh, no real MySpeed server, no network.
Placeholder values only — no real hostnames or tokens.
"""

from __future__ import annotations

import sys
import os

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fleet.myspeed_service import (  # noqa: E402
    MySpeedError,
    MySpeedClient,
    RealMySpeedClient,
    FixtureMySpeedClient,
    MySpeedTest,
    MySpeedServer,
    MySpeedStats,
    MySpeedSummary,
    parse_myspeed_test,
    parse_myspeed_server,
    parse_stats_row,
)

STATS_ROW = "935|201.2|95.8|12.3|450.0|120.0|5.0"
TEST_ROW = "1|2026-10-01T10:00:00Z|215.3|98.2|11.5|3|res-abc"
SERVER_ROW = "1|Chicago|http://chicago.example:8080|||0|0"


# ---------------------------------------------------------------------------
# Pure parsing
# ---------------------------------------------------------------------------


def test_parse_myspeed_test():
    test = parse_myspeed_test(TEST_ROW)
    assert test.id == 1
    assert test.timestamp == "2026-10-01T10:00:00Z"
    assert test.download == 215.3
    assert test.upload == 98.2
    assert test.ping == 11.5
    assert test.server_id == 3
    assert test.result_id == "res-abc"


def test_parse_myspeed_test_missing_optional_columns():
    # A row with only the common columns (id, timestamp, download, upload, ping).
    test = parse_myspeed_test("7|2026-10-01T09:00:00Z|100.0|50.0|8.0")
    assert test.id == 7
    assert test.server_id is None
    assert test.result_id is None
    assert test.jitter is None


def test_parse_myspeed_test_empty():
    test = parse_myspeed_test("")
    assert test.id == 0
    assert test.download == 0.0
    assert test.server_id is None


def test_parse_myspeed_server():
    server = parse_myspeed_server(SERVER_ROW)
    assert server.id == 1
    assert server.name == "Chicago"
    assert server.host == "http://chicago.example:8080"
    assert server.location == ""
    assert server.country == ""
    assert server.port == 0
    assert server.secure is False


def test_parse_stats_row():
    stats = parse_stats_row(STATS_ROW)
    assert stats.total_tests == 935
    assert stats.avg_download == 201.2
    assert stats.avg_upload == 95.8
    assert stats.avg_ping == 12.3
    assert stats.max_download == 450.0
    assert stats.max_upload == 120.0
    assert stats.min_ping == 5.0
    assert stats.latest_test is None


def test_parse_stats_row_empty():
    stats = parse_stats_row("")
    assert stats.total_tests == 0
    assert stats.avg_download == 0.0


# ---------------------------------------------------------------------------
# Fixture client
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fixture_client_returns_recorded_data():
    summary = MySpeedSummary(
        stats=MySpeedStats(total_tests=42, avg_download=111.0),
        recent_tests=[MySpeedTest(id=1, download=5.0)],
        servers=[MySpeedServer(id=1, name="Chicago")],
    )
    client = FixtureMySpeedClient(summary=summary)
    got = await client.get_summary(limit=10)
    assert got.stats.total_tests == 42
    assert got.recent_tests[0].download == 5.0
    assert got.servers[0].name == "Chicago"


@pytest.mark.asyncio
async def test_fixture_client_defaults_when_not_given():
    client = FixtureMySpeedClient()
    assert await client.get_stats() == MySpeedStats()
    assert await client.get_recent_tests() == []
    assert await client.get_servers() == []


# ---------------------------------------------------------------------------
# Real client
# ---------------------------------------------------------------------------


def test_real_client_requires_db_path():
    from fleet.transport import SshHelper

    helper = SshHelper(hostname="example", port=22, username="root", auth={"type": "password", "password": "x"})
    with pytest.raises(ValueError, match="myspeed_db_path not configured"):
        RealMySpeedClient(db_path="", helper=helper)


@pytest.mark.asyncio
async def test_real_client_is_abstract_without_methods():
    # MySpeedClient cannot be instantiated directly.
    with pytest.raises(TypeError):
        MySpeedClient()  # type: ignore[abstract]
