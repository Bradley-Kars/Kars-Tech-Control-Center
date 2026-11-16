"""Pydantic schemas for root auth endpoints (WS-2.20)."""

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class LoginRequest(BaseModel):
    email: str
    password: str

    model_config = ConfigDict(from_attributes=True)


class LoginResponse(BaseModel):
    token: str
    user: dict[str, Any]

    model_config = ConfigDict(from_attributes=True)


class AuthUser(BaseModel):
    id: str
    email: str
    name: str
    role: str

    model_config = ConfigDict(from_attributes=True)
