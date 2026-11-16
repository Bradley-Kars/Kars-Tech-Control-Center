"""Root auth endpoints (WS-2.20).

POST /auth/login, POST /auth/logout, GET /auth/me — shared at root
(also available under /kts/auth for KTS page convenience).
"""

from typing import Any

from fastapi import APIRouter

from app.crud.auth import auth_login, auth_logout, auth_me
from app.schemas.auth import AuthUser, LoginRequest, LoginResponse

router = APIRouter()


@router.post("/auth/login", response_model=LoginResponse)
async def auth_login_endpoint(payload: LoginRequest) -> Any:
    """Agent login (MVP)."""
    return await auth_login(payload.email, payload.password)


@router.post("/auth/logout")
async def auth_logout_endpoint() -> Any:
    """Agent logout (MVP)."""
    await auth_logout()
    return {"message": "logged out"}


@router.get("/auth/me", response_model=AuthUser)
async def auth_me_endpoint() -> Any:
    """Get current agent (MVP)."""
    return await auth_me()
