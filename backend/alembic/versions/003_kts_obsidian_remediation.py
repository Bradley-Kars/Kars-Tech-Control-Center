"""003_kts_obsidian_remediation

Add WS-7 remediation tables and columns:
- kts_organizations (org records from Obsidian)
- kts_invoices, kts_receipts (JSON invoice/receipt records)
- kts_tasks, kts_knowledge, kts_projects, kts_templates, kts_users (previously "no home")
- organization_id FK on kts_customers and kts_tickets
- source_metadata JSONB on kts_customers, kts_tickets, kts_comments

Revision ID: 003_kts_obsidian_remediation
Revises: 002_kts_domain
Create Date: 2026-11-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "003_kts_obsidian_remediation"
down_revision: Union[str, None] = "002_kts_domain"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- kts_organizations ---
    op.create_table(
        "kts_organizations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("legal_name", sa.String(), nullable=True),
        sa.Column("industry", sa.String(), nullable=True),
        sa.Column("size", sa.String(), nullable=True),
        sa.Column("tier", sa.String(), nullable=True),
        sa.Column("primary_contact_id", sa.String(), nullable=True),
        sa.Column("billing_contact_id", sa.String(), nullable=True),
        sa.Column("address", postgresql.JSONB(), nullable=True),
        sa.Column("billing", postgresql.JSONB(), nullable=True),
        sa.Column("sla_policy", sa.String(), nullable=True),
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

    # --- kts_invoices ---
    op.create_table(
        "kts_invoices",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("invoice_number", sa.String(), nullable=True),
        sa.Column("invoice_date", sa.String(), nullable=True),
        sa.Column("due_date", sa.String(), nullable=True),
        sa.Column("company", postgresql.JSONB(), nullable=True),
        sa.Column("client", postgresql.JSONB(), nullable=True),
        sa.Column("items", postgresql.JSONB(), nullable=True),
        sa.Column("subtotal", sa.Float(), nullable=True),
        sa.Column("tax", sa.Float(), nullable=True),
        sa.Column("total", sa.Float(), nullable=True),
        sa.Column("status", sa.String(), nullable=True),
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

    # --- kts_receipts ---
    op.create_table(
        "kts_receipts",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("receipt_number", sa.String(), nullable=True),
        sa.Column("receipt_date", sa.String(), nullable=True),
        sa.Column("invoice_number", sa.String(), nullable=True),
        sa.Column("payment_method", sa.String(), nullable=True),
        sa.Column("amount", sa.Float(), nullable=True),
        sa.Column("items", postgresql.JSONB(), nullable=True),
        sa.Column("total", sa.Float(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
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

    # --- kts_tasks ---
    op.create_table(
        "kts_tasks",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=True, server_default="open"),
        sa.Column("priority", sa.String(), nullable=True, server_default="medium"),
        sa.Column("due_date", sa.String(), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
    )

    # --- kts_knowledge ---
    op.create_table(
        "kts_knowledge",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.String()), nullable=True),
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

    # --- kts_projects ---
    op.create_table(
        "kts_projects",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=True, server_default="active"),
        sa.Column("client_id", sa.String(), nullable=True),
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

    # --- kts_templates ---
    op.create_table(
        "kts_templates",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
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

    # --- kts_users ---
    op.create_table(
        "kts_users",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("username", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("role", sa.String(), nullable=True),
        sa.Column("teams", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("skills", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("capacity_hours_per_day", sa.Float(), nullable=True),
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

    # --- Add organization_id + source_metadata to kts_customers ---
    op.add_column(
        "kts_customers",
        sa.Column("organization_id", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "fk_kts_customers_organization_id",
        "kts_customers",
        "kts_organizations",
        ["organization_id"],
        ["id"],
    )
    op.add_column(
        "kts_customers",
        sa.Column(
            "source_metadata",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
    )

    # --- Add organization_id + source_metadata to kts_tickets ---
    op.add_column(
        "kts_tickets",
        sa.Column("organization_id", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "fk_kts_tickets_organization_id",
        "kts_tickets",
        "kts_organizations",
        ["organization_id"],
        ["id"],
    )
    op.add_column(
        "kts_tickets",
        sa.Column(
            "source_metadata",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
    )

    # --- Add source_metadata to kts_comments ---
    op.add_column(
        "kts_comments",
        sa.Column(
            "source_metadata",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
    )


def downgrade() -> None:
    # Remove source_metadata + organization_id from kts_comments
    op.drop_column("kts_comments", "source_metadata")

    # Remove source_metadata + organization_id from kts_tickets
    op.drop_constraint(
        "fk_kts_tickets_organization_id", "kts_tickets", type_="foreignkey"
    )
    op.drop_column("kts_tickets", "organization_id")
    op.drop_column("kts_tickets", "source_metadata")

    # Remove source_metadata + organization_id from kts_customers
    op.drop_constraint(
        "fk_kts_customers_organization_id", "kts_customers", type_="foreignkey"
    )
    op.drop_column("kts_customers", "organization_id")
    op.drop_column("kts_customers", "source_metadata")

    # Drop new tables (reverse order)
    op.drop_table("kts_users")
    op.drop_table("kts_templates")
    op.drop_table("kts_projects")
    op.drop_table("kts_knowledge")
    op.drop_table("kts_tasks")
    op.drop_table("kts_receipts")
    op.drop_table("kts_invoices")
    op.drop_table("kts_organizations")
