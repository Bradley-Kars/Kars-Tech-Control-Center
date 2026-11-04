"""A1 removal regression: every MySpeed artifact is gone from the backend.

RED while MySpeed is still present (module imports, routes registered,
service_keys fields, stubs, source files). GREEN once A1 is complete.
"""

from importlib import import_module
from pathlib import Path

import pytest

import json

from fleet.config import redact_server, load_servers, SECRET_SERVICE_KEYS, ServiceKeys
import fleet.router as router_mod
from fleet.router import DEFAULT_SERVICES, router

REPO = Path(__file__).resolve().parent.parent.parent


def test_myspeed_service_module_cannot_be_imported():
    with pytest.raises(ModuleNotFoundError):
        import_module("fleet.myspeed_service")


def test_router_module_has_no_myspeed_names():
    names = [n for n in dir(router_mod) if "myspeed" in n.lower()]
    assert names == []


def test_router_has_no_myspeed_path():
    paths = [getattr(r, "path", "") for r in router.routes]
    assert not any("/myspeed" in p for p in paths)


def test_router_has_no_myspeed_route_name():
    names = [getattr(r, "name", None) or "" for r in router.routes]
    assert not any("myspeed" in n.lower() for n in names)


def test_service_keys_has_no_myspeed_fields():
    assert "myspeed_db_path" not in ServiceKeys.model_fields
    assert "myspeed_url" not in ServiceKeys.model_fields


def test_service_keys_instance_rejects_myspeed_attribute():
    with pytest.raises(AttributeError):
        ServiceKeys().myspeed_db_path  # type: ignore[attr-defined]


def test_myspeed_is_not_a_secret_field():
    assert "myspeed_db_path" not in ServiceKeys.SECRET_FIELDS
    assert "myspeed_db_path" not in SECRET_SERVICE_KEYS
    assert "myspeed_url" not in ServiceKeys.SECRET_FIELDS
    assert "myspeed_url" not in SECRET_SERVICE_KEYS


def test_default_services_has_no_myspeed():
    assert "myspeed" not in DEFAULT_SERVICES


def test_default_services_keeps_other_services():
    assert "adguard" in DEFAULT_SERVICES
    assert "lidarr" in DEFAULT_SERVICES


def test_stubs_package_has_no_myspeed_stub():
    with pytest.raises(ImportError):
        from tests.stubs import MySpeedStub  # noqa: F401


def test_stubs_all_exports_exclude_myspeed():
    from tests.stubs import __all__ as stubs_all

    assert "MySpeedStub" not in stubs_all


def test_stub_cluster_has_no_myspeed():
    from tests.stubs.all import StubCluster

    cluster = StubCluster()
    assert not hasattr(cluster, "myspeed")
    assert "MySpeedStub" not in {type(stub).__name__ for stub in cluster.all}


def test_collect_only_has_no_myspeed_test_modules():
    for name in ("tests.test_myspeed_service", "tests.test_myspeed_routes"):
        with pytest.raises(ModuleNotFoundError):
            import_module(name)


def test_myspeed_files_deleted():
    for rel in (
        "backend/fleet/myspeed_service.py",
        "backend/tests/test_myspeed_service.py",
        "backend/tests/test_myspeed_routes.py",
        "backend/tests/stubs/myspeed.py",
    ):
        assert not (REPO / rel).exists(), f"{rel} still exists"


def test_config_source_has_no_myspeed():
    assert "myspeed" not in (REPO / "backend/fleet/config.py").read_text()


def test_router_source_has_no_myspeed():
    assert "myspeed" not in (REPO / "backend/fleet/router.py").read_text()


def test_router_still_has_adguard_routes():
    paths = [getattr(r, "path", "") for r in router.routes]
    assert any("/adguard" in p for p in paths)


def test_redact_server_leaves_myspeed_keys_unredacted():
    # myspeed_db_path is no longer a tracked/secret field: redaction must not
    # touch it, and it must not crash redaction either.
    server = {
        "id": "unraid-main",
        "name": "Unraid",
        "hostname": "home-server",
        "auth": {"type": "password", "password": "hunter2"},
        "service_keys": {"myspeed_db_path": "/mnt/user/appdata/myspeed/storage.db"},
    }
    redacted = redact_server(server)
    assert redacted["service_keys"]["myspeed_db_path"] == "/mnt/user/appdata/myspeed/storage.db"


def test_service_keys_preserves_unknown_myspeed_key():
    servers = load_servers(
        defaults=[],
        path=Path.home() / "config" / "does-not-exist.json",
    )
    assert servers == []
    keys = ServiceKeys(myspeed_db_path="/some/old/path.db", myspeed_url="http://old.example")
    dumped = keys.model_dump()
    assert dumped["myspeed_db_path"] == "/some/old/path.db"
    assert dumped["myspeed_url"] == "http://old.example"


def test_load_servers_tolerates_legacy_myspeed_entry(tmp_path, monkeypatch):
    # Old servers.json entries carrying myspeed keys must not crash the loader.
    fixture = tmp_path / "servers.json"
    fixture.write_text(
        json.dumps(
            [
                {
                    "id": "unraid-main",
                    "name": "Unraid",
                    "hostname": "home-server",
                    "auth": {"type": "password", "password": "x"},
                    "service_keys": {"myspeed_db_path": "/mnt/user/appdata/myspeed/storage.db"},
                }
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("KTS_SERVERS_FILE", str(fixture))
    servers = load_servers()
    assert len(servers) == 1
    assert servers[0].id == "unraid-main"
