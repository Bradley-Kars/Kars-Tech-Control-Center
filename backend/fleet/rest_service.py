"""backend/fleet/rest_service.py — Plex + generic REST health port (P5).

Port of the original Rust HTTP service (811 lines): health probing
for 14 REST services over plain HTTP(S), Plex identity/library endpoints,
credential resolution from ServiceKeys, and redacted error handling.

Built on httpx (already a project dependency); tests replay recorded
responses via an injected client — no real network, no real service.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

import httpx


class RestService(StrEnum):
    """A service reached over plain HTTP(S) with a JSON API.

    Every health path was probed live against the fleet on 2026-09-29; the
    *arr apps do NOT share an API version (Lidarr/Prowlarr are v1, Radarr/
    Sonarr are v3), so a single /api/v3/… assumption 404s on half of them.
    """

    Plex = "plex"
    InvoiceNinja = "invoiceninja"
    HomeAssistant = "homeassistant"
    Nextcloud = "nextcloud"
    AdGuard = "adguard"
    Shoko = "shoko"
    QBittorrent = "qbittorrent"
    Lidarr = "lidarr"
    Radarr = "radarr"
    Sonarr = "sonarr"
    Prowlarr = "prowlarr"
    Ombi = "ombi"
    FlareSolverr = "flaresolverr"
    MatterHub = "matter_hub"

    @classmethod
    def parse(cls, value: str) -> "RestService | None":
        for service in cls.ALL:
            if service.value == value:
                return service
        return None

    def label(self) -> str:
        return {
            RestService.Plex: "Plex",
            RestService.InvoiceNinja: "Invoice Ninja",
            RestService.HomeAssistant: "Home Assistant",
            RestService.Nextcloud: "Nextcloud",
            RestService.AdGuard: "AdGuard Home",
            RestService.Shoko: "Shoko",
            RestService.QBittorrent: "qBittorrent",
            RestService.Lidarr: "Lidarr",
            RestService.Radarr: "Radarr",
            RestService.Sonarr: "Sonarr",
            RestService.Prowlarr: "Prowlarr",
            RestService.Ombi: "Ombi",
            RestService.FlareSolverr: "FlareSolverr",
            RestService.MatterHub: "Matter Hub",
        }[self]

    def health_path(self) -> str:
        return {
            RestService.Plex: "/identity",
            RestService.InvoiceNinja: "/api/v1/about",
            RestService.HomeAssistant: "/api/",
            RestService.Nextcloud: "/status.php",
            RestService.AdGuard: "/control/status",
            RestService.Shoko: "/api/v3/Group",
            RestService.QBittorrent: "/api/v2/app/version",
            RestService.Lidarr: "/api/v1/system/status",
            RestService.Radarr: "/api/v3/system/status",
            RestService.Sonarr: "/api/v3/system/status",
            RestService.Prowlarr: "/api/v1/system/status",
            RestService.Ombi: "/api/v1/status",
            RestService.FlareSolverr: "/health",
            RestService.MatterHub: "/",
        }[self]


RestService.ALL: list[RestService] = [
    RestService.Plex,
    RestService.InvoiceNinja,
    RestService.HomeAssistant,
    RestService.Nextcloud,
    RestService.AdGuard,
    RestService.Shoko,
    RestService.QBittorrent,
    RestService.Lidarr,
    RestService.Radarr,
    RestService.Sonarr,
    RestService.Prowlarr,
    RestService.Ombi,
    RestService.FlareSolverr,
    RestService.MatterHub,
]


class ServiceAuth:
    """How a service authenticates. All shapes seen across the fleet's APIs."""

    @classmethod
    def none(cls) -> "ServiceAuth":
        return _AuthNone()

    @classmethod
    def header(cls, name: str, value: str) -> "ServiceAuth":
        return _AuthHeader(name, value)

    @classmethod
    def bearer(cls, token: str) -> "ServiceAuth":
        return _AuthBearer(token)

    @classmethod
    def basic(cls, user: str, password: str) -> "ServiceAuth":
        return _AuthBasic(user, password)

    @classmethod
    def query(cls, name: str, value: str) -> "ServiceAuth":
        return _AuthQuery(name, value)

    def apply(self, request: httpx.Request) -> None:
        raise NotImplementedError  # pragma: no cover


class _AuthNone(ServiceAuth):
    def apply(self, request: httpx.Request) -> None:
        pass

    def __eq__(self, other: object) -> bool:
        return isinstance(other, _AuthNone)

    def __repr__(self) -> str:
        return "ServiceAuth.none()"


class _AuthHeader(ServiceAuth):
    def __init__(self, name: str, value: str):
        self.name = name
        self.value = value

    def apply(self, request: httpx.Request) -> None:
        request.headers[self.name] = self.value

    def __eq__(self, other: object) -> bool:
        return isinstance(other, _AuthHeader) and (self.name, self.value) == (other.name, other.value)

    def __repr__(self) -> str:
        return f"ServiceAuth.header({self.name!r}, {self.value!r})"


class _AuthBearer(ServiceAuth):
    def __init__(self, token: str):
        self.token = token

    def apply(self, request: httpx.Request) -> None:
        request.headers["Authorization"] = f"Bearer {self.token}"

    def __eq__(self, other: object) -> bool:
        return isinstance(other, _AuthBearer) and self.token == other.token

    def __repr__(self) -> str:
        return f"ServiceAuth.bearer({self.token!r})"


class _AuthBasic(ServiceAuth):
    def __init__(self, user: str, password: str):
        self.user = user
        self.password = password

    def apply(self, request: httpx.Request) -> None:
        request.auth = (self.user, self.password)

    def __eq__(self, other: object) -> bool:
        return isinstance(other, _AuthBasic) and (self.user, self.password) == (other.user, other.password)

    def __repr__(self) -> str:
        return f"ServiceAuth.basic({self.user!r}, {self.password!r})"


class _AuthQuery(ServiceAuth):
    def __init__(self, name: str, value: str):
        self.name = name
        self.value = value

    def apply(self, request: httpx.Request) -> None:
        # Query auth is applied per-request via params, not headers.
        pass

    def __eq__(self, other: object) -> bool:
        return isinstance(other, _AuthQuery) and (self.name, self.value) == (other.name, other.value)

    def __repr__(self) -> str:
        return f"ServiceAuth.query({self.name!r}, {self.value!r})"


@dataclass
class ServiceConfig:
    base_url: str
    auth: ServiceAuth

    @classmethod
    def from_keys(cls, service: RestService, keys: Any) -> "ServiceConfig":
        """Build config from a ServiceKeys-like object.

        Raises ValueError naming the missing key when a required credential
        is absent or blank. Unknown keys pass through unchanged.
        """

        def req(field: str | None) -> str:
            if field is None or not field.strip():
                raise ValueError(f"{service.value}_url not configured" if field is None else f"{service.value}_url not configured")
            return field

        # All four *arr apps authenticate with X-Api-Key. API version differs
        # per app (Lidarr/Prowlarr v1, Radarr/Sonarr v3) but that lives in the
        # health path, not here.
        def arr(url: str | None, api_key: str | None, name: str) -> "ServiceConfig":
            base = req(url)
            key = req(api_key) if api_key else None
            if key is None or not key.strip():
                raise ValueError(f"{name}_api_key not configured")
            return ServiceConfig(base_url=base, auth=ServiceAuth.header("X-Api-Key", key))

        def basic(user: str | None, password: str | None) -> ServiceAuth:
            if user and user.strip() and password and password.strip():
                return ServiceAuth.basic(user, password)
            return ServiceAuth.none()

        cfg: ServiceConfig
        if service is RestService.Plex:
            url = keys.plex_url if hasattr(keys, "plex_url") else None
            token = keys.plex_token if hasattr(keys, "plex_token") else None
            if not url or not url.strip():
                raise ValueError("plex_url not configured")
            if not token or not token.strip():
                raise ValueError("plex_token not configured")
            cfg = ServiceConfig(base_url=url, auth=ServiceAuth.header("X-Plex-Token", token))
        elif service is RestService.InvoiceNinja:
            url = keys.invoiceninja_url if hasattr(keys, "invoiceninja_url") else None
            token = keys.invoiceninja_token if hasattr(keys, "invoiceninja_token") else None
            if not url or not url.strip():
                raise ValueError("invoiceninja_url not configured")
            if not token or not token.strip():
                raise ValueError("invoiceninja_token not configured")
            cfg = ServiceConfig(base_url=url, auth=ServiceAuth.bearer(token))
        elif service is RestService.HomeAssistant:
            url = keys.homeassistant_url if hasattr(keys, "homeassistant_url") else None
            token = keys.homeassistant_token if hasattr(keys, "homeassistant_token") else None
            if not url or not url.strip():
                raise ValueError("homeassistant_url not configured")
            if not token or not token.strip():
                raise ValueError("homeassistant_token not configured")
            cfg = ServiceConfig(base_url=url, auth=ServiceAuth.bearer(token))
        elif service is RestService.Nextcloud:
            url = keys.nextcloud_url if hasattr(keys, "nextcloud_url") else None
            user = keys.nextcloud_user if hasattr(keys, "nextcloud_user") else None
            password = keys.nextcloud_pass if hasattr(keys, "nextcloud_pass") else None
            if not url or not url.strip():
                raise ValueError("nextcloud_url not configured")
            cfg = ServiceConfig(base_url=url, auth=basic(user, password))
        elif service is RestService.AdGuard:
            url = keys.adguard_url if hasattr(keys, "adguard_url") else None
            user = keys.adguard_user if hasattr(keys, "adguard_user") else None
            password = keys.adguard_pass if hasattr(keys, "adguard_pass") else None
            if not url or not url.strip():
                raise ValueError("adguard_url not configured")
            cfg = ServiceConfig(base_url=url, auth=basic(user, password))
        elif service is RestService.Shoko:
            url = keys.shoko_url if hasattr(keys, "shoko_url") else None
            key = keys.shoko_api_key if hasattr(keys, "shoko_api_key") else None
            if not url or not url.strip():
                raise ValueError("shoko_url not configured")
            if not key or not key.strip():
                raise ValueError("shoko_api_key not configured")
            cfg = ServiceConfig(base_url=url, auth=ServiceAuth.query("apikey", key))
        elif service is RestService.QBittorrent:
            url = keys.qbittorrent_url if hasattr(keys, "qbittorrent_url") else None
            if not url or not url.strip():
                raise ValueError("qbittorrent_url not configured")
            cfg = ServiceConfig(base_url=url, auth=ServiceAuth.none())
        elif service is RestService.Lidarr:
            cfg = arr(
                keys.lidarr_url if hasattr(keys, "lidarr_url") else None,
                keys.lidarr_api_key if hasattr(keys, "lidarr_api_key") else None,
                "lidarr",
            )
        elif service is RestService.Radarr:
            cfg = arr(
                keys.radarr_url if hasattr(keys, "radarr_url") else None,
                keys.radarr_api_key if hasattr(keys, "radarr_api_key") else None,
                "radarr",
            )
        elif service is RestService.Sonarr:
            cfg = arr(
                keys.sonarr_url if hasattr(keys, "sonarr_url") else None,
                keys.sonarr_api_key if hasattr(keys, "sonarr_api_key") else None,
                "sonarr",
            )
        elif service is RestService.Prowlarr:
            cfg = arr(
                keys.prowlarr_url if hasattr(keys, "prowlarr_url") else None,
                keys.prowlarr_api_key if hasattr(keys, "prowlarr_api_key") else None,
                "prowlarr",
            )
        elif service is RestService.Ombi:
            url = keys.ombi_url if hasattr(keys, "ombi_url") else None
            if not url or not url.strip():
                raise ValueError("ombi_url not configured")
            cfg = ServiceConfig(base_url=url, auth=ServiceAuth.none())
        elif service is RestService.FlareSolverr:
            url = keys.flaresolverr_url if hasattr(keys, "flaresolverr_url") else None
            if not url or not url.strip():
                raise ValueError("flaresolverr_url not configured")
            cfg = ServiceConfig(base_url=url, auth=ServiceAuth.none())
        elif service is RestService.MatterHub:
            url = keys.matter_hub_url if hasattr(keys, "matter_hub_url") else None
            if not url or not url.strip():
                raise ValueError("matter_hub_url not configured")
            cfg = ServiceConfig(base_url=url, auth=ServiceAuth.none())
        else:  # pragma: no cover - exhaustive match on StrEnum
            raise ValueError(f"unknown service: {service}")

        return cfg


def join_url(base: str, path: str) -> str:
    """Join base URL with path, never doubling or dropping the separator."""
    return f"{base.rstrip('/')}/{path.lstrip('/')}"


class RestServiceClient:
    """Shared JSON-over-HTTP client for REST services.

    Self-signed certs are the norm on this LAN (AdGuard on :8443, several
    containers behind a reverse proxy), so invalid certs are accepted,
    matching the existing per-service clients.
    """

    def __init__(self, config: ServiceConfig, timeout: float = 30.0):
        self.config = config
        self._client = httpx.AsyncClient(
            timeout=timeout,
            verify=False,
            headers={"Accept": "application/json"},
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    def _build_request(self, method: str, path: str) -> httpx.Request:
        url = join_url(self.config.base_url, path)
        request = self._client.build_request(method, url)
        self.config.auth.apply(request)
        if self.config.auth.__class__.__name__ == "_AuthQuery":
            # Query-style auth applied as params.
            auth = self.config.auth
            request.url = request.url.copy_merge_params({auth.name: auth.value})  # type: ignore[attr-defined]
        return request

    async def get_json(self, path: str) -> Any:
        request = self._build_request("GET", path)
        resp = await self._client.send(request)
        return self._decode(resp, path)

    async def post_json(self, path: str, body: Any) -> Any:
        request = self._build_request("POST", path)
        request.headers["Content-Type"] = "application/json"
        request.content = httpx._content.to_str(body).encode() if isinstance(body, str) else __import__("json").dumps(body).encode()  # noqa: WPS437
        resp = await self._client.send(request)
        return self._decode(resp, path)

    @staticmethod
    def _decode(resp: httpx.Response, path: str) -> Any:
        text = resp.text
        head = text[:500]
        if not resp.is_success():
            raise RuntimeError(f"HTTP {resp.status_code} from {path}: {head}")
        try:
            return resp.json()
        except ValueError as exc:
            raise RuntimeError(f"Invalid JSON from {path}: {head}") from exc


@dataclass
class ServiceHealth:
    service: str
    label: str
    url: str
    reachable: bool
    detail: str


async def probe(
    service: RestService,
    keys: Any,
    client: RestServiceClient | None = None,
) -> ServiceHealth:
    """Probe one service's health. Never fails: unreachable services report
    reachable=False so a dashboard can show all services at once."""
    try:
        config = ServiceConfig.from_keys(service, keys)
    except ValueError as e:
        return ServiceHealth(
            service=service.value,
            label=service.label(),
            url="",
            reachable=False,
            detail=str(e),
        )

    url = config.base_url
    if client is None:
        client = RestServiceClient(config)

    probe_path = service.health_path()
    try:
        resp = await client.get_json(probe_path)
        _ = resp  # body not needed for health
        status = 200  # get_json only returns on success
    except RuntimeError as e:
        msg = str(e)
        if "HTTP 401" in msg or "HTTP 403" in msg:
            return ServiceHealth(
                service=service.value,
                label=service.label(),
                url=url,
                reachable=True,
                detail=f"HTTP {msg.split()[1]} (credentials rejected or required)",
            )
        return ServiceHealth(
            service=service.value,
            label=service.label(),
            url=url,
            reachable=False,
            detail=msg,
        )
    except Exception as e:  # httpx.ConnectError, etc.
        return ServiceHealth(
            service=service.value,
            label=service.label(),
            url=url,
            reachable=False,
            detail=str(e),
        )

    return ServiceHealth(
        service=service.value,
        label=service.label(),
        url=url,
        reachable=True,
        detail="OK",
    )


# ---------------------------------------------------------------------------
# Plex-specific endpoints
# ---------------------------------------------------------------------------


@dataclass
class PlexIdentity:
    machine_identifier: str
    version: str
    claimed: bool


@dataclass
class PlexLibrary:
    key: str
    title: str
    library_type: str
    uuid: str
    scanning: bool
    updated_at: int


def parse_plex_identity(v: Any) -> PlexIdentity | None:
    """Pure half of plex_identity: parse Plex's MediaContainer envelope."""
    if not isinstance(v, dict):
        return None
    mc = v.get("MediaContainer")
    if not isinstance(mc, dict):
        return None
    return PlexIdentity(
        machine_identifier=str(mc.get("machineIdentifier") or ""),
        version=str(mc.get("version") or ""),
        claimed=bool(mc.get("claimed")),
    )


def parse_plex_libraries(v: Any) -> list[PlexLibrary] | None:
    """Pure half of plex_libraries: parse MediaContainer.Directory array."""
    if not isinstance(v, dict):
        return None
    mc = v.get("MediaContainer")
    if not isinstance(mc, dict):
        return None
    dirs = mc.get("Directory")
    if not isinstance(dirs, list):
        return None
    out: list[PlexLibrary] = []
    for d in dirs:
        if not isinstance(d, dict):
            continue
        out.append(
            PlexLibrary(
                key=str(d.get("key") or ""),
                title=str(d.get("title") or "Untitled"),
                library_type=str(d.get("type") or "unknown"),
                uuid=str(d.get("uuid") or ""),
                scanning=bool(d.get("refreshing")),
                updated_at=int(d.get("updatedAt") or 0),
            )
        )
    return out


async def plex_identity(client: RestServiceClient) -> PlexIdentity:
    v = await client.get_json("/identity")
    parsed = parse_plex_identity(v)
    if parsed is None:
        raise RuntimeError("missing MediaContainer in Plex identity response")
    return parsed


async def plex_libraries(client: RestServiceClient) -> list[PlexLibrary]:
    v = await client.get_json("/library/sections")
    parsed = parse_plex_libraries(v)
    if parsed is None:
        raise RuntimeError("missing MediaContainer.Directory in Plex libraries response")
    return parsed


__all__ = [
    "PlexIdentity",
    "PlexLibrary",
    "RestService",
    "RestServiceClient",
    "ServiceAuth",
    "ServiceConfig",
    "ServiceHealth",
    "join_url",
    "parse_plex_identity",
    "parse_plex_libraries",
    "plex_identity",
    "plex_libraries",
    "probe",
]
