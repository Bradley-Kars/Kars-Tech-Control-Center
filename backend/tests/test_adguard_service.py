"""backend/fleet/adguard_service unit tests (P7).

Fixture-only: no network, no real AdGuard Home server. Placeholder values only.
"""

from __future__ import annotations

import sys
import os
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fleet.adguard_service import (  # noqa: E402
    AdGuardError,
    AdGuardClient,
    RealAdGuardClient,
    FixtureAdGuardClient,
    AdGuardStatus,
    AdGuardStats,
    AdGuardQueryLog,
    AdGuardQueryLogEntry,
    AdGuardDHCP,
    AdGuardDHCPLease,
    AdGuardClientResponse,
    AdGuardClientItem,
    AdGuardFilter,
    parse_adguard_status,
    parse_adguard_stats,
    parse_adguard_query_log,
    parse_adguard_clients,
    parse_adguard_filters,
    parse_adguard_dhcp,
)

STATUS = AdGuardStatus(
    version="0.107.0",
    language="en",
    dns_addresses=["10.0.0.1", "10.0.0.2"],
    dns_port=53,
    http_port=8443,
    protection_disabled_duration=0,
    start_time=1730000000.0,
    protection_enabled=True,
    dhcp_available=True,
    running=True,
    config_hash="abc123",
)

STATS = AdGuardStats(
    dns_queries={
        "total": 10000,
        "blocked": 2500,
        "replaced": 100,
        "safe_browsing": 50,
        "parental": 25,
        "avg_processing_time": 12.5,
    },
    blocked={"domains": 2000, "clients": 5},
    replaced={"domains": 80, "clients": 3},
    clients={"total": 50, "active": 45},
    filters={"total": 10, "enabled": 9},
)

QUERY_LOG = AdGuardQueryLog(
    data=[
        AdGuardQueryLogEntry(
            time="2026-11-03T10:00:00Z",
            client="192.168.1.10",
            status="No error",
            reason=None,
            upstream="8.8.8.8",
            elapsed_ms="15",
            question={"name": "example.com", "type": "A"},
        )
    ],
    limit=50,
    offset=0,
    total=1,
)

DHCP = AdGuardDHCP(
    enabled=True,
    leases=[
        AdGuardDHCPLease(
            ip="192.168.1.50",
            mac="aa:bb:cc:dd:ee:ff",
            hostname="laptop",
            expires=1730000000,
            id="lease-1",
        )
    ],
)


# ---------------------------------------------------------------------------
# Fixture client
# ---------------------------------------------------------------------------


def test_fixture_client_returns_stored_status():
    client = FixtureAdGuardClient({"status": STATUS})
    import asyncio

    result = asyncio.run(client.get_status())
    assert result == STATUS


def test_fixture_client_returns_stored_stats():
    client = FixtureAdGuardClient({"stats": STATS})
    import asyncio

    result = asyncio.run(client.get_stats())
    assert result == STATS


def test_fixture_client_returns_stored_query_log():
    client = FixtureAdGuardClient({"query_log": QUERY_LOG})
    import asyncio

    result = asyncio.run(client.get_query_log())
    assert result == QUERY_LOG


def test_fixture_client_returns_stored_clients():
    clients = AdGuardClientResponse(
        clients=[AdGuardClientItem(name="laptop", ids=["192.168.1.50"])],
        auto_clients=[],
    )
    client = FixtureAdGuardClient({"clients": clients})
    import asyncio

    result = asyncio.run(client.get_clients())
    assert result == clients


def test_fixture_client_returns_stored_filters():
    filters = [AdGuardFilter(name="Default", url="default", enabled=True, rules_count=100)]
    client = FixtureAdGuardClient({"filters": filters})
    import asyncio

    result = asyncio.run(client.get_filters())
    assert result == filters


def test_fixture_client_returns_stored_dhcp():
    client = FixtureAdGuardClient({"dhcp": DHCP})
    import asyncio

    result = asyncio.run(client.get_dhcp())
    assert result == DHCP


def test_fixture_client_defaults_to_empty():
    client = FixtureAdGuardClient()
    import asyncio

    status = asyncio.run(client.get_status())
    assert status.version == ""
    assert status.protection_enabled is False
    stats = asyncio.run(client.get_stats())
    assert stats.dns_queries["total"] == 0
    dhcp = asyncio.run(client.get_dhcp())
    assert dhcp.enabled is False


# ---------------------------------------------------------------------------
# Pure parse functions (no network)
# ---------------------------------------------------------------------------


STATUS_RAW = {
    "version": "0.107.0",
    "language": "en",
    "dns_addresses": ["10.0.0.1", "10.0.0.2"],
    "dns_port": 53,
    "http_port": 8443,
    "protection_disabled_duration": 0,
    "start_time": 1730000000.0,
    "protection_enabled": True,
    "dhcp_available": True,
    "running": True,
    "config_hash": "abc123",
}


def test_parse_adguard_status():
    status = parse_adguard_status(STATUS_RAW)
    assert status == STATUS


def test_parse_adguard_status_defaults():
    status = parse_adguard_status({})
    assert status.version == ""
    assert status.protection_enabled is False


STATS_RAW = {
    "num_dns_queries": 10000,
    "num_blocked_filtering": 2500,
    "num_replaced_safebrowsing": 50,
    "num_replaced_safesearch": 25,
    "num_replaced_parental": 25,
    "avg_processing_time": 12.5,
}


def test_parse_adguard_stats():
    stats = parse_adguard_stats(STATS_RAW)
    assert stats.dns_queries["total"] == 10000
    assert stats.dns_queries["blocked"] == 2500
    assert stats.dns_queries["replaced"] == 100


def test_parse_adguard_stats_empty():
    stats = parse_adguard_stats({})
    assert stats.dns_queries["total"] == 0


QUERY_LOG_RAW = {
    "data": [
        {
            "time": "2026-11-03T10:00:00Z",
            "client": "192.168.1.10",
            "question": {"name": "example.com", "type": "A"},
            "status": "No error",
            "reason": None,
            "upstream": "8.8.8.8",
            "elapsedMs": "15",
        }
    ],
    "limit": 50,
    "offset": 0,
    "total": 1,
}


def test_parse_adguard_query_log():
    log = parse_adguard_query_log(QUERY_LOG_RAW)
    assert log.total == 1
    assert len(log.data) == 1
    assert log.data[0].time == "2026-11-03T10:00:00Z"
    assert log.data[0].client == "192.168.1.10"
    assert log.data[0].question["name"] == "example.com"


def test_parse_adguard_query_log_empty():
    log = parse_adguard_query_log({})
    assert log.total == 0
    assert log.data == []


DHCP_RAW = {
    "enabled": True,
    "leases": [
        {
            "ip": "192.168.1.50",
            "mac": "aa:bb:cc:dd:ee:ff",
            "hostname": "laptop",
            "expires": 1730000000,
            "id": "lease-1",
        }
    ],
}


def test_parse_adguard_dhcp():
    dhcp = parse_adguard_dhcp(DHCP_RAW)
    assert dhcp.enabled is True
    assert len(dhcp.leases) == 1
    assert dhcp.leases[0].ip == "192.168.1.50"


def test_parse_adguard_dhcp_empty():
    dhcp = parse_adguard_dhcp({})
    assert dhcp.enabled is False
    assert dhcp.leases == []


# ---------------------------------------------------------------------------
# Real client: validation + delegation (no network)
# ---------------------------------------------------------------------------


def test_real_client_requires_base_url():
    with pytest.raises(ValueError, match="adguard_url"):
        RealAdGuardClient(base_url="", username="alice", password="pw")


def test_real_client_methods_delegate_to_parse_functions():
    client = RealAdGuardClient(
        base_url="http://<device>.<tailnet>.ts.net",
        username="alice",
        password="not-a-real-password",
    )

    async def fake_request(path):
        if path == "status":
            return STATUS_RAW
        if path == "stats":
            return STATS_RAW
        if path == "dhcp/status":
            return DHCP_RAW
        return {}

    with patch.object(client, "_request", side_effect=fake_request):
        import asyncio

        status = asyncio.run(client.get_status())
        assert status.version == "0.107.0"
        stats = asyncio.run(client.get_stats())
        assert stats.dns_queries["total"] == 10000
        dhcp = asyncio.run(client.get_dhcp())
        assert dhcp.enabled is True


def test_real_client_uses_basic_auth():
    client = RealAdGuardClient(
        base_url="http://<device>.<tailnet>.ts.net",
        username="alice",
        password="not-a-real-password",
    )
    assert client._auth == ("alice", "not-a-real-password")


def test_adguard_error_is_an_exception():
    assert issubclass(AdGuardError, Exception)
    err = AdGuardError("boom")
    assert str(err) == "boom"


def test_adguard_client_is_abstract():
    with pytest.raises(TypeError):
        AdGuardClient()
