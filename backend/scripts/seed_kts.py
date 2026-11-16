"""Seed KTS Master Control domain data.

Inserts @kts-ops confirmed seed data:
- 3 customers: Acme Corp, Globex LLC, Initech
- 5 tickets across the 3 customers
- 1-2 comments per ticket

Run against the dev DATABASE_URL:
    python scripts/seed_kts.py
"""

import asyncio
import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.base import Base
from app.models import KtsComment, KtsCustomer, KtsTicket

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

CUSTOMERS = [
    {
        "id": str(uuid.uuid4()),
        "name": "Acme Corp",
        "email": "acme@example.com",
        "phone": "+1-555-0101",
        "company": "Acme Corp",
        "status": "active",
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Globex LLC",
        "email": "ops@globex.co",
        "phone": "+1-555-0102",
        "company": "Globex LLC",
        "status": "active",
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Initech",
        "email": "it@initech.com",
        "phone": "+1-555-0103",
        "company": "Initech",
        "status": "active",
    },
]

TICKETS = [
    {
        "id": str(uuid.uuid4()),
        "customer_id": CUSTOMERS[0]["id"],  # Acme
        "title": "Printer offline in floor 2",
        "description": "Networked printer on floor 2 is not responding to print jobs.",
        "status": "open",
        "priority": "urgent",
        "assigned_to": None,
        "resolved_at": None,
    },
    {
        "id": str(uuid.uuid4()),
        "customer_id": CUSTOMERS[1]["id"],  # Globex
        "title": "VPN login failing",
        "description": "User cannot authenticate to the corporate VPN from home.",
        "status": "in_progress",
        "priority": "high",
        "assigned_to": str(uuid.uuid4()),
        "resolved_at": None,
    },
    {
        "id": str(uuid.uuid4()),
        "customer_id": CUSTOMERS[2]["id"],  # Initech
        "title": "Quarterly access review",
        "description": "Perform quarterly user access review for all Initech staff.",
        "status": "open",
        "priority": "medium",
        "assigned_to": None,
        "resolved_at": None,
    },
    {
        "id": str(uuid.uuid4()),
        "customer_id": CUSTOMERS[0]["id"],  # Acme
        "title": "Email bounce on invoices",
        "description": "Outgoing invoice emails are bouncing with 550 errors.",
        "status": "resolved",
        "priority": "low",
        "assigned_to": str(uuid.uuid4()),
        "resolved_at": datetime.now(),
    },
    {
        "id": str(uuid.uuid4()),
        "customer_id": CUSTOMERS[1]["id"],  # Globex
        "title": "New hire workstation setup",
        "description": "Provision laptop, monitor, and access for new Globex employee.",
        "status": "closed",
        "priority": "medium",
        "assigned_to": str(uuid.uuid4()),
        "resolved_at": datetime.now(),
    },
]

COMMENTS = [
    {
        "id": str(uuid.uuid4()),
        "ticket_id": TICKETS[0]["id"],
        "author": "agent@kts.local",
        "body": "Dispatched technician to floor 2. Waiting on site access.",
    },
    {
        "id": str(uuid.uuid4()),
        "ticket_id": TICKETS[1]["id"],
        "author": "agent@kts.local",
        "body": "Resetting VPN credentials and testing tunnel connectivity.",
    },
    {
        "id": str(uuid.uuid4()),
        "ticket_id": TICKETS[2]["id"],
        "author": "agent@kts.local",
        "body": "Access review scheduled for next week.",
    },
    {
        "id": str(uuid.uuid4()),
        "ticket_id": TICKETS[3]["id"],
        "author": "agent@kts.local",
        "body": "SMTP relay config fixed. Email delivery restored.",
    },
    {
        "id": str(uuid.uuid4()),
        "ticket_id": TICKETS[4]["id"],
        "author": "agent@kts.local",
        "body": "Workstation provisioned and handed off to new hire.",
    },
]


async def seed() -> None:
    async with async_session() as session:
        # Check if already seeded
        from sqlalchemy import select

        result = await session.execute(select(KtsCustomer))
        if result.scalars().first():
            print("Seed data already present — skipping.")
            return

        for c in CUSTOMERS:
            session.add(KtsCustomer(**c))
        await session.flush()

        for t in TICKETS:
            session.add(KtsTicket(**t))
        await session.flush()

        for c in COMMENTS:
            session.add(KtsComment(**c))

        await session.commit()
        print(
            f"Seeded {len(CUSTOMERS)} customers, {len(TICKETS)} tickets, "
            f"{len(COMMENTS)} comments."
        )


if __name__ == "__main__":
    asyncio.run(seed())
