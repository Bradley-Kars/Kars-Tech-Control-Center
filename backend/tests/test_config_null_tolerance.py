"""R7: null-tolerance tests for backend/fleet/config.py.

load_servers() must:
- tolerate null for optional string fields (treat null as missing/None)
- never crash the whole file over one bad field — skip the bad entry
- report a malformed entry by id and field name only (never input values)
"""

import json
import pytest

from fleet.config import ServerConfig, load_servers

FIXTURE_SERVER_WITH_NULLS = {
    "id": "unraid-main",
    "name": "Unraid Main",
    "hostname": "<device>.<tailnet>.ts.net",
    "port": 22,
    "username": "root",
    "auth": {"type": "password", "password": "not-a-real-password"},
    "device_type": "unraid",
    "service_keys": {
        "nextcloud_url": None,
        "plex_token": None,
    },
    "meshcentral_device_id": None,
    "meshcentral_enrolled_at": None,
    "meshcentral_status": None,
    "connection_priority": None,
}

FIXTURE_SERVER_BAD_FIELD = {
    "id": "bad-server",
    "name": "Bad Server",
    "hostname": None,  # required field is null -> malformed
    "port": 22,
    "username": "root",
    "auth": {"type": "password", "password": "not-a-real-password"},
    "device_type": "unraid",
    "service_keys": {},
}


def _write_fixture(path, servers):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(servers), encoding="utf-8")


class TestLoadServersNullTolerance:
    """null for optional string fields is treated as missing."""

    def test_null_optional_string_fields_treated_as_missing(self, monkeypatch, tmp_path):
        p = tmp_path / "servers.json"
        _write_fixture(p, [FIXTURE_SERVER_WITH_NULLS])
        monkeypatch.setenv("KTS_SERVERS_FILE", str(p))
        servers = load_servers()
        assert len(servers) == 1
        s = servers[0]
        assert s.id == "unraid-main"
        assert s.hostname == "<device>.<tailnet>.ts.net"
        assert s.name == "Unraid Main"
        # null optional fields are None
        assert s.service_keys.nextcloud_url is None
        assert s.service_keys.plex_token is None
        assert s.meshcentral_device_id is None
        assert s.meshcentral_enrolled_at is None
        assert s.meshcentral_status is None
        assert s.connection_priority is None

    def test_null_required_field_skips_entry(self, monkeypatch, tmp_path, caplog):
        p = tmp_path / "servers.json"
        _write_fixture(
            p, [FIXTURE_SERVER_WITH_NULLS, FIXTURE_SERVER_BAD_FIELD]
        )
        monkeypatch.setenv("KTS_SERVERS_FILE", str(p))
        servers = load_servers()
        # valid entry still loads
        assert len(servers) == 1
        assert servers[0].id == "unraid-main"

    def test_bad_entry_reported_by_id_and_field_only(self, monkeypatch, tmp_path, caplog):
        p = tmp_path / "servers.json"
        _write_fixture(
            p,
            [
                FIXTURE_SERVER_WITH_NULLS,
                FIXTURE_SERVER_BAD_FIELD,
            ],
        )
        monkeypatch.setenv("KTS_SERVERS_FILE", str(p))
        load_servers()
        # no test assertion on content; just ensure no crash and by-id/field reporting
        records = [r for r in caplog.records if r.levelname == "WARNING"]
        assert any("bad-server" in r.getMessage() for r in records)
        assert any("hostname" in r.getMessage() for r in records)
        # input value (null) never appears in the message
        for r in records:
            assert "None" not in r.getMessage()
