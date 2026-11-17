"""006_alert_source_enum_extend

Extend `alert_source_enum` so alerts generated from live device state can be
stored/serialized. `dashboard-threshold` was already present in the DB but
missing from the ORM model (caused GET /alerts → 500 LookupError).

Revision ID: 006_alert_source_enum_extend
Revises: 005_kts_cascade_fks
Create Date: 2026-11-16
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "006_alert_source_enum_extend"
down_revision: Union[str, None] = "005_kts_cascade_fks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE alert_source_enum ADD VALUE IF NOT EXISTS 'dashboard-threshold'")
    op.execute("ALTER TYPE alert_source_enum ADD VALUE IF NOT EXISTS 'system'")
    op.execute("ALTER TYPE alert_source_enum ADD VALUE IF NOT EXISTS 'probe'")


def downgrade() -> None:
    # Postgres cannot remove enum labels; no-op.
    pass
