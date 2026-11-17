"""Import Obsidian vault records into KTS Master Control domain tables.

Reads /home/bradley-kars/Documents/KTS Records (markdown with YAML frontmatter + JSON),
maps all source types to KTS domain tables. Idempotent: skips records already present
by natural key. Reversible: prints the list of inserted IDs for manual cleanup.

Runs after WS-1.4 seed_kts.py, before WS-4 parity.

Usage:
    python scripts/import_obsidian.py        # dry run (no writes)
    python scripts/import_obsidian.py --apply  # write to DB
"""

import asyncio
import json
import re
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

# Ensure the backend root is on sys.path so `app` is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import yaml
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.base import Base
from app.models import (
    KtsComment,
    KtsCustomer,
    KtsInvoice,
    KtsKnowledge,
    KtsOrganization,
    KtsProject,
    KtsReceipt,
    KtsTask,
    KtsTicket,
    KtsTemplate,
    KtsUser,
)

SOURCE_DIR = Path("/home/bradley-kars/Documents/KTS Records")

# Source IDs -> generated UUID mapping (for FK resolution across customers/tickets)
SOURCE_ID_MAP: dict[str, str] = {}

# Track inserted IDs for rollback
INSERTED_IDS: dict[str, list[str]] = {
    "customers": [],
    "tickets": [],
    "comments": [],
    "organizations": [],
    "users": [],
    "tasks": [],
    "knowledge": [],
    "projects": [],
    "templates": [],
    "invoices": [],
    "receipts": [],
}

# Counters for verification
SOURCE_COUNTS: dict[str, int] = {
    "customers": 0,
    "tickets": 0,
    "comments": 0,
    "organizations": 0,
    "users": 0,
    "tasks": 0,
    "knowledge": 0,
    "projects": 0,
    "templates": 0,
    "invoices": 0,
    "receipts": 0,
}
IMPORTED_COUNTS: dict[str, int] = {
    "customers": 0,
    "tickets": 0,
    "comments": 0,
    "organizations": 0,
    "users": 0,
    "tasks": 0,
    "knowledge": 0,
    "projects": 0,
    "templates": 0,
    "invoices": 0,
    "receipts": 0,
}
SKIPPED_COUNTS: dict[str, int] = {
    "customers": 0,
    "tickets": 0,
    "comments": 0,
    "organizations": 0,
    "users": 0,
    "tasks": 0,
    "knowledge": 0,
    "projects": 0,
    "templates": 0,
    "invoices": 0,
    "receipts": 0,
}

# Data-loss report: source fields that have no DDL column
UNMAPPED_FIELDS: list[str] = []


def parse_frontmatter(path: Path) -> dict[str, Any] | None:
    """Extract YAML frontmatter from a markdown file. Returns None if no frontmatter."""
    text = path.read_text(encoding="utf-8")
    match = re.match(r"---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if not match:
        return None
    return yaml.safe_load(match.group(1)) or {}


def gen_uuid() -> str:
    return str(uuid.uuid4())


def normalize_status(value: str | None) -> str:
    """Normalize source status to KTS enum: open/in_progress/resolved/closed."""
    if not value:
        return "open"
    v = value.strip().lower()
    mapping = {
        "open": "open",
        "in_progress": "in_progress",
        "in progress": "in_progress",
        "todo": "open",
        "done": "closed",
        "resolved": "resolved",
        "closed": "closed",
        "planning": "open",
        "active": "open",
        "published": "open",
    }
    return mapping.get(v, "open")


def normalize_priority(value: str | None) -> str:
    """Normalize source priority to KTS enum: low/medium/high/urgent."""
    if not value:
        return "medium"
    v = value.strip().lower()
    mapping = {
        "low": "low",
        "medium": "medium",
        "high": "high",
        "urgent": "urgent",
    }
    return mapping.get(v, "medium")


async def import_organizations(session: AsyncSession, apply: bool) -> None:
    """Import organization markdown files into kts_organizations."""
    org_dir = SOURCE_DIR / "Organizations"
    if not org_dir.exists():
        return
    for md_file in sorted(org_dir.glob("*.md")):
        fm = parse_frontmatter(md_file)
        if not fm or fm.get("type") != "organization":
            continue

        SOURCE_COUNTS["organizations"] += 1
        source_id = fm.get("id", md_file.stem)

        # Idempotency: skip if org with this name already exists
        name = fm.get("name", fm.get("title", md_file.stem))
        existing = await session.execute(
            select(KtsOrganization).where(KtsOrganization.name == name)
        )
        existing_org = existing.scalars().first()
        if existing_org:
            SKIPPED_COUNTS["organizations"] += 1
            SOURCE_ID_MAP[source_id] = str(existing_org.id)
            print(f"  SKIP organization (exists): {name} (source: {source_id})")
            continue

        new_id = gen_uuid()
        SOURCE_ID_MAP[source_id] = new_id

        # Track unmapped fields
        for field in ("tags", "relationships", "technical_contact_id", "custom_fields"):
            if field in fm and fm[field]:
                UNMAPPED_FIELDS.append(f"{md_file}:{field}")

        org = KtsOrganization(
            id=new_id,
            name=name,
            legal_name=fm.get("legal_name"),
            industry=fm.get("industry"),
            size=fm.get("size"),
            tier=fm.get("tier"),
            primary_contact_id=fm.get("primary_contact_id"),
            billing_contact_id=fm.get("billing_contact_id"),
            address=fm.get("address"),
            billing=fm.get("billing"),
            sla_policy=fm.get("sla_policy"),
        )

        if apply:
            session.add(org)
            INSERTED_IDS["organizations"].append(new_id)
        IMPORTED_COUNTS["organizations"] += 1
        print(f"  {'WRITE' if apply else 'DRY-RUN'} organization: {name} (source: {source_id})")


async def import_users(session: AsyncSession, apply: bool) -> None:
    """Import user markdown files into kts_users."""
    users_dir = SOURCE_DIR / "Users"
    if not users_dir.exists():
        return
    for md_file in sorted(users_dir.glob("*.md")):
        fm = parse_frontmatter(md_file)
        if not fm or fm.get("type") != "user":
            continue

        SOURCE_COUNTS["users"] += 1
        source_id = fm.get("id", md_file.stem)

        # Idempotency: skip if user with this username already exists
        username = fm.get("username", "")
        existing = await session.execute(
            select(KtsUser).where(KtsUser.username == username)
        )
        existing_user = existing.scalars().first()
        if existing_user:
            SKIPPED_COUNTS["users"] += 1
            SOURCE_ID_MAP[source_id] = str(existing_user.id)
            print(f"  SKIP user (exists): {username} (source: {source_id})")
            continue

        new_id = gen_uuid()
        SOURCE_ID_MAP[source_id] = new_id

        emails = fm.get("email", "")
        phones = fm.get("phone", "")
        email = emails if isinstance(emails, str) else (emails[0] if isinstance(emails, list) and emails else "")
        phone = phones if isinstance(phones, str) else (phones[0] if isinstance(phones, list) and phones else "")

        # Track unmapped fields
        for field in ("tags", "relationships", "certifications", "timezone", "avatar", "notifications", "custom_fields"):
            if field in fm and fm[field]:
                UNMAPPED_FIELDS.append(f"{md_file}:{field}")

        user = KtsUser(
            id=new_id,
            username=username or None,
            email=email or None,
            phone=phone or None,
            role=fm.get("role"),
            teams=fm.get("teams"),
            skills=fm.get("skills"),
            capacity_hours_per_day=fm.get("capacity_hours_per_day"),
        )

        if apply:
            session.add(user)
            INSERTED_IDS["users"].append(new_id)
        IMPORTED_COUNTS["users"] += 1
        print(f"  {'WRITE' if apply else 'DRY-RUN'} user: {username} (source: {source_id})")


async def import_tasks(session: AsyncSession, apply: bool) -> None:
    """Import task markdown files into kts_tasks."""
    tasks_dir = SOURCE_DIR / "Tasks"
    if not tasks_dir.exists():
        return
    for md_file in sorted(tasks_dir.glob("*.md")):
        fm = parse_frontmatter(md_file)
        if not fm or fm.get("type") != "task":
            continue

        SOURCE_COUNTS["tasks"] += 1
        source_id = fm.get("id", md_file.stem)

        # Idempotency: skip if task with this title already exists
        title = fm.get("title", md_file.stem)
        existing = await session.execute(
            select(KtsTask).where(KtsTask.title == title)
        )
        existing_task = existing.scalars().first()
        if existing_task:
            SKIPPED_COUNTS["tasks"] += 1
            SOURCE_ID_MAP[source_id] = str(existing_task.id)
            print(f"  SKIP task (exists): {title} (source: {source_id})")
            continue

        new_id = gen_uuid()
        SOURCE_ID_MAP[source_id] = new_id

        # Track unmapped fields
        for field in ("tags", "relationships", "version", "estimated_hours", "actual_hours", "custom_fields"):
            if field in fm and fm[field]:
                UNMAPPED_FIELDS.append(f"{md_file}:{field}")

        task = KtsTask(
            id=new_id,
            title=title,
            description=None,
            status=normalize_status(fm.get("status")),
            priority=normalize_priority(fm.get("priority")),
            due_date=None,
            assigned_to=None,
        )

        if apply:
            session.add(task)
            INSERTED_IDS["tasks"].append(new_id)
        IMPORTED_COUNTS["tasks"] += 1
        print(f"  {'WRITE' if apply else 'DRY-RUN'} task: {title} (source: {source_id})")


async def import_knowledge(session: AsyncSession, apply: bool) -> None:
    """Import knowledge markdown files into kts_knowledge."""
    kb_dir = SOURCE_DIR / "Knowledge"
    if not kb_dir.exists():
        return
    for md_file in sorted(kb_dir.glob("*.md")):
        fm = parse_frontmatter(md_file)
        if not fm or fm.get("type") != "knowledge":
            continue

        SOURCE_COUNTS["knowledge"] += 1
        source_id = fm.get("id", md_file.stem)

        # Idempotency: skip if KB article with this title already exists
        title = fm.get("title", md_file.stem)
        existing = await session.execute(
            select(KtsKnowledge).where(KtsKnowledge.title == title)
        )
        existing_kb = existing.scalars().first()
        if existing_kb:
            SKIPPED_COUNTS["knowledge"] += 1
            SOURCE_ID_MAP[source_id] = str(existing_kb.id)
            print(f"  SKIP knowledge (exists): {title} (source: {source_id})")
            continue

        new_id = gen_uuid()
        SOURCE_ID_MAP[source_id] = new_id

        # Track unmapped fields
        for field in ("tags", "relationships", "category", "subcategory", "author", "reviewer", "review_date", "visibility", "content", "related_tickets", "related_assets", "related_problems", "related_changes", "custom_fields"):
            if field in fm and fm[field]:
                UNMAPPED_FIELDS.append(f"{md_file}:{field}")

        kb = KtsKnowledge(
            id=new_id,
            title=title,
            content=fm.get("content"),
            category=fm.get("category"),
            tags=fm.get("tags"),
        )

        if apply:
            session.add(kb)
            INSERTED_IDS["knowledge"].append(new_id)
        IMPORTED_COUNTS["knowledge"] += 1
        print(f"  {'WRITE' if apply else 'DRY-RUN'} knowledge: {title} (source: {source_id})")


async def import_projects(session: AsyncSession, apply: bool) -> None:
    """Import project markdown files into kts_projects."""
    projects_dir = SOURCE_DIR / "Projects"
    if not projects_dir.exists():
        return
    for md_file in sorted(projects_dir.glob("*.md")):
        fm = parse_frontmatter(md_file)
        if not fm or fm.get("type") != "project":
            continue

        SOURCE_COUNTS["projects"] += 1
        source_id = fm.get("id", md_file.stem)

        # Idempotency: skip if project with this name already exists
        name = fm.get("title", fm.get("name", md_file.stem))
        existing = await session.execute(
            select(KtsProject).where(KtsProject.name == name)
        )
        existing_project = existing.scalars().first()
        if existing_project:
            SKIPPED_COUNTS["projects"] += 1
            SOURCE_ID_MAP[source_id] = str(existing_project.id)
            print(f"  SKIP project (exists): {name} (source: {source_id})")
            continue

        new_id = gen_uuid()
        SOURCE_ID_MAP[source_id] = new_id

        # Track unmapped fields
        for field in ("tags", "relationships", "version", "organization_id", "project_manager", "priority", "methodology", "budget_hours", "budget_amount", "actual_hours", "actual_amount", "custom_fields"):
            if field in fm and fm[field]:
                UNMAPPED_FIELDS.append(f"{md_file}:{field}")

        project = KtsProject(
            id=new_id,
            name=name,
            description=None,
            status=normalize_status(fm.get("status")),
            client_id=SOURCE_ID_MAP.get(str(fm.get("organization_id"))) if fm.get("organization_id") else None,
        )

        if apply:
            session.add(project)
            INSERTED_IDS["projects"].append(new_id)
        IMPORTED_COUNTS["projects"] += 1
        print(f"  {'WRITE' if apply else 'DRY-RUN'} project: {name} (source: {source_id})")


async def import_templates(session: AsyncSession, apply: bool) -> None:
    """Import template markdown files into kts_templates.

    Skips skeleton templates with placeholder IDs (e.g. CUS-######).
    """
    templates_dir = SOURCE_DIR / "Templates"
    if not templates_dir.exists():
        return
    for md_file in sorted(templates_dir.glob("*.md")):
        # Skip subdirectories (Checklists/)
        if not md_file.is_file():
            continue

        fm = parse_frontmatter(md_file)
        if not fm:
            continue

        # Skip skeleton templates with placeholder IDs
        source_id = fm.get("id", "")
        if source_id and "######" in str(source_id):
            print(f"  SKIP template (skeleton): {md_file.name} (placeholder ID)")
            continue

        title = fm.get("title", fm.get("name", md_file.stem))

        SOURCE_COUNTS["templates"] += 1

        # Idempotency: skip if template with this name already exists
        existing = await session.execute(
            select(KtsTemplate).where(KtsTemplate.name == title)
        )
        existing_template = existing.scalars().first()
        if existing_template:
            SKIPPED_COUNTS["templates"] += 1
            print(f"  SKIP template (exists): {title} (source: {md_file.name})")
            continue

        new_id = gen_uuid()
        SOURCE_ID_MAP[md_file.stem] = new_id

        # Track unmapped fields
        for field in ("tags", "relationships", "class", "client_id", "first_name", "last_name", "display_name", "organization_id", "email", "phone", "preferred_contact_method", "role", "department", "mobile", "timezone", "language", "preferences", "address", "billing", "equipment", "custom_fields"):
            if field in fm and fm[field]:
                UNMAPPED_FIELDS.append(f"{md_file}:{field}")

        template = KtsTemplate(
            id=new_id,
            name=title,
            category="template",
            content=None,
        )

        if apply:
            session.add(template)
            INSERTED_IDS["templates"].append(new_id)
        IMPORTED_COUNTS["templates"] += 1
        print(f"  {'WRITE' if apply else 'DRY-RUN'} template: {title} (source: {md_file.name})")


async def import_invoices(session: AsyncSession, apply: bool) -> None:
    """Import invoice JSON files into kts_invoices."""
    invoices_dir = SOURCE_DIR / "Invoices"
    if not invoices_dir.exists():
        return
    for json_file in sorted(invoices_dir.glob("*.json")):
        try:
            data = json.loads(json_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            print(f"  SKIP invoice (invalid JSON): {json_file.name}")
            continue

        invoice_data = data.get("invoice", {})
        if not invoice_data:
            continue

        SOURCE_COUNTS["invoices"] += 1
        invoice_number = invoice_data.get("number", json_file.stem)

        # Idempotency: skip if invoice with this number already exists
        existing = await session.execute(
            select(KtsInvoice).where(KtsInvoice.invoice_number == invoice_number)
        )
        existing_inv = existing.scalars().first()
        if existing_inv:
            SKIPPED_COUNTS["invoices"] += 1
            print(f"  SKIP invoice (exists): {invoice_number} (source: {json_file.name})")
            continue

        new_id = gen_uuid()
        SOURCE_ID_MAP[invoice_number] = new_id

        items = invoice_data.get("items", [])
        subtotal = invoice_data.get("subtotal")
        tax = invoice_data.get("tax")
        total = invoice_data.get("total")

        inv = KtsInvoice(
            id=new_id,
            invoice_number=invoice_number,
            invoice_date=invoice_data.get("date"),
            due_date=invoice_data.get("due_date"),
            company=data.get("company"),
            client=data.get("client"),
            items=items if items else None,
            subtotal=float(subtotal) if subtotal is not None else None,
            tax=float(tax) if tax is not None else None,
            total=float(total) if total is not None else None,
            status=invoice_data.get("terms"),
        )

        if apply:
            session.add(inv)
            INSERTED_IDS["invoices"].append(new_id)
        IMPORTED_COUNTS["invoices"] += 1
        print(f"  {'WRITE' if apply else 'DRY-RUN'} invoice: {invoice_number} (source: {json_file.name})")


async def import_receipts(session: AsyncSession, apply: bool) -> None:
    """Import receipt JSON files into kts_receipts."""
    receipts_dir = SOURCE_DIR / "Receipts"
    if not receipts_dir.exists():
        return
    for json_file in sorted(receipts_dir.glob("*.json")):
        try:
            data = json.loads(json_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            print(f"  SKIP receipt (invalid JSON): {json_file.name}")
            continue

        receipt_data = data.get("receipt", {})
        if not receipt_data:
            continue

        SOURCE_COUNTS["receipts"] += 1
        receipt_number = receipt_data.get("number", json_file.stem)

        # Idempotency: skip if receipt with this number already exists
        existing = await session.execute(
            select(KtsReceipt).where(KtsReceipt.receipt_number == receipt_number)
        )
        existing_rcpt = existing.scalars().first()
        if existing_rcpt:
            SKIPPED_COUNTS["receipts"] += 1
            print(f"  SKIP receipt (exists): {receipt_number} (source: {json_file.name})")
            continue

        new_id = gen_uuid()
        SOURCE_ID_MAP[receipt_number] = new_id

        items = receipt_data.get("items", [])
        amount = receipt_data.get("amount")
        total = receipt_data.get("total")

        rcpt = KtsReceipt(
            id=new_id,
            receipt_number=receipt_number,
            receipt_date=receipt_data.get("date"),
            invoice_number=receipt_data.get("invoice_number"),
            payment_method=receipt_data.get("payment_method"),
            amount=float(amount) if amount is not None else None,
            items=items if items else None,
            total=float(total) if total is not None else None,
            notes=receipt_data.get("notes"),
        )

        if apply:
            session.add(rcpt)
            INSERTED_IDS["receipts"].append(new_id)
        IMPORTED_COUNTS["receipts"] += 1
        print(f"  {'WRITE' if apply else 'DRY-RUN'} receipt: {receipt_number} (source: {json_file.name})")


async def import_customers(session: AsyncSession, apply: bool) -> None:
    """Import customer markdown files into kts_customers."""
    cust_dirs = [SOURCE_DIR / "Clients/Business", SOURCE_DIR / "Clients/Residential"]
    for cust_dir in cust_dirs:
        if not cust_dir.exists():
            continue
        for md_file in sorted(cust_dir.glob("*.md")):
            fm = parse_frontmatter(md_file)
            if not fm or fm.get("type") != "client":
                continue

            SOURCE_COUNTS["customers"] += 1
            source_id = fm.get("id", md_file.stem)

            # Idempotency: skip if a customer with this name already exists
            name = fm.get("display_name") or f"{fm.get('first_name', '')} {fm.get('last_name', '')}".strip()
            if not name:
                name = md_file.stem

            existing = await session.execute(
                select(KtsCustomer).where(KtsCustomer.name == name)
            )
            existing_cust = existing.scalars().first()
            if existing_cust:
                SKIPPED_COUNTS["customers"] += 1
                # Still map the source_id so tickets can reference this customer
                SOURCE_ID_MAP[source_id] = str(existing_cust.id)
                print(f"  SKIP customer (exists): {name} (source: {source_id})")
                continue

            new_id = gen_uuid()
            SOURCE_ID_MAP[source_id] = new_id

            emails = fm.get("email", [])
            phones = fm.get("phone", [])
            email = emails[0] if isinstance(emails, list) and emails else str(emails or "")
            phone = phones[0] if isinstance(phones, list) and phones else str(phones or "")

            # Build source_metadata from unmapped fields
            source_metadata = {}
            for field in ("address", "billing", "class", "organization_id", "tags", "relationships",
                          "preferred_contact_method", "role", "timezone"):
                if field in fm and fm[field]:
                    source_metadata[field] = fm[field]
                    UNMAPPED_FIELDS.append(f"{md_file}:{field}")

            # Resolve organization FK
            org_id = None
            org_source_id = fm.get("organization_id")
            if org_source_id:
                org_id = SOURCE_ID_MAP.get(str(org_source_id))

            customer = KtsCustomer(
                id=new_id,
                name=name,
                email=email or "unknown@example.com",
                phone=phone or None,
                company=fm.get("company"),
                status=fm.get("status", "active"),
                organization_id=org_id,
                source_metadata=source_metadata,
            )

            if apply:
                session.add(customer)
                INSERTED_IDS["customers"].append(new_id)
            IMPORTED_COUNTS["customers"] += 1
            print(f"  {'WRITE' if apply else 'DRY-RUN'} customer: {name} (source: {source_id})")


async def import_tickets(session: AsyncSession, apply: bool) -> None:
    """Import ticket markdown files into kts_tickets."""
    tickets_dir = SOURCE_DIR / "Tickets"
    if not tickets_dir.exists():
        return

    for md_file in sorted(tickets_dir.glob("*.md")):
        fm = parse_frontmatter(md_file)
        if not fm or fm.get("type") != "ticket":
            continue

        SOURCE_COUNTS["tickets"] += 1
        source_id = fm.get("id", md_file.stem)

        # Resolve customer OR organization
        client_id = fm.get("client_id")
        customer_uuid = None
        organization_uuid = None

        if client_id:
            client_id_str = str(client_id)
            # First try to resolve as a customer
            customer_uuid = SOURCE_ID_MAP.get(client_id_str)
            if not customer_uuid:
                # Then try as an organization
                organization_uuid = SOURCE_ID_MAP.get(client_id_str)

        if not customer_uuid:
            # Try matching by client_name to a customer
            client_name = fm.get("client_name", "")
            if client_name:
                existing = await session.execute(
                    select(KtsCustomer).where(KtsCustomer.name == client_name)
                )
                cust = existing.scalars().first()
                if cust:
                    customer_uuid = str(cust.id)
                    if client_id:
                        SOURCE_ID_MAP[client_id] = customer_uuid

        if not customer_uuid and client_id:
            # Try matching to an organization
            organization_uuid = SOURCE_ID_MAP.get(client_id)

        if not customer_uuid and not organization_uuid:
            # Import ticket with no customer/org reference (customer_id is now nullable)
            pass  # fall through to normal creation path

        # Idempotency: skip if a ticket with this title+customer/org already exists
        title = fm.get("title", md_file.stem)
        existing = await session.execute(
            select(KtsTicket).where(
                KtsTicket.title == title,
                (KtsTicket.customer_id == customer_uuid if customer_uuid else KtsTicket.customer_id.is_(None)),
                (KtsTicket.organization_id == organization_uuid if organization_uuid else KtsTicket.organization_id.is_(None)),
            )
        )
        existing_ticket = existing.scalars().first()
        if existing_ticket:
            SKIPPED_COUNTS["tickets"] += 1
            SOURCE_ID_MAP[source_id] = str(existing_ticket.id)
            print(f"  SKIP ticket (exists): {title} (source: {source_id})")
            continue

        new_id = gen_uuid()
        SOURCE_ID_MAP[source_id] = new_id

        # Description backfill (NOT NULL column)
        description = fm.get("description") or ""
        if not description:
            worklog = fm.get("worklog", [])
            if worklog and isinstance(worklog, list):
                description = worklog[0].get("description", "")
            if not description:
                description = ""

        status = normalize_status(fm.get("status"))
        priority = normalize_priority(fm.get("priority"))

        # resolved_at: set when status is resolved/closed
        resolved_at = None
        if status in ("resolved", "closed") and fm.get("updated_at"):
            try:
                resolved_at = datetime.fromisoformat(str(fm["updated_at"]))
            except (ValueError, TypeError):
                resolved_at = None

        # Build source_metadata from unmapped fields
        source_metadata = {}
        for field in ("impact", "urgency", "category", "work_type", "client_name", "sla_policy", "source", "channel"):
            if field in fm and fm[field]:
                source_metadata[field] = fm[field]
                UNMAPPED_FIELDS.append(f"{md_file}:{field}")

        ticket = KtsTicket(
            id=new_id,
            customer_id=customer_uuid,
            organization_id=organization_uuid,
            title=title,
            description=description,
            status=status,
            priority=priority,
            assigned_to=None,
            resolved_at=resolved_at,
            source_metadata=source_metadata,
        )

        if apply:
            session.add(ticket)
            INSERTED_IDS["tickets"].append(new_id)
        IMPORTED_COUNTS["tickets"] += 1
        print(f"  {'WRITE' if apply else 'DRY-RUN'} ticket: {title} (source: {source_id})")


async def import_comments(session: AsyncSession, apply: bool) -> None:
    """Import worklog entries from ticket files into kts_comments."""
    tickets_dir = SOURCE_DIR / "Tickets"
    if not tickets_dir.exists():
        return

    for md_file in sorted(tickets_dir.glob("*.md")):
        fm = parse_frontmatter(md_file)
        if not fm or fm.get("type") != "ticket":
            continue

        ticket_source_id = fm.get("id", md_file.stem)
        ticket_uuid = SOURCE_ID_MAP.get(ticket_source_id)
        if not ticket_uuid:
            continue

        worklog = fm.get("worklog", [])
        if not worklog or not isinstance(worklog, list):
            continue

        for entry in worklog:
            SOURCE_COUNTS["comments"] += 1
            description = entry.get("description", "")
            if not description:
                continue

            # Idempotency: skip if comment with same body+ticket already exists
            existing = await session.execute(
                select(KtsComment).where(
                    KtsComment.ticket_id == ticket_uuid,
                    KtsComment.body == description,
                )
            )
            existing_comment = existing.scalars().first()
            if existing_comment:
                SKIPPED_COUNTS["comments"] += 1
                continue

            new_id = gen_uuid()
            try:
                created_at = datetime.fromisoformat(str(entry.get("date", "")))
            except (ValueError, TypeError):
                created_at = datetime.now()

            # Build source_metadata from unmapped worklog fields
            source_metadata = {}
            for field in ("mode", "hours", "amount", "payment"):
                if field in entry and entry[field]:
                    source_metadata[field] = entry[field]
                    UNMAPPED_FIELDS.append(f"{md_file}:worklog:{field}")

            comment = KtsComment(
                id=new_id,
                ticket_id=ticket_uuid,
                author="agent@kts.local",
                body=description,
                source_metadata=source_metadata,
            )

            if apply:
                session.add(comment)
                INSERTED_IDS["comments"].append(new_id)
            IMPORTED_COUNTS["comments"] += 1
            print(f"  {'WRITE' if apply else 'DRY-RUN'} comment on {ticket_source_id}: {description[:60]}...")


async def run(apply: bool = False) -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        print(f"=== Obsidian Import {'APPLY' if apply else 'DRY-RUN'} ===\n")

        # Order matters: organizations and users first (FK targets), then customers, then tickets, then comments
        print("-- Organizations --")
        await import_organizations(session, apply)

        print("\n-- Users --")
        await import_users(session, apply)

        print("\n-- Customers --")
        await import_customers(session, apply)

        print("\n-- Tickets --")
        await import_tickets(session, apply)

        print("\n-- Comments --")
        await import_comments(session, apply)

        print("\n-- Tasks --")
        await import_tasks(session, apply)

        print("\n-- Knowledge --")
        await import_knowledge(session, apply)

        print("\n-- Projects --")
        await import_projects(session, apply)

        print("\n-- Templates --")
        await import_templates(session, apply)

        print("\n-- Invoices --")
        await import_invoices(session, apply)

        print("\n-- Receipts --")
        await import_receipts(session, apply)

        if apply:
            await session.commit()
            print("\n=== Committed ===")

    await engine.dispose()

    # Verification report
    print("\n=== Verification ===")
    for table in ("customers", "tickets", "comments", "organizations", "users",
                  "tasks", "knowledge", "projects", "templates", "invoices", "receipts"):
        print(f"{table}: source={SOURCE_COUNTS[table]} imported={IMPORTED_COUNTS[table]} skipped={SKIPPED_COUNTS[table]}")

    print("\n=== Data-loss report (unmapped source fields) ===")
    if UNMAPPED_FIELDS:
        for uf in UNMAPPED_FIELDS:
            print(f"  {uf}")
    else:
        print("  None")

    if apply:
        print("\n=== Inserted IDs (for rollback) ===")
        for table, ids in INSERTED_IDS.items():
            print(f"{table}: {ids}")
    else:
        print("\n(This was a dry run. Re-run with --apply to write.)")


if __name__ == "__main__":
    apply = "--apply" in sys.argv
    asyncio.run(run(apply=apply))
