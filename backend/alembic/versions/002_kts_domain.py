"""002_kts_domain

Create KTS Master Control domain tables:
- kts_customers
- kts_tickets (FK -> kts_customers)
- kts_comments (FK -> kts_tickets)

With KTS ticket status/priority enums.

Revision ID: 002_kts_domain
Revises: 001_initial_schema
Create Date: 2026-11-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "002_kts_domain"
down_revision: Union[str, None] = "001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- KTS enums ---
    kts_ticket_status_enum = postgresql.ENUM(
        "open", "in_progress", "resolved", "closed",
        name="kts_ticket_status_enum", create_type=True,
    )
    kts_ticket_priority_enum = postgresql.ENUM(
        "low", "medium", "high", "urgent",
        name="kts_ticket_priority_enum", create_type=True,
    )

    # --- kts_customers ---
    op.create_table(
        "kts_customers",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("company", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- kts_tickets ---
    op.create_table(
        "kts_tickets",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("customer_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "status",
            kts_ticket_status_enum,
            nullable=False,
            server_default="open",
        ),
        sa.Column(
            "priority",
            kts_ticket_priority_enum,
            nullable=False,
            server_default="medium",
        ),
        sa.Column("assigned_to", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["customer_id"], ["kts_customers.id"]),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- kts_comments ---
    op.create_table(
        "kts_comments",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("ticket_id", sa.String(), nullable=False),
        sa.Column("author", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.ForeignKeyConstraint(["ticket_id"], ["kts_tickets.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("kts_comments")
    op.drop_table("kts_tickets")
    op.drop_table("kts_customers")

    op.execute("DROP TYPE IF EXISTS kts_ticket_priority_enum")
    op.execute("DROP TYPE IF EXISTS kts_ticket_status_enum")
