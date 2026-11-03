"""backend/fleet/config.py tests — servers.json loader.

Fixture-only: never touches the real ~/.config/master-control/servers.json.
All tests use temp files via the KTS_SERVERS_FILE env override.
Placeholder values only — no real hostnames, emails, or tokens.
"""

import json
import os
import stat
import tempfile
from pathlib import Path

import pytest

from fleet.config import (
    AuthKey,
    AuthPassword,
    ServerConfig,
    ServiceKeys,
    get_servers_path,
    load_servers,
    redact_error,
    redact_server,
    save_servers,
)

FIXTURE_SERVER_PW = {
    "id": "unraid-main",
    "name": "Unraid Main",
    "hostname": "<device>.<tailnet>.ts.net",
    "port": 22,
    "username": "root",
    "auth": {"type": "password", "password": "not-a-real-password"},
    "device_type": "unraid",
    "service_keys": {},
    "meshcentral_device_id": "mc-device-1",
    "meshcentral_enrolled_at": "2026-09-01T00:00:00Z",
    "meshcentral_status": "online",
    "connection_priority": ["meshcentral", "ssh"],
}

FIXTURE_SERVER_KEY = {
    "id": "rog-ally",
    "name": "ROG Ally",
    "hostname": "rog-ally.local",
    "port": 22,
    "username": "user",
    "auth": {"type": "key", "key_path": "/home/user/.ssh/id_ed25519", "passphrase": None},
    "device_type": "handheld",
    "service_keys": {},
}

FIXTURE_SERVER_WITH_KEYS = {
    "id": "phone",
    "name": "Galaxy S24 Ultra",
    "hostname": "phone.tailf6d3b4.ts.net",
    "port": 22,
    "username": "user",
    "auth": {"type": "password", "password": "pw"},
    "device_type": "phone",
    "service_keys": {
        "adb_serial": "ABC123",
        "kdeconnect_device_id": "kc-device-id",
    },
}


def _write_fixture(path: Path, server: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([server]), encoding="utf-8")


class TestGetServersPath:
    """get_servers_path() resolves KTS_SERVERS_FILE or the default."""

    def test_default_path_when_env_unset(self, monkeypatch):
        monkeypatch.delenv("KTS_SERVERS_FILE", raising=False)
        assert get_servers_path() == Path.home() / ".config" / "master-control" / "servers.json"

    def test_env_path_wins(self, monkeypatch, tmp_path):
        custom = tmp_path / "servers.json"
        monkeypatch.setenv("KTS_SERVERS_FILE", str(custom))
        assert get_servers_path() == custom


class TestLoadServers:
    """load_servers() parses servers.json into ServerConfig objects."""

    def test_missing_file_returns_empty(self, monkeypatch, tmp_path):
        missing = tmp_path / "does-not-exist.json"
        monkeypatch.setenv("KTS_SERVERS_FILE", str(missing))
        assert load_servers() == []

    def test_empty_file_returns_empty(self, monkeypatch, tmp_path):
        empty = tmp_path / "empty.json"
        empty.write_text("", encoding="utf-8")
        monkeypatch.setenv("KTS_SERVERS_FILE", str(empty))
        assert load_servers() == []

    def test_whitespace_only_file_returns_empty(self, monkeypatch, tmp_path):
        ws = tmp_path / "ws.json"
        ws.write_text("   \n  \n", encoding="utf-8")
        monkeypatch.setenv("KTS_SERVERS_FILE", str(ws))
        assert load_servers() == []

    def test_valid_password_server_parses(self, monkeypatch, tmp_path):
        p = tmp_path / "servers.json"
        _write_fixture(p, FIXTURE_SERVER_PW)
        monkeypatch.setenv("KTS_SERVERS_FILE", str(p))
        servers = load_servers()
        assert len(servers) == 1
        s = servers[0]
        assert isinstance(s, ServerConfig)
        assert s.id == "unraid-main"
        assert s.hostname == "<device>.<tailnet>.ts.net"
        assert s.port == 22
        assert s.username == "root"
        assert isinstance(s.auth, AuthPassword)
        assert s.auth.password == "not-a-real-password"
        assert s.device_type == "unraid"
        assert s.connection_priority == ["meshcentral", "ssh"]

    def test_key_auth_parses(self, monkeypatch, tmp_path):
        p = tmp_path / "servers.json"
        _write_fixture(p, FIXTURE_SERVER_KEY)
        monkeypatch.setenv("KTS_SERVERS_FILE", str(p))
        servers = load_servers()
        assert len(servers) == 1
        s = servers[0]
        assert isinstance(s.auth, AuthKey)
        assert s.auth.key_path == "/home/user/.ssh/id_ed25519"
        assert s.auth.passphrase is None

    def test_service_keys_optional_and_empty(self, monkeypatch, tmp_path):
        p = tmp_path / "servers.json"
        _write_fixture(p, FIXTURE_SERVER_PW)
        monkeypatch.setenv("KTS_SERVERS_FILE", str(p))
        s = load_servers()[0]
        assert isinstance(s.service_keys, ServiceKeys)
        assert s.service_keys.nextcloud_user is None

    def test_invalid_json_raises(self, monkeypatch, tmp_path):
        p = tmp_path / "bad.json"
        p.write_text("{not valid json", encoding="utf-8")
        monkeypatch.setenv("KTS_SERVERS_FILE", str(p))
        with pytest.raises((json.JSONDecodeError, ValueError)):
            load_servers()

    def test_missing_required_field_raises(self, monkeypatch, tmp_path):
        p = tmp_path / "servers.json"
        p.write_text(json.dumps([{"id": "x"}]), encoding="utf-8")
        monkeypatch.setenv("KTS_SERVERS_FILE", str(p))
        with pytest.raises(Exception):
            load_servers()

    def test_explicit_path_argument(self, tmp_path):
        p = tmp_path / "servers.json"
        _write_fixture(p, FIXTURE_SERVER_PW)
        servers = load_servers(path=p)
        assert len(servers) == 1
        assert servers[0].id == "unraid-main"

    def test_defaults_overridden_by_servers_json_by_id(self, monkeypatch, tmp_path):
        p = tmp_path / "servers.json"
        _write_fixture(p, FIXTURE_SERVER_PW)
        monkeypatch.setenv("KTS_SERVERS_FILE", str(p))
        defaults = [
            {"id": "unraid-main", "name": "Default Name", "hostname": "old.example", "port": 22,
             "username": "admin", "auth": {"type": "password", "password": "old-pw"},
             "device_type": "generic", "service_keys": {}},
            {"id": "extra-server", "name": "Extra", "hostname": "extra.example", "port": 22,
             "username": "root", "auth": {"type": "password", "password": "pw"},
             "device_type": "generic", "service_keys": {}},
        ]
        servers = load_servers(defaults=defaults)
        ids = {s.id for s in servers}
        assert ids == {"unraid-main", "extra-server"}
        main = next(s for s in servers if s.id == "unraid-main")
        # servers.json wins for matching id
        assert main.name == "Unraid Main"
        assert main.hostname == "<device>.<tailnet>.ts.net"
        assert main.username == "root"
        # default not in servers.json is kept
        extra = next(s for s in servers if s.id == "extra-server")
        assert extra.name == "Extra"


class TestSaveServers:
    """save_servers() writes atomically with mode 0600 and a .bak copy."""

    def test_writes_valid_json(self, tmp_path):
        p = tmp_path / "servers.json"
        servers = [ServerConfig(**FIXTURE_SERVER_PW)]
        save_servers(servers, path=p)
        data = json.loads(p.read_text(encoding="utf-8"))
        assert len(data) == 1
        assert data[0]["id"] == "unraid-main"
        assert data[0]["hostname"] == "<device>.<tailnet>.ts.net"

    def test_sets_mode_0600(self, tmp_path):
        p = tmp_path / "servers.json"
        save_servers([ServerConfig(**FIXTURE_SERVER_PW)], path=p)
        mode = stat.S_IMODE(p.stat().st_mode)
        assert mode == 0o600, f"expected 0o600, got {oct(mode)}"

    def test_creates_bak_of_existing_file(self, tmp_path):
        p = tmp_path / "servers.json"
        p.write_text('{"existing": true}', encoding="utf-8")
        save_servers([ServerConfig(**FIXTURE_SERVER_PW)], path=p)
        bak = p.with_suffix(p.suffix + ".bak")
        assert bak.exists()
        assert bak.read_text(encoding="utf-8") == '{"existing": true}'

    def test_no_bak_when_file_does_not_exist(self, tmp_path):
        p = tmp_path / "servers.json"
        assert not p.exists()
        save_servers([ServerConfig(**FIXTURE_SERVER_PW)], path=p)
        bak = p.with_suffix(p.suffix + ".bak")
        assert not bak.exists()

    def test_creates_parent_directory(self, tmp_path):
        p = tmp_path / "nested" / "dir" / "servers.json"
        save_servers([ServerConfig(**FIXTURE_SERVER_PW)], path=p)
        assert p.exists()

    def test_roundtrip_preserves_all_fields(self, tmp_path):
        p = tmp_path / "servers.json"
        servers = [ServerConfig(**FIXTURE_SERVER_WITH_KEYS)]
        save_servers(servers, path=p)
        loaded = load_servers(path=p)
        assert len(loaded) == 1
        s = loaded[0]
        assert s.id == "phone"
        assert s.auth.password == "pw"
        assert s.service_keys.kdeconnect_device_id == "kc-device-id"


class TestRedactServer:
    """redact_server() strips secrets before logging or display."""

    def test_redacts_password(self):
        s = ServerConfig(**FIXTURE_SERVER_PW)
        out = redact_server(s)
        assert out["auth"]["password"] == "[REDACTED]"
        assert out["id"] == "unraid-main"
        assert out["hostname"] == "<device>.<tailnet>.ts.net"

    def test_redacts_api_key(self):
        srv = dict(FIXTURE_SERVER_PW)
        srv["api_key"] = "sk-live-not-a-real-key"
        s = ServerConfig(**srv)
        out = redact_server(s)
        assert out["api_key"] == "[REDACTED]"

    def test_redacts_service_keys_secrets(self):
        s = ServerConfig(**FIXTURE_SERVER_WITH_KEYS)
        out = redact_server(s)
        assert out["service_keys"]["kdeconnect_device_id"] == "[REDACTED]"
        # adb_serial is not in the secret set (it's a device identifier, not a secret)
        # but we only redact known secret fields; assert structure preserved
        assert out["service_keys"]["adb_serial"] == "ABC123"

    def test_redacts_dict_input(self):
        out = redact_server(dict(FIXTURE_SERVER_PW))
        assert out["auth"]["password"] == "[REDACTED]"
        assert out["id"] == "unraid-main"

    def test_does_not_modify_original(self):
        s = ServerConfig(**FIXTURE_SERVER_PW)
        original_password = s.auth.password
        redact_server(s)
        assert s.auth.password == original_password


class TestRedactError:
    """redact_error() strips secret values from error message strings."""

    def test_redacts_password_in_message(self):
        msg = "connect failed: password=not-a-real-password for user root"
        out = redact_error(msg, secrets=["not-a-real-password"])
        assert "[REDACTED]" in out
        assert "not-a-real-password" not in out

    def test_redacts_token_in_message(self):
        msg = "HTTP 401: token sk-live-abc123 rejected"
        out = redact_error(msg, secrets=["sk-live-abc123"])
        assert "sk-live-abc123" not in out
        assert "[REDACTED]" in out

    def test_no_secrets_returns_message_unchanged(self):
        msg = "connection timed out after 30s"
        assert redact_error(msg) == msg

    def test_empty_secrets_returns_message_unchanged(self):
        msg = "connection timed out after 30s"
        assert redact_error(msg, secrets=[]) == msg
