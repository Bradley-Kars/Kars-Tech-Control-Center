"""backend/fleet/arr_service.py — A2: one client for Lidarr, Sonarr, Radarr.

Port of the original Rust *arr services to a single Python client covering
Lidarr (/api/v1/...), Sonarr and Radarr (/api/v3/...). Auth is the X-Api-Key
header resolved from ServiceKeys (lidarr_api_key / sonarr_api_key /
radarr_api_key) with the base URL from lidarr_url / sonarr_url / radarr_url.

Endpoints per app: system/status, health, queue, wanted/missing (counts and
first page), calendar for the next 7 days, disk space, and the library total.
Read-only plus "search missing" (POST /api/{version}/command).

Built on httpx (already a project dependency); tests replay recorded
responses via FixtureArrClient and the ArrStub — no real network, no real
*arr server. The real client never sends its API key to anything but the
configured *arr base URL, and errors are redacted by the router before they
reach the client.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, timedelta
from enum import StrEnum
from typing import Any

import httpx


class ArrApp(StrEnum):
    """One of the three *arr apps; each exposes its own API version."""

    Lidarr = "lidarr"
    Sonarr = "sonarr"
    Radarr = "radarr"

    def api_version(self) -> str:
        return {"lidarr": "v1", "sonarr": "v3", "radarr": "v3"}[self]

    def label(self) -> str:
        return {"lidarr": "Lidarr", "sonarr": "Sonarr", "radarr": "Radarr"}[self]

    def url_field(self) -> str:
        return f"{self.value}_url"

    def api_key_field(self) -> str:
        return f"{self.value}_api_key"

    def library_endpoint(self) -> str:
        """Endpoint whose list length is the library total."""
        return {"lidarr": "artist", "sonarr": "series", "radarr": "movie"}[self]

    def search_missing_command(self) -> str:
        return {
            "lidarr": "MissingAlbumSearch",
            "sonarr": "MissingSeriesSearch",
            "radarr": "MissingMovieSearch",
        }[self]


class ArrError(Exception):
    """Raised when an *arr API request fails."""


class ArrClient(ABC):
    """Abstract base for *arr API clients."""

    def __init__(self, app: ArrApp):
        self.app = app

    @abstractmethod
    async def get_status(self) -> ArrSystemStatus:
        """Return *arr server status (version, OS, ...)."""
        ...

    @abstractmethod
    async def get_health(self) -> list[ArrHealthIssue]:
        """Return current health issues."""
        ...

    @abstractmethod
    async def get_queue(self) -> ArrQueue:
        """Return the download queue page."""
        ...

    @abstractmethod
    async def get_wanted_missing(self) -> ArrWantedMissing:
        """Return the wanted/missing page."""
        ...

    @abstractmethod
    async def get_calendar(self, days: int = 7) -> list[ArrCalendarEvent]:
        """Return calendar releases for the next `days` days."""
        ...

    @abstractmethod
    async def get_diskspace(self) -> list[ArrDiskSpace]:
        """Return the configured disk space entries."""
        ...

    @abstractmethod
    async def get_library_total(self) -> ArrLibraryTotal:
        """Return the total number of items in the library."""
        ...

    @abstractmethod
    async def search_missing(self) -> None:
        """Trigger a Missing*Search command."""
        ...


# ---------------------------------------------------------------------------
# Response shapes (shared across the three *arr apps)
# ---------------------------------------------------------------------------


@dataclass
class ArrSystemStatus:
    version: str = ""
    build_time: str | None = None
    is_debug: bool = False
    is_production: bool = False
    is_admin: bool = False
    startup_path: str = ""
    app_data: str = ""
    os_name: str = ""
    os_version: str = ""
    is_linux: bool = False
    is_osx: bool = False
    is_windows: bool = False
    branch: str = ""
    authentication: str = ""
    url_base: str = ""
    app_name: str = ""
    instance_name: str = ""


@dataclass
class ArrHealthIssue:
    source: str = ""
    issue_type: str = ""
    message: str = ""
    wiki_url: str | None = None


@dataclass
class ArrQueue:
    page: int = 0
    page_size: int = 0
    sort_key: str = ""
    sort_direction: str = ""
    total_records: int = 0
    records: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ArrWantedMissing:
    page: int = 0
    page_size: int = 0
    sort_key: str = ""
    sort_direction: str = ""
    total_records: int = 0
    records: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ArrCalendarEvent:
    title: str = ""
    start: str = ""
    end: str = ""


@dataclass
class ArrDiskSpace:
    path: str = ""
    label: str = ""
    free_space: int = 0
    total_space: int = 0


@dataclass
class ArrLibraryTotal:
    count: int = 0


# ---------------------------------------------------------------------------
# Pure response parsing (network-free, easy to unit test)
# ---------------------------------------------------------------------------


def _as_list(raw: Any) -> list[Any]:
    return raw if isinstance(raw, list) else []


def _as_str(raw: Any, key: str, default: str = "") -> str:
    if not isinstance(raw, dict):
        return default
    value = raw.get(key, default)
    return str(value) if value is not None else default


def _as_int(raw: Any, key: str, default: int) -> int:
    if not isinstance(raw, dict):
        return default
    try:
        return int(raw.get(key, default))
    except (TypeError, ValueError):
        return default


def _as_bool(raw: Any, key: str, default: bool = False) -> bool:
    if not isinstance(raw, dict):
        return default
    return bool(raw.get(key, default))


def _as_optional_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def parse_arr_status(raw: Any, app: ArrApp) -> ArrSystemStatus:
    """Parse one ``/api/{version}/system/status`` envelope into ArrSystemStatus."""
    if not isinstance(raw, dict):
        return ArrSystemStatus()
    return ArrSystemStatus(
        version=_as_str(raw, "version"),
        build_time=_as_optional_str(raw.get("buildTime")),
        is_debug=_as_bool(raw, "isDebug"),
        is_production=_as_bool(raw, "isProduction"),
        is_admin=_as_bool(raw, "isAdmin"),
        startup_path=_as_str(raw, "startupPath"),
        app_data=_as_str(raw, "appData"),
        os_name=_as_str(raw, "osName"),
        os_version=_as_str(raw, "osVersion"),
        is_linux=_as_bool(raw, "isLinux"),
        is_osx=_as_bool(raw, "isOsx"),
        is_windows=_as_bool(raw, "isWindows"),
        branch=_as_str(raw, "branch"),
        authentication=_as_str(raw, "authentication"),
        url_base=_as_str(raw, "urlBase"),
        app_name=_as_str(raw, "appName"),
        instance_name=_as_str(raw, "instanceName"),
    )


def parse_arr_health(raw: Any) -> ArrHealthIssue:
    """Parse one health issue into ArrHealthIssue."""
    if not isinstance(raw, dict):
        return ArrHealthIssue()
    return ArrHealthIssue(
        source=_as_str(raw, "source"),
        issue_type=_as_str(raw, "type"),
        message=_as_str(raw, "message"),
        wiki_url=_as_optional_str(raw.get("wikiUrl")),
    )


def parse_arr_health_issues(raw: Any) -> list[ArrHealthIssue]:
    """Parse the ``/api/{version}/health`` array into ArrHealthIssue list."""
    return [
        parse_arr_health(e)
        for e in _as_list(raw)
        if isinstance(e, dict)
    ]


def parse_arr_queue(raw: Any) -> ArrQueue:
    """Parse one ``/api/{version}/queue`` envelope into ArrQueue."""
    if not isinstance(raw, dict):
        return ArrQueue()
    return ArrQueue(
        page=_as_int(raw, "page", 0),
        page_size=_as_int(raw, "pageSize", 0),
        sort_key=_as_str(raw, "sortKey"),
        sort_direction=_as_str(raw, "sortDirection"),
        total_records=_as_int(raw, "totalRecords", 0),
        records=raw.get("records") if isinstance(raw.get("records"), list) else [],
    )


def parse_arr_wanted_missing(raw: Any) -> ArrWantedMissing:
    """Parse one ``/api/{version}/wanted/missing`` envelope into ArrWantedMissing."""
    if not isinstance(raw, dict):
        return ArrWantedMissing()
    return ArrWantedMissing(
        page=_as_int(raw, "page", 0),
        page_size=_as_int(raw, "pageSize", 0),
        sort_key=_as_str(raw, "sortKey"),
        sort_direction=_as_str(raw, "sortDirection"),
        total_records=_as_int(raw, "totalRecords", 0),
        records=raw.get("records") if isinstance(raw.get("records"), list) else [],
    )


def parse_arr_calendar_event(raw: Any) -> ArrCalendarEvent:
    """Parse one calendar entry into ArrCalendarEvent."""
    if not isinstance(raw, dict):
        return ArrCalendarEvent()
    return ArrCalendarEvent(
        title=_as_str(raw, "title"),
        start=_as_str(raw, "start"),
        end=_as_str(raw, "end"),
    )


def parse_arr_calendar(raw: Any) -> list[ArrCalendarEvent]:
    """Parse the ``/api/{version}/calendar`` array into ArrCalendarEvent list."""
    return [
        parse_arr_calendar_event(e)
        for e in _as_list(raw)
        if isinstance(e, dict)
    ]


def parse_arr_disk_space(raw: Any) -> ArrDiskSpace:
    """Parse one ``/api/{version}/diskspace`` entry into ArrDiskSpace."""
    if not isinstance(raw, dict):
        return ArrDiskSpace()
    return ArrDiskSpace(
        path=_as_str(raw, "path"),
        label=_as_str(raw, "label"),
        free_space=_as_int(raw, "freeSpace", 0),
        total_space=_as_int(raw, "totalSpace", 0),
    )


def parse_arr_disk_spaces(raw: Any) -> list[ArrDiskSpace]:
    return [
        parse_arr_disk_space(e)
        for e in _as_list(raw)
        if isinstance(e, dict)
    ]


def parse_arr_library_total(raw: Any, app: ArrApp) -> ArrLibraryTotal:
    """Derive the library total from a list endpoint or an explicit count."""
    if isinstance(raw, int):
        return ArrLibraryTotal(count=raw)
    if isinstance(raw, list):
        return ArrLibraryTotal(count=len(raw))
    if isinstance(raw, dict):
        return ArrLibraryTotal(count=_as_int(raw, "totalRecords", 0))
    return ArrLibraryTotal()


# ---------------------------------------------------------------------------
# Real client
# ---------------------------------------------------------------------------


class RealArrClient(ArrClient):
    """Real *arr client using httpx against a local server.

    Sends an X-Api-Key header on every request. Self-signed certs are
    accepted (the norm on this LAN).
    """

    def __init__(self, app: ArrApp, base_url: str, api_key: str, timeout: float = 30.0):
        super().__init__(app)
        if not base_url or not base_url.strip():
            raise ValueError(f"{app.value}_url not configured")
        if not api_key or not api_key.strip():
            raise ValueError(f"{app.value}_api_key not configured")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self._headers: dict[str, str] = {
            "X-Api-Key": api_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        self._client = httpx.AsyncClient(
            timeout=timeout,
            headers=self._headers,
            verify=False,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    def _endpoint(self, path: str) -> str:
        return f"/api/{self.app.api_version()}/{path}"

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        """GET ``{base_url}/api/{version}/{path}`` and return the parsed JSON."""
        url = f"{self.base_url}{self._endpoint(path)}"
        try:
            resp = await self._client.get(url, params=params)
        except httpx.HTTPError as exc:
            raise ArrError(f"{self.app.label()} request error for {path}: {exc}") from exc
        if resp.status_code == 401:
            raise ArrError(f"{self.app.label()} error 401: invalid API key for {path}")
        if resp.status_code >= 400:
            raise ArrError(f"{self.app.label()} error {resp.status_code}: {resp.text[:500]}")
        try:
            return resp.json()
        except ValueError as exc:
            raise ArrError(f"{self.app.label()} parse error from {path}: {exc}") from exc

    async def _post(self, path: str, body: Any = None) -> Any:
        """POST ``{base_url}/api/{version}/{path}`` and return the parsed JSON."""
        url = f"{self.base_url}{self._endpoint(path)}"
        try:
            resp = await self._client.post(url, json=body or {})
        except httpx.HTTPError as exc:
            raise ArrError(f"{self.app.label()} request error for {path}: {exc}") from exc
        if resp.status_code == 401:
            raise ArrError(f"{self.app.label()} error 401: invalid API key for {path}")
        if resp.status_code >= 400:
            raise ArrError(f"{self.app.label()} error {resp.status_code}: {resp.text[:500]}")
        try:
            return resp.json()
        except ValueError:
            return {}

    async def get_status(self) -> ArrSystemStatus:
        return parse_arr_status(await self._get("system/status"), self.app)

    async def get_health(self) -> list[ArrHealthIssue]:
        return parse_arr_health_issues(await self._get("health"))

    async def get_queue(self) -> ArrQueue:
        return parse_arr_queue(await self._get("queue"))

    async def get_wanted_missing(self) -> ArrWantedMissing:
        return parse_arr_wanted_missing(await self._get("wanted/missing"))

    async def get_calendar(self, days: int = 7) -> list[ArrCalendarEvent]:
        start = date.today()
        end = start + timedelta(days=days)
        return parse_arr_calendar(
            await self._get(
                "calendar",
                {"start": start.isoformat(), "end": end.isoformat()},
            )
        )

    async def get_diskspace(self) -> list[ArrDiskSpace]:
        return parse_arr_disk_spaces(await self._get("diskspace"))

    async def get_library_total(self) -> ArrLibraryTotal:
        return parse_arr_library_total(
            await self._get(self.app.library_endpoint()), self.app
        )

    async def search_missing(self) -> None:
        await self._post(
            "command",
            {"name": self.app.search_missing_command()},
        )


# ---------------------------------------------------------------------------
# Fixture client
# ---------------------------------------------------------------------------


class FixtureArrClient(ArrClient):
    """Fixture-based *arr client for testing.

    Returns recorded fixture data instead of making live HTTP requests.
    No live *arr server is required.
    """

    def __init__(self, app: ArrApp, fixtures: dict[str, Any] | None = None):
        super().__init__(app)
        self.fixtures = dict(fixtures or {})

    async def get_status(self) -> ArrSystemStatus:
        return _fixture_dataclass(self.fixtures.get("status"), ArrSystemStatus)

    async def get_health(self) -> list[ArrHealthIssue]:
        raw = self.fixtures.get("health", [])
        return [
            h if isinstance(h, ArrHealthIssue) else parse_arr_health(h)
            for h in raw
            if isinstance(h, (ArrHealthIssue, dict))
        ]

    async def get_queue(self) -> ArrQueue:
        return _fixture_dataclass(self.fixtures.get("queue"), ArrQueue)

    async def get_wanted_missing(self) -> ArrWantedMissing:
        return _fixture_dataclass(self.fixtures.get("wanted_missing"), ArrWantedMissing)

    async def get_calendar(self, days: int = 7) -> list[ArrCalendarEvent]:
        raw = self.fixtures.get("calendar", [])
        return [
            e if isinstance(e, ArrCalendarEvent) else parse_arr_calendar_event(e)
            for e in raw
            if isinstance(e, (ArrCalendarEvent, dict))
        ]

    async def get_diskspace(self) -> list[ArrDiskSpace]:
        raw = self.fixtures.get("diskspace", [])
        return [
            d if isinstance(d, ArrDiskSpace) else parse_arr_disk_space(d)
            for d in raw
            if isinstance(d, (ArrDiskSpace, dict))
        ]

    async def get_library_total(self) -> ArrLibraryTotal:
        return parse_arr_library_total(self.fixtures.get("library_total", 0), self.app)

    async def search_missing(self) -> None:
        return None


def _fixture_dataclass(raw: Any, cls: type) -> Any:
    if isinstance(raw, cls):
        return raw
    if isinstance(raw, dict):
        return cls(**raw)
    return cls()


__all__ = [
    "ArrApp",
    "ArrClient",
    "ArrError",
    "RealArrClient",
    "FixtureArrClient",
    "ArrSystemStatus",
    "ArrHealthIssue",
    "ArrQueue",
    "ArrWantedMissing",
    "ArrCalendarEvent",
    "ArrDiskSpace",
    "ArrLibraryTotal",
    "parse_arr_status",
    "parse_arr_health",
    "parse_arr_health_issues",
    "parse_arr_queue",
    "parse_arr_wanted_missing",
    "parse_arr_calendar",
    "parse_arr_calendar_event",
    "parse_arr_disk_space",
    "parse_arr_disk_spaces",
    "parse_arr_library_total",
]
