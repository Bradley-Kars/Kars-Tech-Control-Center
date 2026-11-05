"""backend/fleet/arr_service unit tests (A2).

Fixture-only and stub-driven: no network, no real *arr server. Placeholder
values only — no real hostnames, emails, or tokens.

Covers one client for Lidarr (/api/v1), Sonarr and Radarr (/api/v3):
system/status, health, queue, wanted/missing, calendar, disk space, library
total, plus "search missing". Auth is the X-Api-Key header from ServiceKeys.
"""

from __future__ import annotations

import sys
import os
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

import httpx
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fleet.arr_service import (  # noqa: E402
    ArrApp,
    ArrClient,
    ArrError,
    RealArrClient,
    FixtureArrClient,
    ArrSystemStatus,
    ArrHealthIssue,
    ArrQueue,
    ArrWantedMissing,
    ArrCalendarEvent,
    ArrDiskSpace,
    ArrLibraryTotal,
    parse_arr_status,
    parse_arr_health,
    parse_arr_health_issues,
    parse_arr_queue,
    parse_arr_wanted_missing,
    parse_arr_calendar,
    parse_arr_disk_space,
    parse_arr_disk_spaces,
    parse_arr_library_total,
)

from tests.stubs.arr import ArrStub  # noqa: E402

API_KEY = "not-a-real-api-key"
WRONG_KEY = "wrong-key"
BASE = "http://<device>.<tailnet>.ts.net:8686"


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

STATUS = ArrSystemStatus(
    version="1.2.3",
    build_time="2026-01-01T00:00:00Z",
    is_debug=False,
    is_production=True,
    is_admin=True,
    startup_path="/config",
    app_data="/config",
    os_name="Linux",
    os_version="6.8.0",
    is_linux=True,
    is_osx=False,
    is_windows=False,
    branch="master",
    authentication="None",
    url_base="/lidarr",
    app_name="Lidarr",
    instance_name="Music",
)

HEALTH = ArrHealthIssue(
    source="DiskSpace",
    issue_type="Warning",
    message="Disk space low",
    wiki_url="https://wiki.servarr.com",
)

QUEUE = ArrQueue(
    page=1,
    page_size=25,
    sort_key="title",
    sort_direction="asc",
    total_records=2,
    records=[{"title": "Track One"}, {"title": "Track Two"}],
)

WANTED = ArrWantedMissing(
    page=1,
    page_size=25,
    sort_key="title",
    sort_direction="asc",
    total_records=3,
    records=[{"title": "Missing One"}],
)

DISK = ArrDiskSpace(path="/media", label="Media", free_space=500 * 1024**3, total_space=1024**4)

CALENDAR = [
    ArrCalendarEvent(title="New Release", start="2026-11-04", end="2026-11-04"),
]

STATUS_RAW = {
    "version": "1.2.3",
    "buildTime": "2026-01-01T00:00:00Z",
    "isDebug": False,
    "isProduction": True,
    "isAdmin": True,
    "startupPath": "/config",
    "appData": "/config",
    "osName": "Linux",
    "osVersion": "6.8.0",
    "isLinux": True,
    "isOsx": False,
    "isWindows": False,
    "branch": "master",
    "authentication": "None",
    "urlBase": "/lidarr",
    "appName": "Lidarr",
    "instanceName": "Music",
}

HEALTH_RAW = {
    "source": "DiskSpace",
    "type": "Warning",
    "message": "Disk space low",
    "wikiUrl": "https://wiki.servarr.com",
}

QUEUE_RAW = {
    "page": 1,
    "pageSize": 25,
    "sortKey": "title",
    "sortDirection": "asc",
    "totalRecords": 2,
    "records": [{"title": "Track One"}, {"title": "Track Two"}],
}

WANTED_RAW = {
    "page": 1,
    "pageSize": 25,
    "sortKey": "title",
    "sortDirection": "asc",
    "totalRecords": 3,
    "records": [{"title": "Missing One"}],
}

CALENDAR_RAW = [
    {"title": "New Release", "start": "2026-11-04", "end": "2026-11-04"},
]

DISK_RAW = {
    "path": "/media",
    "label": "Media",
    "freeSpace": 500 * 1024**3,
    "totalSpace": 1024**4,
}


# ---------------------------------------------------------------------------
# Fixture client
# ---------------------------------------------------------------------------


def _fixture_client(app: ArrApp, fixtures: dict | None = None) -> FixtureArrClient:
    return FixtureArrClient(app, fixtures or {})


def test_fixture_client_defaults_to_empty():
    for app in ArrApp:
        client = _fixture_client(app)
        import asyncio

        assert asyncio.run(client.get_status()) == ArrSystemStatus()
        assert asyncio.run(client.get_health()) == []
        assert asyncio.run(client.get_queue()) == ArrQueue()
        assert asyncio.run(client.get_wanted_missing()) == ArrWantedMissing()
        assert asyncio.run(client.get_calendar()) == []
        assert asyncio.run(client.get_diskspace()) == []
        assert asyncio.run(client.get_library_total()) == ArrLibraryTotal()
        assert asyncio.run(client.search_missing()) is None


def test_fixture_client_returns_stored_status():
    client = _fixture_client(ArrApp.Lidarr, {"status": STATUS})
    import asyncio

    assert asyncio.run(client.get_status()) == STATUS


def test_fixture_client_returns_stored_health():
    client = _fixture_client(ArrApp.Sonarr, {"health": [HEALTH]})
    import asyncio

    assert asyncio.run(client.get_health()) == [HEALTH]


def test_fixture_client_returns_stored_queue():
    client = _fixture_client(ArrApp.Radarr, {"queue": QUEUE})
    import asyncio

    assert asyncio.run(client.get_queue()) == QUEUE


def test_fixture_client_returns_stored_wanted_missing():
    client = _fixture_client(ArrApp.Lidarr, {"wanted_missing": WANTED})
    import asyncio

    assert asyncio.run(client.get_wanted_missing()) == WANTED


def test_fixture_client_returns_stored_calendar():
    client = _fixture_client(ArrApp.Sonarr, {"calendar": CALENDAR})
    import asyncio

    assert asyncio.run(client.get_calendar()) == CALENDAR


def test_fixture_client_returns_stored_diskspace():
    client = _fixture_client(ArrApp.Radarr, {"diskspace": [DISK]})
    import asyncio

    assert asyncio.run(client.get_diskspace()) == [DISK]


def test_fixture_client_returns_stored_library_total():
    client = _fixture_client(ArrApp.Lidarr, {"library_total": 42})
    import asyncio

    assert asyncio.run(client.get_library_total()) == ArrLibraryTotal(count=42)


# ---------------------------------------------------------------------------
# Pure parse functions (no network)
# ---------------------------------------------------------------------------


def test_parse_arr_status():
    assert parse_arr_status(STATUS_RAW, ArrApp.Lidarr) == STATUS


def test_parse_arr_status_empty():
    status = parse_arr_status({}, ArrApp.Lidarr)
    assert status.version == ""
    assert status.app_name == ""


def test_parse_arr_status_not_a_dict():
    assert parse_arr_status("not-json", ArrApp.Lidarr) == ArrSystemStatus()


def test_parse_arr_health():
    assert parse_arr_health(HEALTH_RAW) == HEALTH


def test_parse_arr_health_empty():
    issue = parse_arr_health({})
    assert issue.source == ""
    assert issue.message == ""


def test_parse_arr_health_issues():
    assert parse_arr_health_issues([HEALTH_RAW]) == [HEALTH]


def test_parse_arr_health_issues_empty():
    assert parse_arr_health_issues([]) == []


def test_parse_arr_queue():
    assert parse_arr_queue(QUEUE_RAW) == QUEUE


def test_parse_arr_queue_empty():
    assert parse_arr_queue({}) == ArrQueue()


def test_parse_arr_wanted_missing():
    assert parse_arr_wanted_missing(WANTED_RAW) == WANTED


def test_parse_arr_wanted_missing_empty():
    assert parse_arr_wanted_missing({}) == ArrWantedMissing()


def test_parse_arr_calendar():
    assert parse_arr_calendar(CALENDAR_RAW) == CALENDAR


def test_parse_arr_calendar_empty():
    assert parse_arr_calendar([]) == []


def test_parse_arr_disk_space():
    assert parse_arr_disk_space(DISK_RAW) == DISK


def test_parse_arr_disk_space_empty():
    disk = parse_arr_disk_space({})
    assert disk.path == ""
    assert disk.free_space == 0


def test_parse_arr_disk_spaces():
    assert parse_arr_disk_spaces([DISK_RAW]) == [DISK]


def test_parse_arr_library_total_int():
    assert parse_arr_library_total(7, ArrApp.Lidarr) == ArrLibraryTotal(count=7)


def test_parse_arr_library_total_list():
    assert parse_arr_library_total([1, 2, 3], ArrApp.Sonarr) == ArrLibraryTotal(count=3)


def test_parse_arr_library_total_dict_total_records():
    assert parse_arr_library_total({"totalRecords": 9}, ArrApp.Radarr) == ArrLibraryTotal(count=9)


def test_parse_arr_library_total_unknown():
    assert parse_arr_library_total("garbage", ArrApp.Lidarr) == ArrLibraryTotal()


# ---------------------------------------------------------------------------
# Real client: validation + delegation (no network)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("app", [ArrApp.Lidarr, ArrApp.Sonarr, ArrApp.Radarr])
def test_real_client_requires_base_url(app):
    with pytest.raises(ValueError, match=f"{app.value}_url"):
        RealArrClient(app, base_url="", api_key=API_KEY)


@pytest.mark.parametrize("app", [ArrApp.Lidarr, ArrApp.Sonarr, ArrApp.Radarr])
def test_real_client_requires_api_key(app):
    with pytest.raises(ValueError, match=f"{app.value}_api_key"):
        RealArrClient(app, base_url=BASE, api_key="")


def test_real_client_uses_api_key_header():
    for app in ArrApp:
        client = RealArrClient(app, base_url=BASE, api_key=API_KEY)
        assert client._headers["X-Api-Key"] == API_KEY


def test_real_client_api_version_per_app():
    assert RealArrClient(ArrApp.Lidarr, BASE, API_KEY)._endpoint("system/status") == "/api/v1/system/status"
    assert RealArrClient(ArrApp.Sonarr, BASE, API_KEY)._endpoint("system/status") == "/api/v3/system/status"
    assert RealArrClient(ArrApp.Radarr, BASE, API_KEY)._endpoint("system/status") == "/api/v3/system/status"


def test_real_client_methods_delegate_to_parse_functions():
    client = RealArrClient(ArrApp.Lidarr, BASE, API_KEY)

    async def fake_get(path, params=None):
        if path == "system/status":
            return STATUS_RAW
        if path == "health":
            return [HEALTH_RAW]
        if path == "queue":
            return QUEUE_RAW
        if path == "wanted/missing":
            return WANTED_RAW
        if path == "calendar":
            return CALENDAR_RAW
        if path == "diskspace":
            return [DISK_RAW]
        if path == "artist":
            return [{"title": "a"}, {"title": "b"}]
        return {}

    with patch.object(client, "_get", side_effect=fake_get):
        import asyncio

        status = asyncio.run(client.get_status())
        assert status.version == "1.2.3"
        health = asyncio.run(client.get_health())
        assert len(health) == 1
        queue = asyncio.run(client.get_queue())
        assert queue.total_records == 2
        wanted = asyncio.run(client.get_wanted_missing())
        assert wanted.total_records == 3
        calendar = asyncio.run(client.get_calendar())
        assert len(calendar) == 1
        diskspace = asyncio.run(client.get_diskspace())
        assert len(diskspace) == 1
        total = asyncio.run(client.get_library_total())
        assert total.count == 2


def test_real_client_calendar_passes_next_seven_days():
    client = RealArrClient(ArrApp.Sonarr, BASE, API_KEY)
    captured: dict = {}

    async def fake_get(path, params=None):
        captured["params"] = params
        return []

    with patch.object(client, "_get", side_effect=fake_get):
        import asyncio

        asyncio.run(client.get_calendar())

    today = date.today().isoformat()
    week_later = (date.today() + timedelta(days=7)).isoformat()
    assert captured["params"] == {"start": today, "end": week_later}


def test_real_client_search_missing_posts_command():
    client = RealArrClient(ArrApp.Lidarr, BASE, API_KEY)
    captured: dict = {}

    async def fake_post(path, body=None):
        captured["path"] = path
        captured["body"] = body
        return {}

    with patch.object(client, "_post", side_effect=fake_post):
        import asyncio

        asyncio.run(client.search_missing())

    assert captured["path"] == "command"
    assert captured["body"] == {"name": "MissingAlbumSearch"}


def test_real_client_error_is_redacted_on_401():
    client = RealArrClient(ArrApp.Lidarr, BASE, API_KEY)

    async def fake_get(path, params=None):
        raise ArrError("Lidarr error 401: invalid API key for system/status")

    with patch.object(client, "_get", side_effect=fake_get):
        import asyncio

        with pytest.raises(ArrError, match="401"):
            asyncio.run(client.get_status())


def test_arr_error_is_an_exception():
    assert issubclass(ArrError, Exception)
    err = ArrError("boom")
    assert str(err) == "boom"


def test_arr_client_is_abstract():
    with pytest.raises(TypeError):
        ArrClient(ArrApp.Lidarr)  # type: ignore[abstract]


# ---------------------------------------------------------------------------
# Stub server: success, bad key, timeout, malformed response
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stub_success_returns_fixture_data():
    stub = ArrStub("lidarr", "v1", fixtures={"system/status": STATUS_RAW})
    async with stub:
        client = RealArrClient(ArrApp.Lidarr, stub.url, API_KEY)
        try:
            status = await client.get_status()
            assert status.version == "1.2.3"
            assert status.app_name == "Lidarr"
        finally:
            await client.aclose()


@pytest.mark.asyncio
async def test_stub_bad_key_rejected_with_401():
    stub = ArrStub("lidarr", "v1", fixtures={"system/status": STATUS_RAW}, expected_api_key="correct-key")
    async with stub:
        client = RealArrClient(ArrApp.Lidarr, stub.url, WRONG_KEY)
        try:
            with pytest.raises(ArrError, match="401"):
                await client.get_status()
        finally:
            await client.aclose()


@pytest.mark.asyncio
async def test_stub_matching_key_succeeds():
    stub = ArrStub("lidarr", "v1", fixtures={"health": [HEALTH_RAW]}, expected_api_key="correct-key")
    async with stub:
        client = RealArrClient(ArrApp.Lidarr, stub.url, "correct-key")
        try:
            health = await client.get_health()
            assert len(health) == 1
            assert health[0].message == "Disk space low"
        finally:
            await client.aclose()


def test_stub_timeout_is_arr_error():
    client = RealArrClient(ArrApp.Radarr, BASE, API_KEY)

    with patch.object(
        client._client, "get", AsyncMock(side_effect=httpx.ConnectTimeout("connect timed out"))
    ):
        import asyncio

        with pytest.raises(ArrError, match="timed out"):
            asyncio.run(client.get_status())


def test_stub_malformed_response_is_arr_error():
    client = RealArrClient(ArrApp.Lidarr, BASE, API_KEY)

    class FakeResp:
        status_code = 200
        text = "{not valid json"

        def json(self):
            raise ValueError("Expecting value")

    with patch.object(client._client, "get", AsyncMock(return_value=FakeResp())):
        import asyncio

        with pytest.raises(ArrError, match="parse error"):
            asyncio.run(client.get_status())


__all__ = [
    "ArrApp",
    "ArrClient",
    "ArrError",
    "RealArrClient",
    "FixtureArrClient",
]
