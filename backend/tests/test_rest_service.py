"""backend/fleet/rest_service.py tests — Plex + generic REST health port.

Fixture-only: no real network, no real service credentials. Placeholder
values only — no real hostnames, emails, or tokens.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest
from pydantic import ValidationError

from fleet.config import ServiceKeys
from fleet.rest_service import (
    PlexIdentity,
    PlexLibrary,
    RestService,
    ServiceAuth,
    ServiceConfig,
    ServiceHealth,
    join_url,
    parse_plex_identity,
    parse_plex_libraries,
    probe,
)


# ---------------------------------------------------------------------------
# RestService enum
# ---------------------------------------------------------------------------


class TestRestService:
    def test_all_services_roundtrip(self):
        for service in RestService.ALL:
            assert RestService.parse(service.value) is service

    def test_multiword_ids_are_snake_case(self):
        assert RestService.HomeAssistant.value == "homeassistant"
        assert RestService.MatterHub.value == "matter_hub"
        assert RestService.QBittorrent.value == "qbittorrent"
        assert RestService.parse("matterHub") is None

    def test_every_service_has_label_and_health_path(self):
        for service in RestService.ALL:
            assert service.label()
            assert service.health_path().startswith("/")

    def test_arr_api_versions_not_uniform(self):
        assert RestService.Lidarr.health_path() == "/api/v1/system/status"
        assert RestService.Prowlarr.health_path() == "/api/v1/system/status"
        assert RestService.Radarr.health_path() == "/api/v3/system/status"
        assert RestService.Sonarr.health_path() == "/api/v3/system/status"

    def test_plex_health_path_is_identity(self):
        assert RestService.Plex.health_path() == "/identity"


# ---------------------------------------------------------------------------
# ServiceConfig.from_keys
# ---------------------------------------------------------------------------


def _sk(**overrides: Any) -> ServiceKeys:
    return ServiceKeys(**overrides)


class TestServiceConfig:
    def test_plex_missing_url_raises(self):
        with pytest.raises(ValueError, match="plex_url"):
            ServiceConfig.from_keys(RestService.Plex, _sk())

    def test_blank_credential_counts_as_missing(self):
        with pytest.raises(ValueError, match="plex_url"):
            ServiceConfig.from_keys(RestService.Plex, _sk(plex_url="   ", plex_token="tok"))

    def test_plex_uses_header_auth(self):
        cfg = ServiceConfig.from_keys(
            RestService.Plex,
            _sk(plex_url="http://<device>.<tailnet>.ts.net:32400", plex_token="tok123"),
        )
        assert cfg.base_url == "http://<device>.<tailnet>.ts.net:32400"
        assert cfg.auth == ServiceAuth.header("X-Plex-Token", "tok123")

    def test_invoiceninja_and_homeassistant_use_bearer(self):
        k = _sk(
            invoiceninja_url="http://<device>.<tailnet>.ts.net:8000",
            invoiceninja_token="nin",
            homeassistant_url="http://<device>.<tailnet>.ts.net:8123",
            homeassistant_token="ha",
        )
        for service, want in [
            (RestService.InvoiceNinja, "nin"),
            (RestService.HomeAssistant, "ha"),
        ]:
            cfg = ServiceConfig.from_keys(service, k)
            assert cfg.auth == ServiceAuth.bearer(want)

    def test_arr_apps_share_x_api_key(self):
        cfg = ServiceConfig.from_keys(
            RestService.Radarr,
            _sk(radarr_url="http://<device>.<tailnet>.ts.net:7878", radarr_api_key="rad"),
        )
        assert cfg.auth == ServiceAuth.header("X-Api-Key", "rad")

    def test_shoko_uses_query_param(self):
        cfg = ServiceConfig.from_keys(
            RestService.Shoko,
            _sk(shoko_url="http://<device>.<tailnet>.ts.net:8111", shoko_api_key="shoko-key"),
        )
        assert cfg.auth == ServiceAuth.query("apikey", "shoko-key")

    def test_arr_missing_api_key_raises(self):
        with pytest.raises(ValueError, match="radarr_api_key"):
            ServiceConfig.from_keys(
                RestService.Radarr, _sk(radarr_url="http://<device>.<tailnet>.ts.net:7878")
            )

    def test_basic_auth_services_fall_back_to_none_without_credentials(self):
        cfg = ServiceConfig.from_keys(
            RestService.AdGuard, _sk(adguard_url="https://<device>.<tailnet>.ts.net:8443")
        )
        assert cfg.auth == ServiceAuth.none()

        cfg = ServiceConfig.from_keys(
            RestService.AdGuard,
            _sk(adguard_url="https://<device>.<tailnet>.ts.net:8443", adguard_user="u", adguard_pass="p"),
        )
        assert cfg.auth == ServiceAuth.basic("u", "p")

    def test_url_only_services_need_no_credentials(self):
        k = _sk(
            qbittorrent_url="http://<device>.<tailnet>.ts.net:8085",
            ombi_url="http://<device>.<tailnet>.ts.net:3579",
            flaresolverr_url="http://<device>.<tailnet>.ts.net:8191",
            matter_hub_url="http://<device>.<tailnet>.ts.net:8482",
        )
        for service in [
            RestService.QBittorrent,
            RestService.Ombi,
            RestService.FlareSolverr,
            RestService.MatterHub,
        ]:
            cfg = ServiceConfig.from_keys(service, k)
            assert cfg.auth == ServiceAuth.none()
            assert cfg.base_url


# ---------------------------------------------------------------------------
# URL joining
# ---------------------------------------------------------------------------


class TestJoinUrl:
    def test_never_doubles_or_drops_separator(self):
        assert join_url("http://h:8484", "/api/summary") == "http://h:8484/api/summary"
        assert join_url("http://h:8484/", "/api/summary") == "http://h:8484/api/summary"
        assert join_url("http://h:8484/", "api/summary") == "http://h:8484/api/summary"
        assert join_url("http://h:8484//", "//api/summary") == "http://h:8484/api/summary"
        assert join_url("http://h:3000", "/") == "http://h:3000/"


# ---------------------------------------------------------------------------
# Plex envelope parsing
# ---------------------------------------------------------------------------


class TestPlexParsing:
    def test_parses_plex_identity_envelope(self):
        ident = parse_plex_identity(
            {
                "MediaContainer": {
                    "machineIdentifier": "abc123",
                    "version": "1.43.4.10903-e5521bd8c",
                    "claimed": True,
                }
            }
        )
        assert ident == PlexIdentity(
            machine_identifier="abc123",
            version="1.43.4.10903-e5521bd8c",
            claimed=True,
        )

    def test_missing_plex_envelope_returns_none(self):
        assert parse_plex_identity({"nope": 1}) is None
        assert parse_plex_libraries({"MediaContainer": {}}) is None

    def test_parses_plex_libraries_tolerates_odd_entries(self):
        libs = parse_plex_libraries(
            {
                "MediaContainer": {
                    "Directory": [
                        {
                            "key": "1",
                            "title": "Movies",
                            "type": "movie",
                            "uuid": "u1",
                            "refreshing": False,
                            "updatedAt": 1_700_000_000,
                        },
                        {
                            "key": "2",
                            "title": "TV Shows",
                            "type": "show",
                            "uuid": "u2",
                            "refreshing": True,
                            "updatedAt": 1_700_000_001,
                        },
                        {"key": "3"},
                    ]
                }
            }
        )
        assert len(libs) == 3
        assert libs[0] == PlexLibrary(
            key="1", title="Movies", library_type="movie", uuid="u1",
            scanning=False, updated_at=1_700_000_000,
        )
        assert libs[1].scanning is True
        assert libs[2].title == "Untitled"
        assert libs[2].library_type == "unknown"
        assert libs[2].uuid == ""


# ---------------------------------------------------------------------------
# probe (with a fake client)
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(self, status: int, json_body: Any = None):
        self.status = status
        self._json = json_body

    def is_success(self) -> bool:
        return 200 <= self.status < 300


class _FakeClient:
    """Stand-in for RestServiceClient that returns canned responses."""

    def __init__(self, responses: dict[str, _FakeResponse]):
        self.responses = responses
        self.calls: list[str] = []

    async def get_json(self, path: str) -> Any:
        self.calls.append(path)
        resp = self.responses.get(path)
        if resp is None:
            raise RuntimeError(f"no fixture for {path}")
        if not resp.is_success():
            raise RuntimeError(f"HTTP {resp.status}")
        return resp._json


@pytest.mark.asyncio
async def _probe_unconfigured_coro():
    health = await probe(RestService.FlareSolverr, _sk())
    assert health.reachable is False
    assert health.url == ""
    assert "flaresolverr_url" in health.detail
    assert health.service == "flaresolverr"
    assert health.label == "FlareSolverr"


def test_probe_unconfigured_reports_instead_of_erroring():
    asyncio.run(_probe_unconfigured_coro())


@pytest.mark.asyncio
async def _probe_success_coro():
    client = _FakeClient({"/health": _FakeResponse(200, {"ok": True})})
    health = await probe(
        RestService.FlareSolverr,
        _sk(flaresolverr_url="http://<device>.<tailnet>.ts.net:8191"),
        client=client,
    )
    assert health.reachable is True
    assert health.detail == "OK"
    assert client.calls == ["/health"]


def test_probe_success_reports_reachable():
    asyncio.run(_probe_success_coro())


@pytest.mark.asyncio
async def _probe_auth_rejection_coro():
    client = _FakeClient({"/api/v2/app/version": _FakeResponse(403)})
    health = await probe(
        RestService.QBittorrent,
        _sk(qbittorrent_url="http://<device>.<tailnet>.ts.net:8085"),
        client=client,
    )
    assert health.reachable is True
    assert "credentials rejected or required" in health.detail


def test_probe_auth_rejection_is_reachable():
    asyncio.run(_probe_auth_rejection_coro())


@pytest.mark.asyncio
async def _probe_connection_failure_coro():
    class _BoomClient:
        async def get_json(self, path: str) -> Any:  # noqa: ARG002
            raise RuntimeError("connection refused")

    health = await probe(
        RestService.Plex,
        _sk(plex_url="http://<device>.<tailnet>.ts.net:32400", plex_token="tok"),
        client=_BoomClient(),
    )
    assert health.reachable is False
    assert "connection refused" in health.detail


def test_probe_connection_failure_is_not_reachable():
    asyncio.run(_probe_connection_failure_coro())
