"""KTS Master Control backend — FastAPI application on port 8799.

HTTP bridge service replacing the Tauri desktop backend. Every former
Tauri command maps to a route registered here.
"""

from fastapi import FastAPI

from app.api.v1.endpoints.adguard import router as adguard_router
from app.api.v1.endpoints.alerts import router as alerts_router
from app.api.v1.endpoints.docker import router as docker_router
from app.api.v1.endpoints.homeassistant import router as homeassistant_router
from app.api.v1.endpoints.kdeconnect import router as kdeconnect_router
from app.api.v1.endpoints.kts import router as kts_router
from app.api.v1.endpoints.lidarr import router as lidarr_router
from app.api.v1.endpoints.metrics import router as metrics_router
from app.api.v1.endpoints.meshcentral import router as meshcentral_router
from app.api.v1.endpoints.myspeed import router as myspeed_router
from app.api.v1.endpoints.nextcloud import router as nextcloud_router
from app.api.v1.endpoints.opencode import router as opencode_router
from app.api.v1.endpoints.prometheus import router as prometheus_router
from app.api.v1.endpoints.phone import router as phone_router
from app.api.v1.endpoints.rest_services import router as rest_services_router
from app.api.v1.endpoints.steamdeck import router as steamdeck_router
from app.api.v1.endpoints.terminal import router as terminal_router
from app.api.v1.endpoints.servers import router as servers_router
from app.api.v1.endpoints.unraid import router as unraid_router
from app.core.config import settings

app = FastAPI(
    title="KTS Master Control Bridge",
    description="HTTP bridge backend for KTS Master Control Center",
    version="0.1.0",
)

app.include_router(servers_router)
app.include_router(docker_router)
app.include_router(unraid_router)
app.include_router(nextcloud_router)
app.include_router(lidarr_router)
app.include_router(metrics_router)
app.include_router(homeassistant_router)
app.include_router(myspeed_router)
app.include_router(adguard_router)
app.include_router(phone_router)
app.include_router(kdeconnect_router)
app.include_router(kts_router)
app.include_router(steamdeck_router)
app.include_router(meshcentral_router)
app.include_router(prometheus_router)
app.include_router(terminal_router)
app.include_router(opencode_router)
app.include_router(rest_services_router)
app.include_router(alerts_router)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe — returns 200 when the bridge is up."""
    return {"status": "ok"}
