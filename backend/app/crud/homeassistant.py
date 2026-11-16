"""CRUD operations for Home Assistant endpoints (WS-2.6).

Home Assistant operations communicate with an HA instance via HTTP API.
Without real integration, endpoints return structured placeholder responses.
"""

from typing import Any


async def get_homeassistant_states(server_id: str) -> list[dict[str, Any]]:
    return []


async def get_homeassistant_config(server_id: str) -> dict[str, Any]:
    return {"version": "", "configDir": ""}


async def get_homeassistant_areas(server_id: str) -> list[dict[str, Any]]:
    return []


async def get_homeassistant_devices(server_id: str) -> list[dict[str, Any]]:
    return []


async def get_homeassistant_entities(server_id: str) -> list[dict[str, Any]]:
    return []


async def homeassistant_toggle(server_id: str, entity_id: str) -> dict[str, str]:
    return {"message": f"toggled {entity_id}"}


async def homeassistant_turn_on(server_id: str, entity_id: str) -> dict[str, str]:
    return {"message": f"turned on {entity_id}"}


async def homeassistant_turn_off(server_id: str, entity_id: str) -> dict[str, str]:
    return {"message": f"turned off {entity_id}"}
