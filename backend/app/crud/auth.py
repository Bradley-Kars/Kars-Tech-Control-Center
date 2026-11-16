"""CRUD operations for root auth endpoints (WS-2.20).

MVP: session/cookie-based auth. Accepts any credentials, returns a dev token.
"""

from typing import Any, Optional

from app.schemas.auth import AuthUser, LoginResponse


async def auth_login(email: str, password: str) -> LoginResponse:
    """Authenticate agent (MVP: accepts any credentials)."""
    return LoginResponse(
        token="dev-token-" + email,
        user={
            "id": "agent-001",
            "email": email,
            "name": "Agent",
            "role": "agent",
        },
    )


async def auth_logout() -> None:
    """Logout agent (MVP: no-op)."""
    return None


async def auth_me() -> AuthUser:
    """Get current agent (MVP)."""
    return AuthUser(
        id="agent-001",
        email="agent@kts.local",
        name="Agent",
        role="agent",
    )
