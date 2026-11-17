"""KTS Master Control SQLAlchemy models — all 5 Tauri parity tables + 3 KTS domain tables from SPEC.md."""

from datetime import datetime
from typing import Optional
from uuid import uuid4
import uuid as uuid_module

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.db.base import Base


# ===========================================================================
# KTS Master Control domain (Customer 1:N Ticket, comments on tickets)
# Locked contract: statuses open/in_progress/resolved/closed,
# priorities low/medium/high/urgent, UUID ids, ISO8601 timestamps,
# resolved_at nullable.
# ===========================================================================


class KtsCustomer(Base):
    __tablename__ = "kts_customers"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid4())
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    company: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="active")
    organization_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    source_metadata: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    tickets: Mapped[list["KtsTicket"]] = relationship(
        back_populates="customer", cascade="all, delete-orphan"
    )


class KtsTicket(Base):
    __tablename__ = "kts_tickets"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid4())
    )
    customer_id: Mapped[str] = mapped_column(
        String, ForeignKey("kts_customers.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        Enum(
            "open",
            "in_progress",
            "resolved",
            "closed",
            name="kts_ticket_status_enum",
            create_type=False,
        ),
        nullable=False,
        server_default="open",
    )
    priority: Mapped[str] = mapped_column(
        Enum(
            "low",
            "medium",
            "high",
            "urgent",
            name="kts_ticket_priority_enum",
            create_type=False,
        ),
        nullable=False,
        server_default="medium",
    )
    assigned_to: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    organization_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    source_metadata: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )

    customer: Mapped["KtsCustomer"] = relationship(back_populates="tickets")
    comments: Mapped[list["KtsComment"]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan"
    )


class KtsComment(Base):
    __tablename__ = "kts_comments"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid4())
    )
    ticket_id: Mapped[str] = mapped_column(
        String, ForeignKey("kts_tickets.id", ondelete="CASCADE"), nullable=False
    )
    author: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    source_metadata: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    ticket: Mapped["KtsTicket"] = relationship(back_populates="comments")


# ===========================================================================
# Tauri parity tables (servers, alerts, metrics, mc_device_status, ticketing_config)
# ===========================================================================

# ---------------------------------------------------------------------------
# 1. servers
# ---------------------------------------------------------------------------
class Server(Base):
    __tablename__ = "servers"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    hostname: Mapped[str] = mapped_column(String, nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False, server_default="22")
    username: Mapped[str] = mapped_column(String, nullable=False, server_default="root")
    auth_type: Mapped[str] = mapped_column(
        Enum("password", "key", name="auth_type_enum", create_type=False),
        nullable=False,
        server_default="password",
    )
    auth_password: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    auth_key_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    auth_passphrase: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    device_type: Mapped[str] = mapped_column(
        Enum(
            "unraid",
            "phone",
            "steamdeck",
            "htpc",
            "laptop",
            "router",
            "generic",
            "desktop",
            "handheld",
            name="device_type_enum",
            create_type=False,
        ),
        nullable=False,
        server_default="unraid",
    )
    api_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    meshcentral_device_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    meshcentral_enrolled_at: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )
    meshcentral_status: Mapped[Optional[str]] = mapped_column(
        Enum(
            "online",
            "offline",
            "connected",
            "unknown",
            name="meshcentral_status_enum",
            create_type=False,
        ),
        nullable=True,
    )
    connection_priority: Mapped[Optional[list[str]]] = mapped_column(
        ARRAY(
            Enum(
                "meshcentral",
                "ssh",
                "graphql",
                "adb",
                "kdeconnect",
                name="connection_method_enum",
                create_type=False,
            )
        ),
        nullable=True,
    )
    service_keys: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default="{}"
    )

    alerts: Mapped[list["Alert"]] = relationship(
        back_populates="device", cascade="all, delete-orphan"
    )
    metrics: Mapped[list["Metric"]] = relationship(
        back_populates="device", cascade="all, delete-orphan"
    )
    mc_status: Mapped[Optional["McDeviceStatus"]] = relationship(
        back_populates="server", cascade="all, delete-orphan", uselist=False
    )


# ---------------------------------------------------------------------------
# 2. alerts
# ---------------------------------------------------------------------------
class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    severity: Mapped[str] = mapped_column(
        Enum("critical", "warning", "info", name="alert_severity_enum", create_type=False),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    device_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("servers.id"), nullable=True
    )
    source: Mapped[str] = mapped_column(
        Enum(
            "prometheus",
            "meshcentral",
            "graphql",
            "ssh",
            "task",
            "manual",
            name="alert_source_enum",
            create_type=False,
        ),
        nullable=False,
    )
    acknowledged: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    acknowledged_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    auto_ack_rule: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    device: Mapped[Optional["Server"]] = relationship(back_populates="alerts")


# ---------------------------------------------------------------------------
# 3. metrics
# ---------------------------------------------------------------------------
class Metric(Base):
    __tablename__ = "metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[str] = mapped_column(
        String, ForeignKey("servers.id"), nullable=False
    )
    metric: Mapped[str] = mapped_column(String, nullable=False)
    value: Mapped[float] = mapped_column(nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    device: Mapped["Server"] = relationship(back_populates="metrics")


# ---------------------------------------------------------------------------
# 4. mc_device_status
# ---------------------------------------------------------------------------
class McDeviceStatus(Base):
    __tablename__ = "mc_device_status"

    device_id: Mapped[str] = mapped_column(
        String, ForeignKey("servers.id"), primary_key=True
    )
    status: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    server: Mapped["Server"] = relationship(back_populates="mc_status")


# ---------------------------------------------------------------------------
# 5. ticketing_config (singleton)
# ---------------------------------------------------------------------------
class TicketingConfig(Base):
    __tablename__ = "ticketing_config"
    __table_args__ = (CheckConstraint("id = 1", name="ticketing_config_singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, server_default="1")
    bridge_url: Mapped[Optional[str]] = mapped_column(
        String, nullable=True, server_default="http://127.0.0.1:8799"
    )
    bridge_token: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    use_live_bridge: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


# ===========================================================================
# WS-7 remediation: new tables for previously "no home" Obsidian directories
# ===========================================================================

class KtsOrganization(Base):
    __tablename__ = "kts_organizations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    legal_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    industry: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    size: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tier: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    primary_contact_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    billing_contact_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    address: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    billing: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    sla_policy: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class KtsInvoice(Base):
    __tablename__ = "kts_invoices"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    invoice_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    invoice_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    due_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    company: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    client: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    items: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    subtotal: Mapped[Optional[float]] = mapped_column(nullable=True)
    tax: Mapped[Optional[float]] = mapped_column(nullable=True)
    total: Mapped[Optional[float]] = mapped_column(nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class KtsReceipt(Base):
    __tablename__ = "kts_receipts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    receipt_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    receipt_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    invoice_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    payment_method: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    amount: Mapped[Optional[float]] = mapped_column(nullable=True)
    items: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    total: Mapped[Optional[float]] = mapped_column(nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class KtsTask(Base):
    __tablename__ = "kts_tasks"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String, nullable=True, server_default="open")
    priority: Mapped[Optional[str]] = mapped_column(String, nullable=True, server_default="medium")
    due_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    assigned_to: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class KtsKnowledge(Base):
    __tablename__ = "kts_knowledge"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    title: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tags: Mapped[Optional[list[str]]] = mapped_column(ARRAY(String), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class KtsProject(Base):
    __tablename__ = "kts_projects"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String, nullable=True, server_default="active")
    client_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class KtsTemplate(Base):
    __tablename__ = "kts_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class KtsUser(Base):
    __tablename__ = "kts_users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    username: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    role: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    teams: Mapped[Optional[list[str]]] = mapped_column(ARRAY(String), nullable=True)
    skills: Mapped[Optional[list[str]]] = mapped_column(ARRAY(String), nullable=True)
    capacity_hours_per_day: Mapped[Optional[float]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
