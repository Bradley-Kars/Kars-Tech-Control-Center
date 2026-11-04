"""backend/fleet/lidarr_service.py — Lidarr port (P9).

Port of the original Rust Lidarr service: system status, health, artists,
albums, wanted/missing, queue, disk space and indexers over Lidarr's HTTP
API (/api/v1/...), using an X-Api-Key header. Credentials are resolved from
``ServiceKeys`` (``lidarr_url`` / ``lidarr_api_key``).

Built on httpx (already a project dependency); tests replay recorded
responses via FixtureLidarrClient — no real network, no real Lidarr server.
The real client never sends its API key to anything but the configured
Lidarr base URL, and errors are redacted by the router before they reach
the client.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import httpx


class LidarrError(Exception):
    """Raised when a Lidarr API request fails."""


class LidarrClient(ABC):
    """Abstract base for Lidarr API clients."""

    @abstractmethod
    async def get_status(self) -> LidarrSystemStatus:
        """Return Lidarr server status (version, instance, OS, ...)."""
        ...

    @abstractmethod
    async def get_health(self) -> list[LidarrHealthIssue]:
        """Return current health issues."""
        ...

    @abstractmethod
    async def get_artists(self) -> list[LidarrArtist]:
        """Return the tracked artists."""
        ...

    @abstractmethod
    async def get_albums(
        self, artist_id: int | None = None, monitored: bool | None = None
    ) -> list[LidarrAlbum]:
        """Return albums, optionally filtered by artist or monitored state."""
        ...

    @abstractmethod
    async def get_wanted(
        self, page: int = 1, page_size: int = 20
    ) -> LidarrWantedMissing:
        """Return the wanted/missing albums page."""
        ...

    @abstractmethod
    async def get_queue(
        self, page: int = 1, page_size: int = 20
    ) -> LidarrQueue:
        """Return the download queue page."""
        ...

    @abstractmethod
    async def get_diskspace(self) -> list[LidarrDiskSpace]:
        """Return the configured disk space entries."""
        ...

    @abstractmethod
    async def get_indexers(self) -> list[LidarrIndexer]:
        """Return the configured indexers."""
        ...

    @abstractmethod
    async def refresh_series(self, artist_id: int) -> None:
        """Trigger a RefreshArtist command for the given artist."""
        ...

    @abstractmethod
    async def search_missing(self, artist_id: int) -> None:
        """Trigger a MissingAlbumSearch command for the given artist."""
        ...


# ---------------------------------------------------------------------------
# Response shapes (mirror the original Rust Lidarr service)
# ---------------------------------------------------------------------------


@dataclass
class LidarrSystemStatus:
    app_name: str = ""
    instance_name: str = ""
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


@dataclass
class LidarrHealthIssue:
    source: str = ""
    issue_type: str = ""
    message: str = ""
    wiki_url: str | None = None


@dataclass
class LidarrAddOptions:
    search_for_new_album: bool = False
    search_for_missing_album: bool = False
    search_for_cutoff_unmet_album: bool = False


@dataclass
class LidarrArtist:
    id: int = 0
    foreign_artist_id: str = ""
    artist_name: str = ""
    monitored: bool = False
    metadata_profile_id: int = 0
    quality_profile_id: int = 0
    root_folder_path: str = ""
    add_options: LidarrAddOptions | None = None
    tags: list[int] = field(default_factory=list)


@dataclass
class LidarrAlbumStatistics:
    track_count: int = 0
    track_file_count: int = 0
    size_on_disk: int = 0
    percent_of_tracks: float = 0.0


@dataclass
class LidarrAlbum:
    id: int = 0
    foreign_album_id: str = ""
    artist_id: int = 0
    title: str = ""
    album_type: str = ""
    status: str = ""
    monitored: bool = False
    release_date: str = ""
    genres: list[str] = field(default_factory=list)
    statistics: LidarrAlbumStatistics | None = None


@dataclass
class LidarrWantedMissing:
    page: int = 0
    page_size: int = 0
    sort_key: str = ""
    sort_direction: str = ""
    total_records: int = 0
    records: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class LidarrQueue:
    page: int = 0
    page_size: int = 0
    sort_key: str = ""
    sort_direction: str = ""
    total_records: int = 0
    records: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class LidarrDiskSpace:
    path: str = ""
    label: str = ""
    free_space: int = 0
    total_space: int = 0


@dataclass
class LidarrIndexer:
    id: int = 0
    name: str = ""
    implementation: str = ""
    implementation_name: str = ""
    config_contract: str = ""
    info_link: str = ""
    message: str | None = None
    priority: int = 0
    protocol: str = ""
    fields: list[Any] = field(default_factory=list)
    tags: list[int] = field(default_factory=list)


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


def _as_float(raw: Any, key: str, default: float) -> float:
    if not isinstance(raw, dict):
        return default
    try:
        return float(raw.get(key, default))
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


def parse_lidarr_status(raw: Any) -> LidarrSystemStatus:
    """Parse one ``/api/v1/system/status`` envelope into LidarrSystemStatus."""
    if not isinstance(raw, dict):
        return LidarrSystemStatus()
    return LidarrSystemStatus(
        app_name=_as_str(raw, "appName"),
        instance_name=_as_str(raw, "instanceName"),
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
    )


def parse_lidarr_health(raw: Any) -> LidarrHealthIssue:
    """Parse one health issue into LidarrHealthIssue."""
    if not isinstance(raw, dict):
        return LidarrHealthIssue()
    return LidarrHealthIssue(
        source=_as_str(raw, "source"),
        issue_type=_as_str(raw, "type"),
        message=_as_str(raw, "message"),
        wiki_url=_as_optional_str(raw.get("wikiUrl")),
    )


def parse_lidarr_health_issues(raw: Any) -> list[LidarrHealthIssue]:
    """Parse the ``/api/v1/health`` array into LidarrHealthIssue list."""
    return [
        parse_lidarr_health(e)
        for e in _as_list(raw)
        if isinstance(e, dict)
    ]


def parse_lidarr_add_options(raw: Any) -> LidarrAddOptions | None:
    """Parse one add-options object into LidarrAddOptions, or None when absent."""
    if not isinstance(raw, dict):
        return None
    return LidarrAddOptions(
        search_for_new_album=_as_bool(raw, "searchForNewAlbum"),
        search_for_missing_album=_as_bool(raw, "searchForMissingAlbum"),
        search_for_cutoff_unmet_album=_as_bool(raw, "searchForCutoffUnmetAlbum"),
    )


def parse_lidarr_artist(raw: Any) -> LidarrArtist:
    """Parse one ``/api/v1/artist`` entry into LidarrArtist."""
    if not isinstance(raw, dict):
        return LidarrArtist()
    return LidarrArtist(
        id=_as_int(raw, "id", 0),
        foreign_artist_id=_as_str(raw, "foreignArtistId"),
        artist_name=_as_str(raw, "artistName"),
        monitored=_as_bool(raw, "monitored"),
        metadata_profile_id=_as_int(raw, "metadataProfileId", 0),
        quality_profile_id=_as_int(raw, "qualityProfileId", 0),
        root_folder_path=_as_str(raw, "rootFolderPath"),
        add_options=parse_lidarr_add_options(raw.get("addOptions")),
        tags=[int(t) for t in _as_list(raw.get("tags")) if isinstance(t, (int, float, str)) and str(t).lstrip("-").isdigit()],
    )


def parse_lidarr_album_statistics(raw: Any) -> LidarrAlbumStatistics | None:
    """Parse one album statistics object, or None when absent."""
    if not isinstance(raw, dict):
        return None
    return LidarrAlbumStatistics(
        track_count=_as_int(raw, "trackCount", 0),
        track_file_count=_as_int(raw, "trackFileCount", 0),
        size_on_disk=_as_int(raw, "sizeOnDisk", 0),
        percent_of_tracks=_as_float(raw, "percentOfTracks", 0.0),
    )


def parse_lidarr_album(raw: Any) -> LidarrAlbum:
    """Parse one ``/api/v1/album`` entry into LidarrAlbum."""
    if not isinstance(raw, dict):
        return LidarrAlbum()
    return LidarrAlbum(
        id=_as_int(raw, "id", 0),
        foreign_album_id=_as_str(raw, "foreignAlbumId"),
        artist_id=_as_int(raw, "artistId", 0),
        title=_as_str(raw, "title"),
        album_type=_as_str(raw, "albumType"),
        status=_as_str(raw, "status"),
        monitored=_as_bool(raw, "monitored"),
        release_date=_as_str(raw, "releaseDate"),
        genres=[str(g) for g in _as_list(raw.get("genres")) if isinstance(g, str)],
        statistics=parse_lidarr_album_statistics(raw.get("statistics")),
    )


def parse_lidarr_wanted_missing(raw: Any) -> LidarrWantedMissing:
    """Parse one ``/api/v1/wanted/missing`` envelope into LidarrWantedMissing."""
    if not isinstance(raw, dict):
        return LidarrWantedMissing()
    return LidarrWantedMissing(
        page=_as_int(raw, "page", 0),
        page_size=_as_int(raw, "pageSize", 0),
        sort_key=_as_str(raw, "sortKey"),
        sort_direction=_as_str(raw, "sortDirection"),
        total_records=_as_int(raw, "totalRecords", 0),
        records=raw.get("records") if isinstance(raw.get("records"), list) else [],
    )


def parse_lidarr_queue(raw: Any) -> LidarrQueue:
    """Parse one ``/api/v1/queue`` envelope into LidarrQueue."""
    if not isinstance(raw, dict):
        return LidarrQueue()
    return LidarrQueue(
        page=_as_int(raw, "page", 0),
        page_size=_as_int(raw, "pageSize", 0),
        sort_key=_as_str(raw, "sortKey"),
        sort_direction=_as_str(raw, "sortDirection"),
        total_records=_as_int(raw, "totalRecords", 0),
        records=raw.get("records") if isinstance(raw.get("records"), list) else [],
    )


def parse_lidarr_disk_space(raw: Any) -> LidarrDiskSpace:
    """Parse one ``/api/v1/diskspace`` entry into LidarrDiskSpace."""
    if not isinstance(raw, dict):
        return LidarrDiskSpace()
    return LidarrDiskSpace(
        path=_as_str(raw, "path"),
        label=_as_str(raw, "label"),
        free_space=_as_int(raw, "freeSpace", 0),
        total_space=_as_int(raw, "totalSpace", 0),
    )


def parse_lidarr_indexer(raw: Any) -> LidarrIndexer:
    """Parse one ``/api/v1/indexer`` entry into LidarrIndexer."""
    if not isinstance(raw, dict):
        return LidarrIndexer()
    return LidarrIndexer(
        id=_as_int(raw, "id", 0),
        name=_as_str(raw, "name"),
        implementation=_as_str(raw, "implementation"),
        implementation_name=_as_str(raw, "implementationName"),
        config_contract=_as_str(raw, "configContract"),
        info_link=_as_str(raw, "infoLink"),
        message=_as_optional_str(raw.get("message")),
        priority=_as_int(raw, "priority", 0),
        protocol=_as_str(raw, "protocol"),
        fields=raw.get("fields") if isinstance(raw.get("fields"), list) else [],
        tags=[int(t) for t in _as_list(raw.get("tags")) if isinstance(t, (int, float, str)) and str(t).lstrip("-").isdigit()],
    )


def parse_lidarr_indexers(raw: Any) -> list[LidarrIndexer]:
    return [parse_lidarr_indexer(e) for e in _as_list(raw) if isinstance(e, dict)]


def parse_lidarr_artists(raw: Any) -> list[LidarrArtist]:
    return [parse_lidarr_artist(e) for e in _as_list(raw) if isinstance(e, dict)]


def parse_lidarr_albums(raw: Any) -> list[LidarrAlbum]:
    return [parse_lidarr_album(e) for e in _as_list(raw) if isinstance(e, dict)]


def parse_lidarr_disk_spaces(raw: Any) -> list[LidarrDiskSpace]:
    return [parse_lidarr_disk_space(e) for e in _as_list(raw) if isinstance(e, dict)]


# ---------------------------------------------------------------------------
# Real client
# ---------------------------------------------------------------------------


class RealLidarrClient(LidarrClient):
    """Real Lidarr client using httpx against a local server.

    Sends an X-Api-Key header on every request. Self-signed certs are
    accepted (the norm on this LAN).
    """

    def __init__(self, base_url: str, api_key: str, timeout: float = 30.0):
        if not base_url or not base_url.strip():
            raise ValueError("lidarr_url not configured")
        if not api_key or not api_key.strip():
            raise ValueError("lidarr_api_key not configured")
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

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        """GET ``{base_url}/api/v1/{path}`` and return the parsed JSON."""
        url = f"{self.base_url}/api/v1/{path}"
        resp = await self._client.get(url, params=params)
        if resp.status_code >= 400:
            raise LidarrError(f"Lidarr error {resp.status_code}: {resp.text[:500]}")
        try:
            return resp.json()
        except ValueError as exc:
            raise LidarrError(f"Lidarr parse error from {path}: {exc}") from exc

    async def _post(self, path: str, body: Any = None) -> Any:
        """POST ``{base_url}/api/v1/{path}`` and return the parsed JSON."""
        url = f"{self.base_url}/api/v1/{path}"
        resp = await self._client.post(url, json=body or {})
        if resp.status_code >= 400:
            raise LidarrError(f"Lidarr error {resp.status_code}: {resp.text[:500]}")
        try:
            return resp.json()
        except ValueError:
            return {}

    async def get_status(self) -> LidarrSystemStatus:
        return parse_lidarr_status(await self._get("system/status"))

    async def get_health(self) -> list[LidarrHealthIssue]:
        return parse_lidarr_health_issues(await self._get("health"))

    async def get_artists(self) -> list[LidarrArtist]:
        return parse_lidarr_artists(await self._get("artist"))

    async def get_albums(
        self, artist_id: int | None = None, monitored: bool | None = None
    ) -> list[LidarrAlbum]:
        params: dict[str, Any] = {}
        if artist_id is not None:
            params["artistId"] = artist_id
        if monitored is not None:
            params["monitored"] = monitored
        return parse_lidarr_albums(await self._get("album", params or None))

    async def get_wanted(
        self, page: int = 1, page_size: int = 20
    ) -> LidarrWantedMissing:
        return parse_lidarr_wanted_missing(
            await self._get("wanted/missing", {"page": page, "pageSize": page_size})
        )

    async def get_queue(
        self, page: int = 1, page_size: int = 20
    ) -> LidarrQueue:
        return parse_lidarr_queue(
            await self._get("queue", {"page": page, "pageSize": page_size})
        )

    async def get_diskspace(self) -> list[LidarrDiskSpace]:
        return parse_lidarr_disk_spaces(await self._get("diskspace"))

    async def get_indexers(self) -> list[LidarrIndexer]:
        return parse_lidarr_indexers(await self._get("indexer"))

    async def refresh_series(self, artist_id: int) -> None:
        await self._post(
            "command",
            {"name": "RefreshArtist", "artistId": artist_id},
        )

    async def search_missing(self, artist_id: int) -> None:
        await self._post(
            "command",
            {"name": "MissingAlbumSearch", "artistId": artist_id},
        )


# ---------------------------------------------------------------------------
# Fixture client
# ---------------------------------------------------------------------------


class FixtureLidarrClient(LidarrClient):
    """Fixture-based Lidarr client for testing.

    Returns recorded fixture data instead of making live HTTP requests.
    No live Lidarr server is required.
    """

    def __init__(self, fixtures: dict[str, Any] | None = None):
        self.fixtures = dict(fixtures or {})

    async def get_status(self) -> LidarrSystemStatus:
        return _fixture_dataclass(self.fixtures.get("status"), LidarrSystemStatus)

    async def get_health(self) -> list[LidarrHealthIssue]:
        raw = self.fixtures.get("health", [])
        return [
            h if isinstance(h, LidarrHealthIssue) else parse_lidarr_health(h)
            for h in raw
            if isinstance(h, (LidarrHealthIssue, dict))
        ]

    async def get_artists(self) -> list[LidarrArtist]:
        raw = self.fixtures.get("artists", [])
        return [
            a if isinstance(a, LidarrArtist) else parse_lidarr_artist(a)
            for a in raw
            if isinstance(a, (LidarrArtist, dict))
        ]

    async def get_albums(
        self, artist_id: int | None = None, monitored: bool | None = None
    ) -> list[LidarrAlbum]:
        raw = self.fixtures.get("albums", [])
        return [
            al if isinstance(al, LidarrAlbum) else parse_lidarr_album(al)
            for al in raw
            if isinstance(al, (LidarrAlbum, dict))
        ]

    async def get_wanted(
        self, page: int = 1, page_size: int = 20
    ) -> LidarrWantedMissing:
        return _fixture_dataclass(self.fixtures.get("wanted"), LidarrWantedMissing)

    async def get_queue(
        self, page: int = 1, page_size: int = 20
    ) -> LidarrQueue:
        return _fixture_dataclass(self.fixtures.get("queue"), LidarrQueue)

    async def get_diskspace(self) -> list[LidarrDiskSpace]:
        raw = self.fixtures.get("diskspace", [])
        return [
            d if isinstance(d, LidarrDiskSpace) else parse_lidarr_disk_space(d)
            for d in raw
            if isinstance(d, (LidarrDiskSpace, dict))
        ]

    async def get_indexers(self) -> list[LidarrIndexer]:
        raw = self.fixtures.get("indexers", [])
        return [
            i if isinstance(i, LidarrIndexer) else parse_lidarr_indexer(i)
            for i in raw
            if isinstance(i, (LidarrIndexer, dict))
        ]

    async def refresh_series(self, artist_id: int) -> None:
        return None

    async def search_missing(self, artist_id: int) -> None:
        return None


def _fixture_dataclass(raw: Any, cls: type) -> Any:
    if isinstance(raw, cls):
        return raw
    if isinstance(raw, dict):
        return cls(**raw)
    return cls()


__all__ = [
    "LidarrError",
    "LidarrClient",
    "RealLidarrClient",
    "FixtureLidarrClient",
    "LidarrSystemStatus",
    "LidarrHealthIssue",
    "LidarrArtist",
    "LidarrAddOptions",
    "LidarrAlbum",
    "LidarrAlbumStatistics",
    "LidarrWantedMissing",
    "LidarrQueue",
    "LidarrDiskSpace",
    "LidarrIndexer",
    "parse_lidarr_status",
    "parse_lidarr_health",
    "parse_lidarr_health_issues",
    "parse_lidarr_add_options",
    "parse_lidarr_artist",
    "parse_lidarr_artists",
    "parse_lidarr_album",
    "parse_lidarr_albums",
    "parse_lidarr_album_statistics",
    "parse_lidarr_wanted_missing",
    "parse_lidarr_queue",
    "parse_lidarr_disk_space",
    "parse_lidarr_disk_spaces",
    "parse_lidarr_indexer",
    "parse_lidarr_indexers",
]
