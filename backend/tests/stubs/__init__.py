"""backend/tests/stubs/ — small stub HTTP servers for service testing.

Fixtures-only stubs that serve recorded responses over real HTTP (aiohttp)
on 127.0.0.1:0 (ephemeral port). Used by port tasks (P1-P16) and e2e tests
so no real network or credentials are ever needed.

Stubs:
- AdGuardStub      — AdGuard Home /control/* endpoints
- NextcloudStub    — Nextcloud /ocs/v2.php/* endpoints
- HomeAssistantStub — Home Assistant /api/* endpoints
- LidarrStub       — Lidarr /api/v1/* endpoints
- UnraidStub       — Unraid emhttp /api/v2/* endpoints
- PlexStub         — Plex /identity and /library/sections endpoints

Every stub records all requests in .requests and serves fixture data keyed
by endpoint path. Unknown endpoints return 404.

Cluster:
- StubCluster       — start all seven stubs at once
- start_all_stubs   — convenience coroutine
- stop_all_stubs    — convenience coroutine
"""

from .base import StubServer
from .adguard import AdGuardStub
from .nextcloud import NextcloudStub
from .homeassistant import HomeAssistantStub
from .lidarr import LidarrStub
from .unraid import UnraidStub
from .plex import PlexStub
from .all import StubCluster, start_all_stubs, stop_all_stubs

__all__ = [
    "StubServer",
    "AdGuardStub",
    "NextcloudStub",
    "HomeAssistantStub",
    "LidarrStub",
    "UnraidStub",
    "PlexStub",
    "StubCluster",
    "start_all_stubs",
    "stop_all_stubs",
]
