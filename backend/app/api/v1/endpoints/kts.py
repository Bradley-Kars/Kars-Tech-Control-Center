"""KTS Master Control /kts/ endpoints (WS-2.19).

KTS domain: Customer 1:N Tickets, comments on tickets.
Agent-only ticket creation MVP.

GET/POST /kts/customers (query: search, status)
GET/PATCH /kts/customers/:id
GET/POST /kts/tickets (query: customer_id, status, priority, assigned_to, search)
GET/PATCH /kts/tickets/:id (returns ticket + customer + comments embedded)
GET/POST /kts/tickets/:id/comments
POST /kts/auth/login, POST /kts/auth/logout, GET /kts/auth/me
"""

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_session
from app.crud.kts import (
    create_comment,
    create_customer,
    create_ticket,
    get_customer,
    get_ticket,
    list_comments,
    list_customers,
    list_tickets,
    update_customer,
    update_ticket,
)
from app.schemas.kts import (
    CustomerCreate,
    CustomerListQuery,
    CustomerOut,
    CustomerUpdate,
    LoginRequest,
    LoginResponse,
    TicketCommentCreate,
    TicketCommentOut,
    TicketCreate,
    TicketListQuery,
    TicketOut,
    TicketUpdate,
)

router = APIRouter(prefix="/kts")


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------


@router.get("/customers", response_model=list[CustomerOut])
async def kts_list_customers(
    search: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """List customers (query: search, status)."""
    return await list_customers(db, search=search, status=status)


@router.post("/customers", response_model=CustomerOut)
async def kts_create_customer(
    payload: CustomerCreate, db: AsyncSession = Depends(get_session)
) -> Any:
    """Create a customer (agent-only)."""
    return await create_customer(db, payload.model_dump())


@router.get("/customers/{customer_id}", response_model=CustomerOut)
async def kts_get_customer(
    customer_id: str, db: AsyncSession = Depends(get_session)
) -> Any:
    """Get one customer by id."""
    db_customer = await get_customer(db, customer_id)
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return db_customer


@router.patch("/customers/{customer_id}", response_model=CustomerOut)
async def kts_update_customer(
    customer_id: str,
    payload: CustomerUpdate,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Update a customer."""
    data = payload.model_dump(exclude_unset=True)
    db_customer = await update_customer(db, customer_id, data)
    if not db_customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return db_customer


# ---------------------------------------------------------------------------
# Tickets
# ---------------------------------------------------------------------------


@router.get("/tickets", response_model=list[TicketOut])
async def kts_list_tickets(
    customer_id: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assigned_to: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """List tickets with filters."""
    return await list_tickets(
        db,
        customer_id=customer_id,
        status=status,
        priority=priority,
        assigned_to=assigned_to,
        search=search,
    )


@router.post("/tickets", response_model=TicketOut)
async def kts_create_ticket(
    payload: TicketCreate, db: AsyncSession = Depends(get_session)
) -> Any:
    """Create a ticket (agent-only)."""
    data = payload.model_dump()
    return await create_ticket(db, data)


@router.get("/tickets/{ticket_id}", response_model=TicketOut)
async def kts_get_ticket(ticket_id: str, db: AsyncSession = Depends(get_session)) -> Any:
    """Get one ticket by id (includes customer + comments embedded)."""
    db_ticket = await get_ticket(db, ticket_id)
    if not db_ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return db_ticket


@router.patch("/tickets/{ticket_id}", response_model=TicketOut)
async def kts_update_ticket(
    ticket_id: str,
    payload: TicketUpdate,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Update a ticket."""
    data = payload.model_dump(exclude_unset=True)
    db_ticket = await update_ticket(db, ticket_id, data)
    if not db_ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return db_ticket


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------


@router.get("/tickets/{ticket_id}/comments", response_model=list[TicketCommentOut])
async def kts_list_comments(
    ticket_id: str, db: AsyncSession = Depends(get_session)
) -> Any:
    """List comments on a ticket."""
    return await list_comments(db, ticket_id)


@router.post("/tickets/{ticket_id}/comments", response_model=TicketCommentOut)
async def kts_create_comment(
    ticket_id: str,
    payload: TicketCommentCreate,
    db: AsyncSession = Depends(get_session),
) -> Any:
    """Create a comment on a ticket."""
    return await create_comment(db, ticket_id, payload.model_dump())


# ---------------------------------------------------------------------------
# Auth (shared at /kts/auth prefix)
# ---------------------------------------------------------------------------


@router.post("/auth/login", response_model=LoginResponse)
async def kts_auth_login(payload: LoginRequest) -> Any:
    """Agent login (MVP)."""
    # MVP: accept any credentials, return a dev token
    return {
        "token": "dev-token-" + payload.email,
        "user": {
            "id": "agent-001",
            "email": payload.email,
            "name": "Agent",
            "role": "agent",
        },
    }


@router.post("/auth/logout")
async def kts_auth_logout() -> Any:
    """Agent logout (MVP)."""
    return {"message": "logged out"}


@router.get("/auth/me", response_model=dict[str, Any])
async def kts_auth_me() -> Any:
    """Get current agent (MVP)."""
    return {
        "id": "agent-001",
        "email": "agent@kts.local",
        "name": "Agent",
        "role": "agent",
    }
