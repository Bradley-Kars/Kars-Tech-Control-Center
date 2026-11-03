"""backend/fleet/homeassistant_service unit tests (P8).

Fixture-only: no network, no real Home Assistant server. Placeholder values
only — no real hostnames, emails, or tokens.
"""

from __future__ import annotations

import sys
import os
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from fleet.homeassistant_service import (  # noqa: E402
    HomeAssistantError,
    HomeAssistantClient,
    RealHomeAssistantClient,
    FixtureHomeAssistantClient,
    HomeAssistantState,
    HomeAssistantConfig,
    HomeAssistantService,
    HomeAssistantServices,
    HomeAssistantArea,
    HomeAssistantDevice,
    HomeAssistantEntity,
    parse_homeassistant_state,
    parse_homeassistant_states,
    parse_homeassistant_config,
    parse_homeassistant_area,
    parse_homeassistant_areas,
    parse_homeassistant_device,
    parse_homeassistant_devices,
    parse_homeassistant_entity,
    parse_homeassistant_entities,
)

STATE = HomeAssistantState(
    entity_id="light.living_room",
    state="on",
    attributes={"friendly_name": "Living Room Light", "brightness": 255},
    last_changed="2026-11-03T10:00:00Z",
    last_updated="2026-11-03T10:00:00Z",
    context={"id": "ctx-1"},
)

CONFIG = HomeAssistantConfig(
    components=["hue", "zwave", "mqtt", "automation"],
    config_dir="/config",
    elevation=300.0,
    latitude=41.8781,
    location_name="Home",
    longitude=-87.6298,
    time_zone="America/Chicago",
    unit_system={"length": "mi", "mass": "lb", "temperature": "°F"},
    version="2026.1.0",
    allowlist_external_dirs=["/config"],
    allowlist_external_urls=[],
    currency="USD",
    external_url=None,
    internal_url=None,
    theme=None,
    language=None,
)

AREA = HomeAssistantArea(
    area_id="living_room",
    name="Living Room",
    picture=None,
    icon="sofa",
    floor_id="ground_floor",
)

DEVICE = HomeAssistantDevice(
    id="device-1",
    name="Philips Hue Bridge",
    name_by_user="Hue Bridge",
    model="Bridge V2",
    manufacturer="Signify",
    sw_version="1.50.2",
    hw_version=None,
    area_id="living_room",
    labels=[],
    config_entries=["entry-1"],
    entry_type=None,
    identifiers=[["hue", "bridge-1"]],
    connections=[],
    via_device_id=None,
)

ENTITY = HomeAssistantEntity(
    entity_id="light.living_room",
    unique_id="hl-1",
    platform="hue",
    device_id="device-1",
    area_id="living_room",
    name="Living Room Light",
    original_name="Living Room Light",
    disabled_by=None,
    hidden_by=None,
    entity_category=None,
    icon=None,
    unit_of_measurement=None,
    device_class=None,
    original_device_class=None,
    supported_features=1,
    capabilities=None,
)


# ---------------------------------------------------------------------------
# Fixture client
# ---------------------------------------------------------------------------


def test_fixture_client_returns_stored_states():
    client = FixtureHomeAssistantClient({"states": [STATE]})
    import asyncio

    result = asyncio.run(client.get_states())
    assert result == [STATE]


def test_fixture_client_returns_stored_config():
    client = FixtureHomeAssistantClient({"config": CONFIG})
    import asyncio

    result = asyncio.run(client.get_config())
    assert result == CONFIG


def test_fixture_client_returns_stored_areas():
    client = FixtureHomeAssistantClient({"areas": [AREA]})
    import asyncio

    result = asyncio.run(client.get_areas())
    assert result == [AREA]


def test_fixture_client_returns_stored_devices():
    client = FixtureHomeAssistantClient({"devices": [DEVICE]})
    import asyncio

    result = asyncio.run(client.get_devices())
    assert result == [DEVICE]


def test_fixture_client_returns_stored_entities():
    client = FixtureHomeAssistantClient({"entities": [ENTITY]})
    import asyncio

    result = asyncio.run(client.get_entities())
    assert result == [ENTITY]


def test_fixture_client_defaults_to_empty():
    client = FixtureHomeAssistantClient()
    import asyncio

    states = asyncio.run(client.get_states())
    assert states == []
    config = asyncio.run(client.get_config())
    assert config.version == ""
    assert config.components == []
    areas = asyncio.run(client.get_areas())
    assert areas == []
    devices = asyncio.run(client.get_devices())
    assert devices == []
    entities = asyncio.run(client.get_entities())
    assert entities == []


# ---------------------------------------------------------------------------
# Pure parse functions (no network)
# ---------------------------------------------------------------------------


STATE_RAW = {
    "entity_id": "light.living_room",
    "state": "on",
    "attributes": {"friendly_name": "Living Room Light", "brightness": 255},
    "last_changed": "2026-11-03T10:00:00Z",
    "last_updated": "2026-11-03T10:00:00Z",
    "context": {"id": "ctx-1"},
}


def test_parse_homeassistant_state():
    state = parse_homeassistant_state(STATE_RAW)
    assert state == STATE


def test_parse_homeassistant_state_defaults():
    state = parse_homeassistant_state({})
    assert state.entity_id == ""
    assert state.state == ""
    assert state.attributes == {}


def test_parse_homeassistant_states():
    states = parse_homeassistant_states([STATE_RAW])
    assert len(states) == 1
    assert states[0] == STATE


def test_parse_homeassistant_states_empty():
    states = parse_homeassistant_states([])
    assert states == []


CONFIG_RAW = {
    "components": ["hue", "zwave", "mqtt", "automation"],
    "config_dir": "/config",
    "elevation": 300,
    "latitude": 41.8781,
    "location_name": "Home",
    "longitude": -87.6298,
    "time_zone": "America/Chicago",
    "unit_system": {"length": "mi", "mass": "lb", "temperature": "°F"},
    "version": "2026.1.0",
    "allowlist_external_dirs": ["/config"],
    "allowlist_external_urls": [],
    "currency": "USD",
    "external_url": None,
    "internal_url": None,
    "theme": None,
    "language": None,
}


def test_parse_homeassistant_config():
    config = parse_homeassistant_config(CONFIG_RAW)
    assert config == CONFIG
    assert config.version == "2026.1.0"
    assert config.location_name == "Home"


def test_parse_homeassistant_config_empty():
    config = parse_homeassistant_config({})
    assert config.version == ""
    assert config.components == []


AREA_RAW = {
    "area_id": "living_room",
    "name": "Living Room",
    "icon": "sofa",
    "floor_id": "ground_floor",
}


def test_parse_homeassistant_area():
    area = parse_homeassistant_area(AREA_RAW)
    assert area == AREA


def test_parse_homeassistant_area_empty():
    area = parse_homeassistant_area({})
    assert area.area_id == ""
    assert area.name == ""


def test_parse_homeassistant_areas():
    areas = parse_homeassistant_areas([AREA_RAW])
    assert len(areas) == 1
    assert areas[0] == AREA


DEVICE_RAW = {
    "id": "device-1",
    "name": "Philips Hue Bridge",
    "name_by_user": "Hue Bridge",
    "model": "Bridge V2",
    "manufacturer": "Signify",
    "sw_version": "1.50.2",
    "area_id": "living_room",
    "labels": [],
    "config_entries": ["entry-1"],
    "entry_type": None,
    "identifiers": [["hue", "bridge-1"]],
    "connections": [],
    "via_device_id": None,
}


def test_parse_homeassistant_device():
    device = parse_homeassistant_device(DEVICE_RAW)
    assert device == DEVICE


def test_parse_homeassistant_device_empty():
    device = parse_homeassistant_device({})
    assert device.id == ""
    assert device.name == ""


ENTITY_RAW = {
    "entity_id": "light.living_room",
    "unique_id": "hl-1",
    "platform": "hue",
    "device_id": "device-1",
    "area_id": "living_room",
    "name": "Living Room Light",
    "original_name": "Living Room Light",
    "disabled_by": None,
    "hidden_by": None,
    "entity_category": None,
    "icon": None,
    "unit_of_measurement": None,
    "device_class": None,
    "original_device_class": None,
    "supported_features": 1,
    "capabilities": None,
}


def test_parse_homeassistant_entity():
    entity = parse_homeassistant_entity(ENTITY_RAW)
    assert entity == ENTITY


def test_parse_homeassistant_entity_empty():
    entity = parse_homeassistant_entity({})
    assert entity.entity_id == ""
    assert entity.supported_features == 0


# ---------------------------------------------------------------------------
# Real client: validation + delegation (no network)
# ---------------------------------------------------------------------------


def test_real_client_requires_base_url():
    with pytest.raises(ValueError, match="homeassistant_url"):
        RealHomeAssistantClient(base_url="", token="not-a-real-token")


def test_real_client_methods_delegate_to_parse_functions():
    client = RealHomeAssistantClient(
        base_url="http://<device>.<tailnet>.ts.net:8123",
        token="not-a-real-token",
    )

    async def fake_get(path):
        if path == "states":
            return [STATE_RAW]
        if path == "config":
            return CONFIG_RAW
        if path == "config/area_registry":
            return [AREA_RAW]
        if path == "config/device_registry":
            return [DEVICE_RAW]
        if path == "config/entity_registry":
            return [ENTITY_RAW]
        return []

    with patch.object(client, "_get", side_effect=fake_get):
        import asyncio

        states = asyncio.run(client.get_states())
        assert len(states) == 1
        assert states[0].entity_id == "light.living_room"
        config = asyncio.run(client.get_config())
        assert config.version == "2026.1.0"
        areas = asyncio.run(client.get_areas())
        assert len(areas) == 1
        devices = asyncio.run(client.get_devices())
        assert len(devices) == 1
        entities = asyncio.run(client.get_entities())
        assert len(entities) == 1


def test_real_client_uses_bearer_token():
    client = RealHomeAssistantClient(
        base_url="http://<device>.<tailnet>.ts.net:8123",
        token="not-a-real-token",
    )
    assert client._headers["Authorization"] == "Bearer not-a-real-token"


def test_homeassistant_error_is_an_exception():
    assert issubclass(HomeAssistantError, Exception)
    err = HomeAssistantError("boom")
    assert str(err) == "boom"


def test_homeassistant_client_is_abstract():
    with pytest.raises(TypeError):
        HomeAssistantClient()
