"""Home Assistant endpoints (WS-2.6).

GET/POST /servers/{id}/homeassistant/* (states, config, areas, devices,
entities, toggle, turn_on, turn_off)
"""

from typing import Any

from fastapi import APIRouter

from app.crud.homeassistant import (
    get_homeassistant_areas,
    get_homeassistant_config,
    get_homeassistant_devices,
    get_homeassistant_entities,
    get_homeassistant_states,
    homeassistant_toggle,
    homeassistant_turn_off,
    homeassistant_turn_on,
)
from app.schemas.homeassistant import (
    HAActionResult,
    HomeAssistantArea,
    HomeAssistantConfigData,
    HomeAssistantDevice,
    HomeAssistantEntity,
    HomeAssistantState,
)

router = APIRouter()


@router.get("/servers/{server_id}/homeassistant/states", response_model=list[HomeAssistantState])
async def get_homeassistant_states_endpoint(server_id: str) -> Any:
    """Get HA states (formerly Tauri `get_homeassistant_states`)."""
    return await get_homeassistant_states(server_id)


@router.get("/servers/{server_id}/homeassistant/config", response_model=HomeAssistantConfigData)
async def get_homeassistant_config_endpoint(server_id: str) -> Any:
    """Get HA config (formerly Tauri `get_homeassistant_config`)."""
    return await get_homeassistant_config(server_id)


@router.get("/servers/{server_id}/homeassistant/areas", response_model=list[HomeAssistantArea])
async def get_homeassistant_areas_endpoint(server_id: str) -> Any:
    """List HA areas (formerly Tauri `get_homeassistant_areas`)."""
    return await get_homeassistant_areas(server_id)


@router.get("/servers/{server_id}/homeassistant/devices", response_model=list[HomeAssistantDevice])
async def get_homeassistant_devices_endpoint(server_id: str) -> Any:
    """List HA devices (formerly Tauri `get_homeassistant_devices`)."""
    return await get_homeassistant_devices(server_id)


@router.get("/servers/{server_id}/homeassistant/entities", response_model=list[HomeAssistantEntity])
async def get_homeassistant_entities_endpoint(server_id: str) -> Any:
    """List HA entities (formerly Tauri `get_homeassistant_entities`)."""
    return await get_homeassistant_entities(server_id)


@router.post("/servers/{server_id}/homeassistant/entities/{entity_id}/toggle", response_model=HAActionResult)
async def homeassistant_toggle_endpoint(server_id: str, entity_id: str) -> Any:
    """Toggle HA entity (formerly Tauri `homeassistant_toggle`)."""
    return await homeassistant_toggle(server_id, entity_id)


@router.post("/servers/{server_id}/homeassistant/entities/{entity_id}/on", response_model=HAActionResult)
async def homeassistant_turn_on_endpoint(server_id: str, entity_id: str) -> Any:
    """Turn on HA entity (formerly Tauri `homeassistant_turn_on`)."""
    return await homeassistant_turn_on(server_id, entity_id)


@router.post("/servers/{server_id}/homeassistant/entities/{entity_id}/off", response_model=HAActionResult)
async def homeassistant_turn_off_endpoint(server_id: str, entity_id: str) -> Any:
    """Turn off HA entity (formerly Tauri `homeassistant_turn_off`)."""
    return await homeassistant_turn_off(server_id, entity_id)
