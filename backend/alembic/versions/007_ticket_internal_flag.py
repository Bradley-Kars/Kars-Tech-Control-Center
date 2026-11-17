"""007_ticket_internal_flag

Add `internal` boolean (NOT NULL, default false) to `kts_tickets` so a ticket
may be saved without a customer only when explicitly marked internal.

Revision ID: 007_ticket_internal_flag
Revises: 006_alert_source_enum_extend
Create Date: 2026-11-16
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "007_ticket_internal_flag"
down_revision: Union[str, None] = "006_alert_source_enum_extend"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "kts_tickets",
        sa.Column("internal", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("kts_tickets", "internal")
