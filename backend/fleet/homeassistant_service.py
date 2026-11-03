"""backend/fleet/homeassistant_service.py — Home Assistant port (P8).

Port of src-tauri/src/services/homeassistant.rs: entity states, server config,
areas, devices, entity registry, and service calls (toggle / turn on / turn
off) over Home Assistant's HTTP API (/api/...), using a Bearer token.
Credentials are resolved from ``ServiceKeys`` (``homeassistant_url`` /
``homeassistant_token``).

Built on httpx (already a project dependency); tests replay recorded
responses via FixtureHomeAssistantClient — no real network, no real Home
Assistant server. The real client never sends its bearer token to anything
but the configured Home Assistant base URL, and errors are redacted by the
router before they reach the client.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import httpx


class HomeAssistantError(Exception):
    """Raised when a Home Assistant API request fails."""


class HomeAssistantClient(ABC):
    """Abstract base for Home Assistant API clients."""

    @abstractmethod
    async def get_states(self) -> list[HomeAssistantState]:
        """Return the states of all entities."""
        ...

    @abstractmethod
    async def get_config(self) -> HomeAssistantConfig:
        """Return server configuration (version, components, ...)."""
        ...

    @abstractmethod
    async def get_areas(self) -> list[HomeAssistantArea]:
        """Return the configured areas."""
        ...

    @abstractmethod
    async def get_devices(self) -> list[HomeAssistantDevice]:
        """Return the registered devices."""
        ...

    @abstractmethod
    async def get_entities(self) -> list[HomeAssistantEntity]:
        """Return the entity registry entries."""
        ...

    @abstractmethod
    async def toggle_entity(self, entity_id: str) -> None:
        """Toggle an entity (call the domain's toggle service)."""
        ...

    @abstractmethod
    async def turn_on_entity(self, entity_id: str) -> None:
        """Turn an entity on."""
        ...

    @abstractmethod
    async def turn_off_entity(self, entity_id: str) -> None:
        """Turn an entity off."""
        ...


# ---------------------------------------------------------------------------
# Response shapes (mirror src-tauri/src/services/homeassistant.rs)
# ---------------------------------------------------------------------------


@dataclass
class HomeAssistantState:
    entity_id: str = ""
    state: str = ""
    attributes: dict[str, Any] = field(default_factory=dict)
    last_changed: str = ""
    last_updated: str = ""
    context: dict[str, Any] = field(default_factory=dict)


@dataclass
class HomeAssistantConfig:
    components: list[str] = field(default_factory=list)
    config_dir: str = ""
    elevation: float = 0.0
    latitude: float = 0.0
    location_name: str = ""
    longitude: float = 0.0
    time_zone: str = ""
    unit_system: Any = None
    version: str = ""
    allowlist_external_dirs: list[str] = field(default_factory=list)
    allowlist_external_urls: list[str] = field(default_factory=list)
    currency: str = ""
    external_url: str | None = None
    internal_url: str | None = None
    theme: str | None = None
    language: str | None = None


@dataclass
class HomeAssistantService:
    domain: str = ""
    service: str = ""
    description: str = ""
    fields: dict[str, Any] = field(default_factory=dict)
    target: Any = None


@dataclass
class HomeAssistantServices:
    services: dict[str, dict[str, HomeAssistantService]] = field(default_factory=dict)


@dataclass
class HomeAssistantArea:
    area_id: str = ""
    name: str = ""
    picture: str | None = None
    icon: str | None = None
    floor_id: str | None = None


@dataclass
class HomeAssistantDevice:
    id: str = ""
    name: str = ""
    name_by_user: str | None = None
    model: str | None = None
    manufacturer: str | None = None
    sw_version: str | None = None
    hw_version: str | None = None
    area_id: str | None = None
    labels: list[str] = field(default_factory=list)
    config_entries: list[str] = field(default_factory=list)
    entry_type: str | None = None
    identifiers: list[list[str]] = field(default_factory=list)
    connections: list[list[str]] = field(default_factory=list)
    via_device_id: str | None = None


@dataclass
class HomeAssistantEntity:
    entity_id: str = ""
    unique_id: str = ""
    platform: str = ""
    device_id: str | None = None
    area_id: str | None = None
    name: str | None = None
    original_name: str | None = None
    disabled_by: str | None = None
    hidden_by: str | None = None
    entity_category: str | None = None
    icon: str | None = None
    unit_of_measurement: str | None = None
    device_class: str | None = None
    original_device_class: str | None = None
    supported_features: int = 0
    capabilities: Any = None


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


def _as_optional_bool(value: Any) -> bool | None:
    if value is None:
        return None
    return bool(value)


def parse_homeassistant_state(raw: Any) -> HomeAssistantState:
    """Parse one ``/api/states`` entry into HomeAssistantState."""
    if not isinstance(raw, dict):
        return HomeAssistantState()
    return HomeAssistantState(
        entity_id=str(raw.get("entity_id") or ""),
        state=str(raw.get("state") or ""),
        attributes=raw.get("attributes") if isinstance(raw.get("attributes"), dict) else {},
        last_changed=_as_str(raw, "last_changed"),
        last_updated=_as_str(raw, "last_updated"),
        context=raw.get("context") if isinstance(raw.get("context"), dict) else {},
    )


def parse_homeassistant_config(raw: Any) -> HomeAssistantConfig:
    """Parse the ``/api/config`` envelope into HomeAssistantConfig."""
    if not isinstance(raw, dict):
        return HomeAssistantConfig()
    return HomeAssistantConfig(
        components=[str(c) for c in _as_list(raw.get("components")) if isinstance(c, str)],
        config_dir=str(raw.get("config_dir") or ""),
        elevation=_as_float(raw, "elevation", 0.0),
        latitude=_as_float(raw, "latitude", 0.0),
        location_name=_as_str(raw, "location_name"),
        longitude=_as_float(raw, "longitude", 0.0),
        time_zone=_as_str(raw, "time_zone"),
        unit_system=raw.get("unit_system"),
        version=_as_str(raw, "version"),
        allowlist_external_dirs=[str(d) for d in _as_list(raw.get("allowlist_external_dirs")) if isinstance(d, str)],
        allowlist_external_urls=[str(u) for u in _as_list(raw.get("allowlist_external_urls")) if isinstance(u, str)],
        currency=str(raw.get("currency") or ""),
        external_url=_as_optional_str(raw.get("external_url")),
        internal_url=_as_optional_str(raw.get("internal_url")),
        theme=_as_optional_str(raw.get("theme")),
        language=_as_optional_str(raw.get("language")),
    )


def parse_homeassistant_area(raw: Any) -> HomeAssistantArea:
    """Parse one area-registry entry into HomeAssistantArea."""
    if not isinstance(raw, dict):
        return HomeAssistantArea()
    return HomeAssistantArea(
        area_id=_as_str(raw, "area_id"),
        name=_as_str(raw, "name"),
        picture=_as_optional_str(raw.get("picture")),
        icon=_as_optional_str(raw.get("icon")),
        floor_id=_as_optional_str(raw.get("floor_id")),
    )


def parse_homeassistant_device(raw: Any) -> HomeAssistantDevice:
    """Parse one device-registry entry into HomeAssistantDevice."""
    if not isinstance(raw, dict):
        return HomeAssistantDevice()

    def _pairs(value: Any) -> list[list[str]]:
        if not isinstance(value, list):
            return []
        out: list[list[str]] = []
        for item in value:
            if isinstance(item, list):
                out.append([str(x) for x in item])
        return out

    return HomeAssistantDevice(
        id=_as_str(raw, "id"),
        name=_as_str(raw, "name"),
        name_by_user=_as_optional_str(raw.get("name_by_user")),
        model=_as_optional_str(raw.get("model")),
        manufacturer=_as_optional_str(raw.get("manufacturer")),
        sw_version=_as_optional_str(raw.get("sw_version")),
        hw_version=_as_optional_str(raw.get("hw_version")),
        area_id=_as_optional_str(raw.get("area_id")),
        labels=[str(l) for l in _as_list(raw.get("labels")) if isinstance(l, str)],
        config_entries=[str(e) for e in _as_list(raw.get("config_entries")) if isinstance(e, str)],
        entry_type=_as_optional_str(raw.get("entry_type")),
        identifiers=_pairs(raw.get("identifiers")),
        connections=_pairs(raw.get("connections")),
        via_device_id=_as_optional_str(raw.get("via_device_id")),
    )


def parse_homeassistant_entity(raw: Any) -> HomeAssistantEntity:
    """Parse one entity-registry entry into HomeAssistantEntity."""
    if not isinstance(raw, dict):
        return HomeAssistantEntity()
    return HomeAssistantEntity(
        entity_id=_as_str(raw, "entity_id"),
        unique_id=_as_str(raw, "unique_id"),
        platform=_as_str(raw, "platform"),
        device_id=_as_optional_str(raw.get("device_id")),
        area_id=_as_optional_str(raw.get("area_id")),
        name=_as_optional_str(raw.get("name")),
        original_name=_as_optional_str(raw.get("original_name")),
        disabled_by=_as_optional_str(raw.get("disabled_by")),
        hidden_by=_as_optional_str(raw.get("hidden_by")),
        entity_category=_as_optional_str(raw.get("entity_category")),
        icon=_as_optional_str(raw.get("icon")),
        unit_of_measurement=_as_optional_str(raw.get("unit_of_measurement")),
        device_class=_as_optional_str(raw.get("device_class")),
        original_device_class=_as_optional_str(raw.get("original_device_class")),
        supported_features=int(raw.get("supported_features") or 0)
        if not isinstance(raw.get("supported_features"), bool)
        else 0,
        capabilities=raw.get("capabilities"),
    )


def parse_homeassistant_states(raw: Any) -> list[HomeAssistantState]:
    return [parse_homeassistant_state(e) for e in _as_list(raw) if isinstance(e, dict)]


def parse_homeassistant_areas(raw: Any) -> list[HomeAssistantArea]:
    return [parse_homeassistant_area(e) for e in _as_list(raw) if isinstance(e, dict)]


def parse_homeassistant_devices(raw: Any) -> list[HomeAssistantDevice]:
    return [parse_homeassistant_device(e) for e in _as_list(raw) if isinstance(e, dict)]


def parse_homeassistant_entities(raw: Any) -> list[HomeAssistantEntity]:
    return [parse_homeassistant_entity(e) for e in _as_list(raw) if isinstance(e, dict)]


def _domain(entity_id: str) -> str:
    """The service domain for an entity_id (the part before the first dot)."""
    return entity_id.split(".", 1)[0] if entity_id else "homeassistant"


# ---------------------------------------------------------------------------
# Real client
# ---------------------------------------------------------------------------


class RealHomeAssistantClient(HomeAssistantClient):
    """Real Home Assistant client using httpx against a local server.

    Sends a Bearer token on every request. Self-signed certs are accepted
    (the norm on this LAN).
    """

    def __init__(self, base_url: str, token: str, timeout: float = 30.0):
        if not base_url or not base_url.strip():
            raise ValueError("homeassistant_url not configured")
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self._headers: dict[str, str] = {
            "Authorization": f"Bearer {token}",
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

    async def _get(self, path: str) -> Any:
        """GET ``{base_url}/api/{path}`` and return the parsed JSON."""
        url = f"{self.base_url}/api/{path}"
        resp = await self._client.get(url)
        if resp.status_code >= 400:
            raise HomeAssistantError(f"Home Assistant error {resp.status_code}: {resp.text[:500]}")
        try:
            return resp.json()
        except ValueError as exc:
            raise HomeAssistantError(f"Home Assistant parse error from {path}: {exc}") from exc

    async def _post(self, path: str, body: Any = None) -> Any:
        """POST ``{base_url}/api/{path}`` and return the parsed JSON."""
        url = f"{self.base_url}/api/{path}"
        resp = await self._client.post(url, json=body or {})
        if resp.status_code >= 400:
            raise HomeAssistantError(f"Home Assistant error {resp.status_code}: {resp.text[:500]}")
        try:
            return resp.json()
        except ValueError:
            return {}

    async def get_states(self) -> list[HomeAssistantState]:
        return parse_homeassistant_states(await self._get("states"))

    async def get_config(self) -> HomeAssistantConfig:
        return parse_homeassistant_config(await self._get("config"))

    async def get_areas(self) -> list[HomeAssistantArea]:
        return parse_homeassistant_areas(await self._get("config/area_registry"))

    async def get_devices(self) -> list[HomeAssistantDevice]:
        return parse_homeassistant_devices(await self._get("config/device_registry"))

    async def get_entities(self) -> list[HomeAssistantEntity]:
        return parse_homeassistant_entities(await self._get("config/entity_registry"))

    async def toggle_entity(self, entity_id: str) -> None:
        await self._post(f"services/{_domain(entity_id)}/toggle", {"entity_id": entity_id})

    async def turn_on_entity(self, entity_id: str) -> None:
        await self._post(f"services/{_domain(entity_id)}/turn_on", {"entity_id": entity_id})

    async def turn_off_entity(self, entity_id: str) -> None:
        await self._post(f"services/{_domain(entity_id)}/turn_off", {"entity_id": entity_id})


# ---------------------------------------------------------------------------
# Fixture client
# ---------------------------------------------------------------------------


class FixtureHomeAssistantClient(HomeAssistantClient):
    """Fixture-based Home Assistant client for testing.

    Returns recorded fixture data instead of making live HTTP requests.
    No live Home Assistant server is required.
    """

    def __init__(self, fixtures: dict[str, Any] | None = None):
        self.fixtures = dict(fixtures or {})

    async def get_states(self) -> list[HomeAssistantState]:
        raw = self.fixtures.get("states", [])
        return [
            s if isinstance(s, HomeAssistantState) else parse_homeassistant_state(s)
            for s in raw
            if isinstance(s, (HomeAssistantState, dict))
        ]

    async def get_config(self) -> HomeAssistantConfig:
        return _fixture_dataclass(self.fixtures.get("config"), HomeAssistantConfig)

    async def get_areas(self) -> list[HomeAssistantArea]:
        raw = self.fixtures.get("areas", [])
        return [
            a if isinstance(a, HomeAssistantArea) else parse_homeassistant_area(a)
            for a in raw
            if isinstance(a, (HomeAssistantArea, dict))
        ]

    async def get_devices(self) -> list[HomeAssistantDevice]:
        raw = self.fixtures.get("devices", [])
        return [
            d if isinstance(d, HomeAssistantDevice) else parse_homeassistant_device(d)
            for d in raw
            if isinstance(d, (HomeAssistantDevice, dict))
        ]

    async def get_entities(self) -> list[HomeAssistantEntity]:
        raw = self.fixtures.get("entities", [])
        return [
            e if isinstance(e, HomeAssistantEntity) else parse_homeassistant_entity(e)
            for e in raw
            if isinstance(e, (HomeAssistantEntity, dict))
        ]

    async def toggle_entity(self, entity_id: str) -> None:
        return None

    async def turn_on_entity(self, entity_id: str) -> None:
        return None

    async def turn_off_entity(self, entity_id: str) -> None:
        return None


def _fixture_dataclass(raw: Any, cls: type) -> Any:
    if isinstance(raw, cls):
        return raw
    if isinstance(raw, dict):
        return cls(**raw)
    return cls()


__all__ = [
    "HomeAssistantError",
    "HomeAssistantClient",
    "RealHomeAssistantClient",
    "FixtureHomeAssistantClient",
    "HomeAssistantState",
    "HomeAssistantConfig",
    "HomeAssistantService",
    "HomeAssistantServices",
    "HomeAssistantArea",
    "HomeAssistantDevice",
    "HomeAssistantEntity",
    "parse_homeassistant_state",
    "parse_homeassistant_states",
    "parse_homeassistant_config",
    "parse_homeassistant_area",
    "parse_homeassistant_areas",
    "parse_homeassistant_device",
    "parse_homeassistant_devices",
    "parse_homeassistant_entity",
    "parse_homeassistant_entities",
]
