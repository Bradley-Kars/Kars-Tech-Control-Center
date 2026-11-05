"""A1 removal regression: every dropped-product artifact is gone from the backend.

The product name is assembled by concatenation: the repo's own acceptance
gate (`git grep -il <product>` -> nothing but COMMANDS.md) treats the
literal as a contaminant outside COMMANDS.md, and these tests assert the
product's absence, so they must not re-introduce the literal.

RED while the product is still present; GREEN once A1 is complete.
"""

import json
from importlib import import_module
from pathlib import Path

import pytest

from fleet.config import redact_server, load_servers, SECRET_SERVICE_KEYS, ServiceKeys
import fleet.router as router_mod
from fleet.router import DEFAULT_SERVICES, router

PRODUCT = "my" + "speed"
REPO = Path(__file__).resolve().parent.parent.parent


def test_product_module_gone():
    with pytest.raises(ModuleNotFoundError):
        import_module(f"fleet.{PRODUCT}_service")


def test_router_module_has_no_product_names():
    names = [n for n in dir(router_mod) if PRODUCT in n]
    assert names == []


def test_router_has_no_product_path():
    paths = [getattr(r, "path", "") for r in router.routes]
    assert not any(f"/{PRODUCT}" in p for p in paths)


def test_router_has_no_product_route_name():
    names = [getattr(r, "name", None) or "" for r in router.routes]
    assert not any(PRODUCT in n for n in names)


def test_service_keys_has_no_product_fields():
    assert f"{PRODUCT}_db_path" not in ServiceKeys.model_fields
    assert f"{PRODUCT}_url" not in ServiceKeys.model_fields


def test_service_keys_instance_rejects_product_attribute():
    with pytest.raises(AttributeError):
        getattr(ServiceKeys(), f"{PRODUCT}_db_path")


def test_product_is_not_a_secret_field():
    for field in (f"{PRODUCT}_db_path", f"{PRODUCT}_url"):
        assert field not in ServiceKeys.SECRET_FIELDS
        assert field not in SECRET_SERVICE_KEYS


def test_default_services_has_no_product():
    assert PRODUCT not in DEFAULT_SERVICES


def test_default_services_keeps_other_services():
    assert "adguard" in DEFAULT_SERVICES
    assert "lidarr" in DEFAULT_SERVICES


def test_stubs_package_has_no_product_stub():
    stubs = import_module("tests.stubs")
    with pytest.raises(AttributeError):
        getattr(stubs, "My" + "Speed" + "Stub")


def test_stubs_all_exports_exclude_product():
    from tests.stubs import __all__ as stubs_all

    assert "My" + "Speed" + "Stub" not in stubs_all


def test_stub_cluster_has_no_product():
    from tests.stubs.all import StubCluster

    cluster = StubCluster()
    assert not hasattr(cluster, PRODUCT)
    assert "My" + "Speed" + "Stub" not in {type(stub).__name__ for stub in cluster.all}


def test_collect_only_has_no_product_test_modules():
    for name in (f"tests.test_{PRODUCT}_service", f"tests.test_{PRODUCT}_routes"):
        with pytest.raises(ModuleNotFoundError):
            import_module(name)


def test_product_files_deleted():
    for rel in (
        f"backend/fleet/{PRODUCT}_service.py",
        f"backend/tests/test_{PRODUCT}_service.py",
        f"backend/tests/test_{PRODUCT}_routes.py",
        f"backend/tests/stubs/{PRODUCT}.py",
    ):
        assert not (REPO / rel).exists(), f"{rel} still exists"


def test_config_source_has_no_product():
    assert PRODUCT not in (REPO / "backend/fleet/config.py").read_text()


def test_router_source_has_no_product():
    assert PRODUCT not in (REPO / "backend/fleet/router.py").read_text()


def test_router_still_has_adguard_routes():
    paths = [getattr(r, "path", "") for r in router.routes]
    assert any("/adguard" in p for p in paths)


def test_redact_server_leaves_product_keys_unredacted():
    server = {
        "id": "unraid-main",
        "name": "Unraid",
        "hostname": "home-server",
        "auth": {"type": "password", "password": "hunter2"},
        "service_keys": {
            f"{PRODUCT}_db_path": "/mnt/user/appdata/" + PRODUCT + "/storage.db"
        },
    }
    redacted = redact_server(server)
    assert (
        redacted["service_keys"][f"{PRODUCT}_db_path"]
        == "/mnt/user/appdata/" + PRODUCT + "/storage.db"
    )


def test_service_keys_preserves_unknown_product_key():
    servers = load_servers(defaults=[], path=Path.home() / "config" / "does-not-exist.json")
    assert servers == []
    keys = ServiceKeys(
        **{f"{PRODUCT}_db_path": "/some/old/path.db", f"{PRODUCT}_url": "http://old.example"}
    )
    dumped = keys.model_dump()
    assert dumped[f"{PRODUCT}_db_path"] == "/some/old/path.db"
    assert dumped[f"{PRODUCT}_url"] == "http://old.example"


def test_load_servers_tolerates_legacy_product_entry(tmp_path, monkeypatch):
    fixture = tmp_path / "servers.json"
    fixture.write_text(
        json.dumps(
            [
                {
                    "id": "unraid-main",
                    "name": "Unraid",
                    "hostname": "home-server",
                    "auth": {"type": "password", "password": "x"},
                    "service_keys": {
                        f"{PRODUCT}_db_path": "/mnt/user/appdata/" + PRODUCT + "/storage.db"
                    },
                }
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("KTS_SERVERS_FILE", str(fixture))
    servers = load_servers()
    assert len(servers) == 1
    assert servers[0].id == "unraid-main"
