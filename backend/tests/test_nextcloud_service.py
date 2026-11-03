"""backend/fleet/nextcloud_service unit tests (P6).

Fixture-only: no network, no real Nextcloud server. Placeholder values only.
"""

from __future__ import annotations

import sys
import os
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fleet.nextcloud_service import (  # noqa: E402
    NextcloudError,
    NextcloudClient,
    RealNextcloudClient,
    FixtureNextcloudClient,
    NextcloudInfo,
    NextcloudSystemStatus,
    NextcloudStorage,
    NextcloudUser,
    ActivityItem,
    NextcloudActivity,
    parse_nextcloud_info,
    parse_nextcloud_status,
    parse_nextcloud_storage,
    parse_nextcloud_user,
    parse_nextcloud_activity,
)

FIXTURES = {
    "info": NextcloudInfo(
        version="34.0.3", versionstring="34.0.3", edition="Community"
    ),
    "status": NextcloudSystemStatus(
        installed=True,
        maintenance=False,
        needs_db_upgrade=False,
        version="34.0.3",
        versionstring="34.0.3",
        edition="Community",
        productname="Nextcloud",
        extended_support=False,
    ),
    "storage": NextcloudStorage(
        num_users=3, num_files=60509, num_storages=5,
        num_storages_local=2, num_storages_home=2, num_storages_other=1,
    ),
    "users": [
        NextcloudUser(
            id="alice", display_name="Alice", enabled=True,
            quota={"free": 100, "used": 10, "total": 100, "relative": 10},
            email="alice@example.com", groups=["admin"], backend="internal",
            subadmin=[], last_login=1_700_000_000,
        )
    ],
    "activity": NextcloudActivity(
        activities=[
            ActivityItem(
                activity_id=1, app="files", activity_type="created",
                user="alice", subject="File created", subject_rich=None,
                message="alice created \"report.pdf\"", message_rich=None,
                file="/report.pdf", link=None, datetime="2026-01-01T00:00:00+00:00",
                object_type="file", object_id=42, object_name="report.pdf",
                objects=None, icon="",
            )
        ]
    ),
}


# ---------------------------------------------------------------------------
# Fixture client
# ---------------------------------------------------------------------------


def test_fixture_client_returns_stored_info():
    client = FixtureNextcloudClient(fixtures={"info": FIXTURES["info"]})
    info = __import__("asyncio", fromlist=["run"]).run(client.get_info())
    assert info == FIXTURES["info"]


def test_fixture_client_returns_stored_status():
    client = FixtureNextcloudClient(fixtures={"status": FIXTURES["status"]})
    status = __import__("asyncio", fromlist=["run"]).run(client.get_status())
    assert status == FIXTURES["status"]


def test_fixture_client_returns_stored_storage():
    client = FixtureNextcloudClient(fixtures={"storage": FIXTURES["storage"]})
    storage = __import__("asyncio", fromlist=["run"]).run(client.get_storage())
    assert storage == FIXTURES["storage"]


def test_fixture_client_returns_stored_users():
    client = FixtureNextcloudClient(fixtures={"users": FIXTURES["users"]})
    users = __import__("asyncio", fromlist=["run"]).run(client.get_users())
    assert users == FIXTURES["users"]


def test_fixture_client_returns_stored_activity():
    client = FixtureNextcloudClient(fixtures={"activity": FIXTURES["activity"]})
    activity = __import__("asyncio", fromlist=["run"]).run(client.get_activity())
    assert activity == FIXTURES["activity"]


def test_fixture_client_defaults_to_empty():
    client = FixtureNextcloudClient()
    info = __import__("asyncio", fromlist=["run"]).run(client.get_info())
    assert info.version == ""
    status = __import__("asyncio", fromlist=["run"]).run(client.get_status())
    assert status.installed is False
    users = __import__("asyncio", fromlist=["run"]).run(client.get_users())
    assert users == []


# ---------------------------------------------------------------------------
# Pure parse functions (no network)
# ---------------------------------------------------------------------------


INFO_RAW = {
    "ocs": {
        "meta": {"ok": 200},
        "data": {
            "nextcloud": {
                "system": {
                    "version": "34.0.3",
                    "versionstring": "34.0.3",
                    "edition": "Community",
                }
            }
        },
    }
}


def test_parse_nextcloud_info():
    info = parse_nextcloud_info(INFO_RAW)
    assert info == NextcloudInfo(
        version="34.0.3", versionstring="34.0.3", edition="Community"
    )


def test_parse_nextcloud_info_fallbacks():
    # Nextcloud 34 may omit versionstring/edition; fall back to version / Community.
    raw = {"ocs": {"data": {"nextcloud": {"system": {"version": "35.0"}}}}}
    info = parse_nextcloud_info(raw)
    assert info.version == "35.0"
    assert info.versionstring == "35.0"
    assert info.edition == "Community"


def test_parse_nextcloud_status_from_info():
    status = parse_nextcloud_status(INFO_RAW)
    assert status == NextcloudSystemStatus(
        installed=True,
        maintenance=False,
        needs_db_upgrade=False,
        version="34.0.3",
        versionstring="34.0.3",
        edition="Community",
        productname="Nextcloud",
        extended_support=False,
    )


STORAGE_RAW = {
    "ocs": {
        "data": {
            "nextcloud": {
                "storage": {
                    "num_users": 3,
                    "num_files": 60509,
                    "num_storages": 5,
                    "num_storages_local": 2,
                    "num_storages_home": 2,
                    "num_storages_other": 1,
                }
            }
        }
    }
}


def test_parse_nextcloud_storage_from_info():
    storage = parse_nextcloud_storage(STORAGE_RAW)
    assert storage == NextcloudStorage(
        num_users=3, num_files=60509, num_storages=5,
        num_storages_local=2, num_storages_home=2, num_storages_other=1,
    )


def test_parse_nextcloud_storage_users_fallback():
    # When storage reports no users, fall back to the users endpoint count.
    raw = {
        "ocs": {
            "data": {
                "nextcloud": {"storage": {}},
                "users": ["alice", "bob", "carol"],
            }
        }
    }
    storage = parse_nextcloud_storage(raw)
    assert storage.num_users == 3


USER_DETAIL_RAW = {
    "ocs": {
        "data": {
            "enabled": True,
            "email": "alice@example.com",
            "quota": {"free": 100, "used": 10, "total": 100, "relative": 10},
            "groups": ["admin"],
            "subadmin": [],
        }
    }
}


def test_parse_nextcloud_user():
    user = parse_nextcloud_user(USER_DETAIL_RAW, "alice")
    assert user == NextcloudUser(
        id="alice", display_name="alice", enabled=True,
        quota={"free": 100, "used": 10, "total": 100, "relative": 10},
        email="alice@example.com", groups=["admin"], backend="internal",
        subadmin=[], last_login=None,
    )


ACTIVITY_RAW = {
    "ocs": {
        "data": [
            {
                "activity_id": 1, "app": "files", "type": "created",
                "user": "alice", "subject": "File created",
                "message": 'alice created "report.pdf"',
                "file": "/report.pdf", "datetime": "2026-01-01T00:00:00+00:00",
                "object_type": "file", "object_id": 42, "object_name": "report.pdf",
            }
        ]
    }
}


def test_parse_nextcloud_activity():
    activity = parse_nextcloud_activity(ACTIVITY_RAW)
    assert activity == NextcloudActivity(
        activities=[
            ActivityItem(
                activity_id=1, app="files", activity_type="created",
                user="alice", subject="File created",
                subject_rich=None,
                message='alice created "report.pdf"', message_rich=None,
                file="/report.pdf", link=None,
                datetime="2026-01-01T00:00:00+00:00",
                object_type="file", object_id=42, object_name="report.pdf",
                objects=None, icon=None,
            )
        ]
    )


# ---------------------------------------------------------------------------
# Real client: validation + delegation (no network)
# ---------------------------------------------------------------------------


def test_real_client_requires_base_url():
    with pytest.raises(ValueError, match="nextcloud_url"):
        RealNextcloudClient(base_url="", username="alice", password="pw")


def test_real_client_methods_delegate_to_parse_functions():
    client = RealNextcloudClient(
        base_url="http://<device>.<tailnet>.ts.net",
        username="alice",
        password="not-a-real-password",
    )

    # info/status/storage all hit the same OCS info path, so the fake carries
    # both the system block and the storage block.
    async def fake_request(path):
        return {
            "ocs": {
                "data": {
                    "nextcloud": {
                        "system": {
                            "version": "34.0.3",
                            "versionstring": "34.0.3",
                            "edition": "Community",
                        },
                        "storage": {
                            "num_users": 3,
                            "num_files": 60509,
                            "num_storages": 5,
                            "num_storages_local": 2,
                            "num_storages_home": 2,
                            "num_storages_other": 1,
                        },
                    }
                }
            }
        }

    with patch.object(client, "_request", side_effect=fake_request):
        info = __import__("asyncio", fromlist=["run"]).run(client.get_info())
        assert info.version == "34.0.3"
        status = __import__("asyncio", fromlist=["run"]).run(client.get_status())
        assert status.productname == "Nextcloud"
        storage = __import__("asyncio", fromlist=["run"]).run(client.get_storage())
        assert storage.num_files == 60509
        assert storage.num_users == 3


def test_real_client_uses_basic_auth_and_ocs_header():
    client = RealNextcloudClient(
        base_url="http://<device>.<tailnet>.ts.net",
        username="alice",
        password="not-a-real-password",
    )
    assert client._auth == ("alice", "not-a-real-password")
    assert client._headers["OCS-APIRequest"] == "true"
    assert client._headers["Accept"] == "application/json"


def test_nextcloud_error_is_an_exception():
    assert issubclass(NextcloudError, Exception)
    err = NextcloudError("boom")
    assert str(err) == "boom"


def test_nextcloud_client_is_abstract():
    with pytest.raises(TypeError):
        NextcloudClient()
