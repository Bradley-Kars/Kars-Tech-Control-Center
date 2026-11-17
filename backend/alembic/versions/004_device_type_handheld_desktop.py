"""004_device_type_handheld_desktop

Add `handheld` and `desktop` to `device_type_enum` so the fleet UI can
represent the ROG Ally handheld and local workstation devices.

Revision ID: 004_device_type_handheld_desktop
Revises: 003_kts_obsidian_remediation
Create Date: 2026-11-16
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "004_device_type_handheld_desktop"
down_revision: Union[str, None] = "003_kts_obsidian_remediation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block on old
    # Postgres; commit first so the new labels are usable in the same session.
    op.execute("COMMIT")
    op.execute("ALTER TYPE device_type_enum ADD VALUE IF NOT EXISTS 'desktop'")
    op.execute("ALTER TYPE device_type_enum ADD VALUE IF NOT EXISTS 'handheld'")


def downgrade() -> None:
    # Postgres cannot remove enum labels; downgrade is intentionally a no-op.
    pass
