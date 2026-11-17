"""Pydantic schemas for KTS Master Control /kts/ endpoints (WS-2.19).

KTS domain: Customer 1:N Tickets, comments on tickets.
UUID ids, ISO8601 timestamps, status/priority enums.
"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class CustomerBase(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    company: Optional[str] = None
    status: Optional[str] = "active"

    model_config = ConfigDict(from_attributes=True)


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CustomerOut(CustomerBase):
    id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TicketBase(BaseModel):
    title: str
    description: str
    priority: Optional[str] = "medium"
    assigned_to: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TicketCreate(TicketBase):
    customer_id: str


class TicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TicketCommentBase(BaseModel):
    author: str
    body: str

    model_config = ConfigDict(from_attributes=True)


class TicketCommentCreate(TicketCommentBase):
    pass


class TicketCommentOut(TicketCommentBase):
    id: str
    ticket_id: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TicketOut(TicketBase):
    id: str
    customer_id: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime] = None
    customer: Optional[CustomerOut] = None
    comments: list[TicketCommentOut] = []

    model_config = ConfigDict(from_attributes=True)


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


class TicketListQuery(BaseModel):
    customer_id: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None
    search: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CustomerListQuery(BaseModel):
    search: Optional[str] = None
    status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
