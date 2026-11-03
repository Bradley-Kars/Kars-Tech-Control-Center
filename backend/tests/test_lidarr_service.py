"""backend/fleet/lidarr_service unit tests (P9).

Fixture-only: no network, no real Lidarr server. Placeholder values only —
no real hostnames, emails, or tokens.
"""

from __future__ import annotations

import sys
import os
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fleet.lidarr_service import (  # noqa: E402
    LidarrError,
    LidarrClient,
    RealLidarrClient,
    FixtureLidarrClient,
    LidarrSystemStatus,
    LidarrHealthIssue,
    LidarrArtist,
    LidarrAddOptions,
    LidarrAlbum,
    LidarrAlbumStatistics,
    LidarrWantedMissing,
    LidarrQueue,
    LidarrDiskSpace,
    LidarrIndexer,
    parse_lidarr_status,
    parse_lidarr_health,
    parse_lidarr_health_issues,
    parse_lidarr_artist,
    parse_lidarr_artists,
    parse_lidarr_album,
    parse_lidarr_albums,
    parse_lidarr_wanted_missing,
    parse_lidarr_queue,
    parse_lidarr_disk_space,
    parse_lidarr_indexer,
    parse_lidarr_indexers,
)

STATUS = LidarrSystemStatus(
    app_name="Lidarr",
    instance_name="Music",
    version="2.0.0.1234",
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
)

HEALTH = LidarrHealthIssue(
    source="DiskSpace",
    issue_type="Warning",
    message="Disk space low",
    wiki_url="https://wiki.lidarr.audio",
)

ARTIST = LidarrArtist(
    id=1,
    foreign_artist_id="foreign-1",
    artist_name="The Beatles",
    monitored=True,
    metadata_profile_id=1,
    quality_profile_id=2,
    root_folder_path="/music",
    add_options=LidarrAddOptions(
        search_for_new_album=True,
        search_for_missing_album=False,
        search_for_cutoff_unmet_album=True,
    ),
    tags=[1, 2],
)

ALBUM = LidarrAlbum(
    id=10,
    foreign_album_id="foreign-album-1",
    artist_id=1,
    title="Abbey Road",
    album_type="Studio",
    status="released",
    monitored=True,
    release_date="1969-09-26",
    genres=["Rock"],
    statistics=LidarrAlbumStatistics(
        track_count=17,
        track_file_count=17,
        size_on_disk=1024 * 1024 * 100,
        percent_of_tracks=100.0,
    ),
)

DISK = LidarrDiskSpace(path="/music", label="Music", free_space=500 * 1024**3, total_space=1024**4)

INDEXER = LidarrIndexer(
    id=1,
    name="Some Indexer",
    implementation="Newznab",
    implementation_name="Some Indexer",
    config_contract="Newznab",
    info_link="https://example.com",
    message=None,
    priority=1,
    protocol="nzb",
    fields=[],
    tags=[],
)

WANTED = LidarrWantedMissing(
    page=1,
    page_size=25,
    sort_key="title",
    sort_direction="asc",
    total_records=2,
    records=[],
)

QUEUE = LidarrQueue(
    page=1,
    page_size=25,
    sort_key="title",
    sort_direction="asc",
    total_records=1,
    records=[],
)


# ---------------------------------------------------------------------------
# Fixture client
# ---------------------------------------------------------------------------


def test_fixture_client_returns_stored_status():
    client = FixtureLidarrClient({"status": STATUS})
    import asyncio

    result = asyncio.run(client.get_status())
    assert result == STATUS


def test_fixture_client_returns_stored_health():
    client = FixtureLidarrClient({"health": [HEALTH]})
    import asyncio

    result = asyncio.run(client.get_health())
    assert result == [HEALTH]


def test_fixture_client_returns_stored_artists():
    client = FixtureLidarrClient({"artists": [ARTIST]})
    import asyncio

    result = asyncio.run(client.get_artists())
    assert result == [ARTIST]


def test_fixture_client_returns_stored_albums():
    client = FixtureLidarrClient({"albums": [ALBUM]})
    import asyncio

    result = asyncio.run(client.get_albums())
    assert result == [ALBUM]


def test_fixture_client_returns_stored_wanted():
    client = FixtureLidarrClient({"wanted": WANTED})
    import asyncio

    result = asyncio.run(client.get_wanted())
    assert result == WANTED


def test_fixture_client_returns_stored_queue():
    client = FixtureLidarrClient({"queue": QUEUE})
    import asyncio

    result = asyncio.run(client.get_queue())
    assert result == QUEUE


def test_fixture_client_returns_stored_diskspace():
    client = FixtureLidarrClient({"diskspace": [DISK]})
    import asyncio

    result = asyncio.run(client.get_diskspace())
    assert result == [DISK]


def test_fixture_client_returns_stored_indexers():
    client = FixtureLidarrClient({"indexers": [INDEXER]})
    import asyncio

    result = asyncio.run(client.get_indexers())
    assert result == [INDEXER]


def test_fixture_client_defaults_to_empty():
    client = FixtureLidarrClient()
    import asyncio

    assert asyncio.run(client.get_status()) == LidarrSystemStatus()
    assert asyncio.run(client.get_health()) == []
    assert asyncio.run(client.get_artists()) == []
    assert asyncio.run(client.get_albums()) == []
    assert asyncio.run(client.get_wanted()) == LidarrWantedMissing()
    assert asyncio.run(client.get_queue()) == LidarrQueue()
    assert asyncio.run(client.get_diskspace()) == []
    assert asyncio.run(client.get_indexers()) == []


# ---------------------------------------------------------------------------
# Pure parse functions (no network)
# ---------------------------------------------------------------------------


STATUS_RAW = {
    "appName": "Lidarr",
    "instanceName": "Music",
    "version": "2.0.0.1234",
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
}


def test_parse_lidarr_status():
    status = parse_lidarr_status(STATUS_RAW)
    assert status == STATUS


def test_parse_lidarr_status_empty():
    status = parse_lidarr_status({})
    assert status.app_name == ""
    assert status.version == ""


HEALTH_RAW = {
    "source": "DiskSpace",
    "type": "Warning",
    "message": "Disk space low",
    "wikiUrl": "https://wiki.lidarr.audio",
}


def test_parse_lidarr_health():
    issue = parse_lidarr_health(HEALTH_RAW)
    assert issue == HEALTH


def test_parse_lidarr_health_empty():
    issue = parse_lidarr_health({})
    assert issue.source == ""
    assert issue.issue_type == ""


def test_parse_lidarr_health_issues():
    issues = parse_lidarr_health_issues([HEALTH_RAW])
    assert len(issues) == 1
    assert issues[0] == HEALTH


def test_parse_lidarr_health_issues_empty():
    assert parse_lidarr_health_issues([]) == []


ARTIST_RAW = {
    "id": 1,
    "foreignArtistId": "foreign-1",
    "artistName": "The Beatles",
    "monitored": True,
    "metadataProfileId": 1,
    "qualityProfileId": 2,
    "rootFolderPath": "/music",
    "addOptions": {
        "searchForNewAlbum": True,
        "searchForMissingAlbum": False,
        "searchForCutoffUnmetAlbum": True,
    },
    "tags": [1, 2],
}


def test_parse_lidarr_artist():
    artist = parse_lidarr_artist(ARTIST_RAW)
    assert artist == ARTIST


def test_parse_lidarr_artist_empty():
    artist = parse_lidarr_artist({})
    assert artist.id == 0
    assert artist.artist_name == ""


def test_parse_lidarr_artists():
    artists = parse_lidarr_artists([ARTIST_RAW])
    assert len(artists) == 1
    assert artists[0] == ARTIST


ALBUM_RAW = {
    "id": 10,
    "foreignAlbumId": "foreign-album-1",
    "artistId": 1,
    "title": "Abbey Road",
    "albumType": "Studio",
    "status": "released",
    "monitored": True,
    "releaseDate": "1969-09-26",
    "genres": ["Rock"],
    "statistics": {
        "trackCount": 17,
        "trackFileCount": 17,
        "sizeOnDisk": 104857600,
        "percentOfTracks": 100.0,
    },
}


def test_parse_lidarr_album():
    album = parse_lidarr_album(ALBUM_RAW)
    assert album == ALBUM


def test_parse_lidarr_album_empty():
    album = parse_lidarr_album({})
    assert album.id == 0
    assert album.title == ""


def test_parse_lidarr_albums():
    albums = parse_lidarr_albums([ALBUM_RAW])
    assert len(albums) == 1
    assert albums[0] == ALBUM


WANTED_RAW = {
    "page": 1,
    "pageSize": 25,
    "sortKey": "title",
    "sortDirection": "asc",
    "totalRecords": 2,
    "records": [],
}


def test_parse_lidarr_wanted_missing():
    wanted = parse_lidarr_wanted_missing(WANTED_RAW)
    assert wanted == WANTED


QUEUE_RAW = {
    "page": 1,
    "pageSize": 25,
    "sortKey": "title",
    "sortDirection": "asc",
    "totalRecords": 1,
    "records": [],
}


def test_parse_lidarr_queue():
    queue = parse_lidarr_queue(QUEUE_RAW)
    assert queue == QUEUE


DISK_RAW = {
    "path": "/music",
    "label": "Music",
    "freeSpace": 500 * 1024**3,
    "totalSpace": 1024**4,
}


def test_parse_lidarr_disk_space():
    disk = parse_lidarr_disk_space(DISK_RAW)
    assert disk == DISK


INDEXER_RAW = {
    "id": 1,
    "name": "Some Indexer",
    "implementation": "Newznab",
    "implementationName": "Some Indexer",
    "configContract": "Newznab",
    "infoLink": "https://example.com",
    "priority": 1,
    "protocol": "nzb",
}


def test_parse_lidarr_indexer():
    indexer = parse_lidarr_indexer(INDEXER_RAW)
    assert indexer == INDEXER


def test_parse_lidarr_indexers():
    indexers = parse_lidarr_indexers([INDEXER_RAW])
    assert len(indexers) == 1
    assert indexers[0] == INDEXER


# ---------------------------------------------------------------------------
# Real client: validation + delegation (no network)
# ---------------------------------------------------------------------------


def test_real_client_requires_base_url():
    with pytest.raises(ValueError, match="lidarr_url"):
        RealLidarrClient(base_url="", api_key="not-a-real-api-key")


def test_real_client_requires_api_key():
    with pytest.raises(ValueError, match="lidarr_api_key"):
        RealLidarrClient(
            base_url="http://<device>.<tailnet>.ts.net:8686", api_key=""
        )


def test_real_client_methods_delegate_to_parse_functions():
    client = RealLidarrClient(
        base_url="http://<device>.<tailnet>.ts.net:8686",
        api_key="not-a-real-api-key",
    )

    async def fake_get(path, params=None):
        if path == "system/status":
            return STATUS_RAW
        if path == "health":
            return [HEALTH_RAW]
        if path == "artist":
            return [ARTIST_RAW]
        if path == "album":
            return [ALBUM_RAW]
        if path == "wanted/missing":
            return WANTED_RAW
        if path == "queue":
            return QUEUE_RAW
        if path == "diskspace":
            return [DISK_RAW]
        if path == "indexer":
            return [INDEXER_RAW]
        return {}

    with patch.object(client, "_get", side_effect=fake_get):
        import asyncio

        status = asyncio.run(client.get_status())
        assert status.app_name == "Lidarr"
        health = asyncio.run(client.get_health())
        assert len(health) == 1
        artists = asyncio.run(client.get_artists())
        assert len(artists) == 1
        albums = asyncio.run(client.get_albums())
        assert len(albums) == 1
        wanted = asyncio.run(client.get_wanted())
        assert wanted.total_records == 2
        queue = asyncio.run(client.get_queue())
        assert queue.total_records == 1
        diskspace = asyncio.run(client.get_diskspace())
        assert len(diskspace) == 1
        indexers = asyncio.run(client.get_indexers())
        assert len(indexers) == 1


def test_real_client_uses_api_key_header():
    client = RealLidarrClient(
        base_url="http://<device>.<tailnet>.ts.net:8686",
        api_key="not-a-real-api-key",
    )
    assert client._headers["X-Api-Key"] == "not-a-real-api-key"


def test_lidarr_error_is_an_exception():
    assert issubclass(LidarrError, Exception)
    err = LidarrError("boom")
    assert str(err) == "boom"


def test_lidarr_client_is_abstract():
    with pytest.raises(TypeError):
        LidarrClient()
