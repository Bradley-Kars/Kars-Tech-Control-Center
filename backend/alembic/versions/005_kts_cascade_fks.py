"""005_kts_cascade_fks

Add ON DELETE CASCADE to the KTS domain foreign keys so a manual `psql`
row delete can never orphan tickets/comments:

- kts_comments.ticket_id  → kts_tickets(id)   ON DELETE CASCADE
- kts_tickets.customer_id → kts_customers(id) ON DELETE CASCADE

Revision ID: 005_kts_cascade_fks
Revises: 004_device_type_handheld_desktop
Create Date: 2026-11-16
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "005_kts_cascade_fks"
down_revision: Union[str, None] = "004_device_type_handheld_desktop"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # kts_comments.ticket_id → ON DELETE CASCADE
    op.drop_constraint(
        "kts_comments_ticket_id_fkey", "kts_comments", type_="foreignkey"
    )
    op.create_foreign_key(
        "kts_comments_ticket_id_fkey",
        "kts_comments",
        "kts_tickets",
        ["ticket_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # kts_tickets.customer_id → ON DELETE CASCADE
    op.drop_constraint(
        "kts_tickets_customer_id_fkey", "kts_tickets", type_="foreignkey"
    )
    op.create_foreign_key(
        "kts_tickets_customer_id_fkey",
        "kts_tickets",
        "kts_customers",
        ["customer_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "kts_tickets_customer_id_fkey", "kts_tickets", type_="foreignkey"
    )
    op.create_foreign_key(
        "kts_tickets_customer_id_fkey",
        "kts_tickets",
        "kts_customers",
        ["customer_id"],
        ["id"],
    )

    op.drop_constraint(
        "kts_comments_ticket_id_fkey", "kts_comments", type_="foreignkey"
    )
    op.create_foreign_key(
        "kts_comments_ticket_id_fkey",
        "kts_comments",
        "kts_tickets",
        ["ticket_id"],
        ["id"],
    )
