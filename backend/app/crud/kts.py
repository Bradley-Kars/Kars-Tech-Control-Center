"""CRUD operations for KTS Master Control /kts/ endpoints (WS-2.19).

Uses the KTS domain models (KtsCustomer, KtsTicket, KtsComment) from WS-1.4.
Customer 1:N Tickets, comments on tickets. Agent-only ticket creation MVP.
"""

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import async_session
from app.models import KtsComment, KtsCustomer, KtsTicket


async def list_customers(
    db: AsyncSession, search: Optional[str] = None, status: Optional[str] = None
) -> list[KtsCustomer]:
    stmt = select(KtsCustomer)
    if search:
        stmt = stmt.where(
            KtsCustomer.name.ilike(f"%{search}%")
            | KtsCustomer.email.ilike(f"%{search}%")
            | KtsCustomer.company.ilike(f"%{search}%")
        )
    if status:
        stmt = stmt.where(KtsCustomer.status == status)
    stmt = stmt.order_by(KtsCustomer.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_customer(db: AsyncSession, customer_id: str) -> Optional[KtsCustomer]:
    result = await db.execute(
        select(KtsCustomer).where(KtsCustomer.id == customer_id)
    )
    return result.scalar_one_or_none()


async def create_customer(db: AsyncSession, payload: dict[str, Any]) -> KtsCustomer:
    db_customer = KtsCustomer(**payload)
    db.add(db_customer)
    await db.commit()
    await db.refresh(db_customer)
    return db_customer


async def update_customer(
    db: AsyncSession, customer_id: str, payload: dict[str, Any]
) -> Optional[KtsCustomer]:
    db_customer = await get_customer(db, customer_id)
    if not db_customer:
        return None
    for field, value in payload.items():
        setattr(db_customer, field, value)
    await db.commit()
    await db.refresh(db_customer)
    return db_customer


async def list_tickets(
    db: AsyncSession,
    customer_id: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assigned_to: Optional[str] = None,
    search: Optional[str] = None,
) -> list[KtsTicket]:
    stmt = select(KtsTicket).options(
        selectinload(KtsTicket.customer),
        selectinload(KtsTicket.comments),
    )
    if customer_id:
        stmt = stmt.where(KtsTicket.customer_id == customer_id)
    if status:
        stmt = stmt.where(KtsTicket.status == status)
    if priority:
        stmt = stmt.where(KtsTicket.priority == priority)
    if assigned_to:
        stmt = stmt.where(KtsTicket.assigned_to == assigned_to)
    if search:
        stmt = stmt.where(
            KtsTicket.title.ilike(f"%{search}%")
            | KtsTicket.description.ilike(f"%{search}%")
        )
    stmt = stmt.order_by(KtsTicket.updated_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_ticket(db: AsyncSession, ticket_id: str) -> Optional[KtsTicket]:
    result = await db.execute(
        select(KtsTicket)
        .options(selectinload(KtsTicket.customer), selectinload(KtsTicket.comments))
        .where(KtsTicket.id == ticket_id)
    )
    return result.scalar_one_or_none()


async def create_ticket(db: AsyncSession, payload: dict[str, Any]) -> KtsTicket:
    db_ticket = KtsTicket(**payload)
    db.add(db_ticket)
    await db.commit()
    await db.refresh(db_ticket)
    # Eager-load relationships for response serialization
    await db.refresh(
        db_ticket, attribute_names=["customer", "comments"]
    )
    return db_ticket


async def update_ticket(
    db: AsyncSession, ticket_id: str, payload: dict[str, Any]
) -> Optional[KtsTicket]:
    db_ticket = await get_ticket(db, ticket_id)
    if not db_ticket:
        return None
    for field, value in payload.items():
        setattr(db_ticket, field, value)
    if payload.get("status") == "resolved" and not db_ticket.resolved_at:
        db_ticket.resolved_at = datetime.now()
    await db.commit()
    await db.refresh(db_ticket)
    return db_ticket


async def list_comments(db: AsyncSession, ticket_id: str) -> list[KtsComment]:
    result = await db.execute(
        select(KtsComment)
        .where(KtsComment.ticket_id == ticket_id)
        .order_by(KtsComment.created_at.asc())
    )
    return result.scalars().all()


async def create_comment(
    db: AsyncSession, ticket_id: str, payload: dict[str, Any]
) -> KtsComment:
    db_comment = KtsComment(**payload, ticket_id=ticket_id)
    db.add(db_comment)
    await db.commit()
    await db.refresh(db_comment)
    return db_comment
