"""KTS Master Control backend — FastAPI application on port 8799.

HTTP bridge service replacing the Tauri desktop backend. Every former
Tauri command maps to a route registered here.
"""

from fastapi import FastAPI

from app.api.v1.endpoints.servers import router as servers_router
from app.core.config import settings

app = FastAPI(
    title="KTS Master Control Bridge",
    description="HTTP bridge backend for KTS Master Control Center",
    version="0.1.0",
)

app.include_router(servers_router)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness probe — returns 200 when the bridge is up."""
    return {"status": "ok"}
