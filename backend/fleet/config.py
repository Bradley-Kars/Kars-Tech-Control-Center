"""backend/fleet/config.py — servers.json loader for the KTS fleet.

Loads ServerConfig objects from servers.json (path from KTS_SERVERS_FILE
or ~/.config/master-control/servers.json). Atomic writes with mode 0600
and a .bak copy. Redaction helpers keep secrets out of logs and errors.

Fixture-only: never touches the real servers.json. Tests use temp files
via the KTS_SERVERS_FILE env override.
"""

import json
import os
import stat
import tempfile
from pathlib import Path
from typing import Any, ClassVar, Union

from pydantic import BaseModel, Field, model_validator


class AuthPassword(BaseModel):
    """Password-based SSH auth."""
    type: str = Field(default="password")
    password: str


class AuthKey(BaseModel):
    """SSH key-based auth."""
    type: str = Field(default="key")
    key_path: str
    passphrase: str | None = None


Auth = Union[AuthPassword, AuthKey]


class ServiceKeys(BaseModel):
    """Per-service credentials and URLs for a server.

    Only fields that probe green against the live fleet are included —
    see the mirror comment in src/lib/types.ts. Unknown keys pass through
    unchanged (extra="allow") so nothing is silently dropped.
    """

    model_config = {"extra": "allow"}

    nextcloud_user: str | None = None
    nextcloud_pass: str | None = None
    lidarr_api_key: str | None = None
    homeassistant_token: str | None = None
    adguard_user: str | None = None
    adguard_pass: str | None = None
    adguard_url: str | None = None
    plex_url: str | None = None
    plex_token: str | None = None
    scrutiny_url: str | None = None
    uptimekuma_url: str | None = None
    uptimekuma_slug: str | None = None
    invoiceninja_url: str | None = None
    invoiceninja_token: str | None = None
    aurral_url: str | None = None
    aurral_user: str | None = None
    aurral_pass: str | None = None
    your_spotify_url: str | None = None
    your_spotify_api_key: str | None = None
    dozzle_url: str | None = None
    homepage_url: str | None = None
    phone_adb_serial: str | None = None
    phone_rustdesk_id: str | None = None
    phone_rustdesk_password: str | None = None
    kdeconnect_device_id: str | None = None
    steamdeck_rustdesk_id: str | None = None
    steamdeck_rustdesk_password: str | None = None
    steamdeck_kdeconnect_device_id: str | None = None
    unraid_url: str | None = None
    lan_ip: str | None = None
    tailscale_ip: str | None = None
    lidarr_url: str | None = None
    radarr_url: str | None = None
    radarr_api_key: str | None = None
    sonarr_url: str | None = None
    sonarr_api_key: str | None = None
    prowlarr_url: str | None = None
    prowlarr_api_key: str | None = None
    qbittorrent_url: str | None = None
    qbittorrent_user: str | None = None
    qbittorrent_pass: str | None = None
    flaresolverr_url: str | None = None
    plex_user_id: str | None = None
    shoko_url: str | None = None
    shoko_api_key: str | None = None
    shoko_user: str | None = None
    shoko_pass: str | None = None
    homeassistant_url: str | None = None
    matter_hub_url: str | None = None
    meshcentral_url: str | None = None
    meshcentral_admin_user: str | None = None
    meshcentral_admin_pass: str | None = None
    meshcentral_group_id: str | None = None
    nextcloud_url: str | None = None
    ombi_url: str | None = None
    mosquitto_host: str | None = None
    mosquitto_port: str | None = None
    mariadb_host: str | None = None
    mariadb_port: str | None = None
    rustdesk_server_host: str | None = None
    rustdesk_server_ports: str | None = None
    bing_api_key: str | None = None
    phone_ssh: str | None = None
    phone_ssh_auth: str | None = None
    mac_address: str | None = None
    os: str | None = None
    cpu: str | None = None
    gpu: str | None = None
    nfs_export: str | None = None
    nfs_unraid_mount: str | None = None
    sunshine_webui: str | None = None
    sunshine_stream: str | None = None
    sunshine_user: str | None = None
    sunshine_pass: str | None = None
    deskflow_client: str | None = None
    sshfs_mount_kars: str | None = None
    sshfs_mount_shared: str | None = None
    lan_eth_reserved: str | None = None
    lan_wifi_reserved: str | None = None
    notes: str | None = None

    # Service key fields that are secrets and must be redacted.
    SECRET_FIELDS: ClassVar[frozenset[str]] = frozenset({
        "nextcloud_pass", "homeassistant_token",         "adguard_pass", "adguard_user",
        "plex_token", "uptimekuma_slug", "invoiceninja_token",
        "aurral_pass", "your_spotify_api_key", "phone_rustdesk_password",
        "steamdeck_rustdesk_password", "radarr_api_key", "sonarr_api_key",
        "prowlarr_api_key", "qbittorrent_pass", "shoko_api_key", "shoko_pass",
        "bing_api_key", "phone_ssh_auth", "sunshine_pass", "kdeconnect_device_id",
    })


class ServerConfig(BaseModel):
    """One entry in servers.json."""

    id: str
    name: str
    hostname: str
    port: int = 22
    username: str = "root"
    auth: Auth
    device_type: str = "generic"
    api_key: str | None = None
    service_keys: ServiceKeys = Field(default_factory=ServiceKeys)
    meshcentral_device_id: str | None = None
    meshcentral_enrolled_at: str | None = None
    meshcentral_status: str | None = None
    connection_priority: list[str] | None = None

    @model_validator(mode="before")
    @classmethod
    def _parse_auth(cls, data: Any) -> Any:
        """Coerce the auth dict into AuthPassword or AuthKey based on 'type'."""
        if isinstance(data, dict) and "auth" in data:
            auth = data["auth"]
            if isinstance(auth, dict):
                auth_type = auth.get("type", "password")
                if auth_type == "key":
                    data["auth"] = AuthKey(**auth)
                else:
                    data["auth"] = AuthPassword(**auth)
        return data


def get_servers_path() -> Path:
    """Resolve servers.json path from KTS_SERVERS_FILE or the default."""
    env = os.environ.get("KTS_SERVERS_FILE")
    if env:
        return Path(env)
    return Path.home() / ".config" / "master-control" / "servers.json"


def load_servers(
    path: Path | None = None,
    defaults: list[dict[str, Any]] | None = None,
) -> list[ServerConfig]:
    """Load servers from servers.json.

    If `path` is None, resolve via get_servers_path(). Missing/empty file
    returns an empty list.

    If `defaults` are given, servers not present in servers.json are kept
    from defaults. servers.json wins for matching IDs.
    """
    if path is None:
        path = get_servers_path()

    if not path.exists():
        return []

    raw = path.read_text(encoding="utf-8")
    if not raw.strip():
        return []

    data = json.loads(raw)

    if defaults is not None:
        by_id: dict[str, dict[str, Any]] = {d["id"]: d for d in defaults}
        for entry in data:
            by_id[entry["id"]] = entry
        data = list(by_id.values())

    return [ServerConfig(**entry) for entry in data]


def save_servers(
    servers: list[ServerConfig],
    path: Path | None = None,
) -> None:
    """Write servers atomically: temp file + os.replace, mode 0600.

    Creates a .bak copy of any existing file before overwriting.
    Creates parent directories as needed.
    """
    if path is None:
        path = get_servers_path()

    path.parent.mkdir(parents=True, exist_ok=True)

    # .bak of any existing file
    if path.exists():
        bak = path.with_suffix(path.suffix + ".bak")
        bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")

    # Atomic write via temp file in the same directory
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump([s.model_dump() for s in servers], f, indent=2)
        os.chmod(tmp_name, 0o600)
        os.replace(tmp_name, str(path))
    except BaseException:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


# Top-level secret field names redacted from server dicts.
SECRET_TOP_LEVEL = frozenset({"password", "api_key"})

# Service key field names redacted from server dicts.
SECRET_SERVICE_KEYS = frozenset({
    "nextcloud_pass", "homeassistant_token", "adguard_pass", "adguard_user",
    "meshcentral_admin_pass", "meshcentral_admin_user",
    "plex_token", "uptimekuma_slug", "invoiceninja_token",
    "aurral_pass", "your_spotify_api_key", "phone_rustdesk_password",
    "steamdeck_rustdesk_password", "radarr_api_key", "sonarr_api_key",
    "prowlarr_api_key", "qbittorrent_pass", "shoko_api_key", "shoko_pass",
    "bing_api_key", "phone_ssh_auth", "sunshine_pass", "kdeconnect_device_id",
})


def redact_server(server: ServerConfig | dict[str, Any]) -> dict[str, Any]:
    """Return a copy with secrets replaced by [REDACTED].

    Accepts a ServerConfig or a plain dict. The original is not modified.
    """
    if isinstance(server, ServerConfig):
        data = server.model_dump()
    else:
        data = dict(server)

    for field in SECRET_TOP_LEVEL:
        if field in data:
            data[field] = "[REDACTED]"

    auth = data.get("auth")
    if isinstance(auth, dict):
        for field in SECRET_TOP_LEVEL:
            if field in auth:
                auth[field] = "[REDACTED]"

    svc_keys = data.get("service_keys")
    if isinstance(svc_keys, dict):
        for field in SECRET_SERVICE_KEYS:
            if field in svc_keys:
                svc_keys[field] = "[REDACTED]"

    return data


def redact_error(message: str, secrets: list[str] | None = None) -> str:
    """Return message with each secret value replaced by [REDACTED].

    No secrets → message unchanged.
    """
    if not secrets:
        return message
    result = message
    for secret in secrets:
        result = result.replace(secret, "[REDACTED]")
    return result


__all__ = [
    "AuthKey",
    "AuthPassword",
    "ServerConfig",
    "ServiceKeys",
    "get_servers_path",
    "load_servers",
    "redact_error",
    "redact_server",
    "save_servers",
]
