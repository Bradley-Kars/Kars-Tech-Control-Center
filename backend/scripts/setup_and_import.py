"""Create KTS domain tables and run Obsidian import in one step.

Usage:
    python scripts/setup_and_import.py [--apply]

Creates all tables (idempotent via CREATE TYPE IF NOT EXISTS logic), then
runs the Obsidian import (dry-run by default, --apply to write).
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from app.core.config import settings
from app.db.base import Base
from app.models import KtsComment, KtsCustomer, KtsTicket  # noqa: F401  ensure models registered

engine = create_async_engine(settings.DATABASE_URL, echo=False)

# All enum types referenced by SQLAlchemy models (create_type=False in models,
# so they must exist before create_all)
ENUM_DEFS = [
    ("auth_type_enum", ("'password'", "'key'")),
    ("device_type_enum", ("'unraid'", "'phone'", "'steamdeck'", "'htpc'", "'laptop'", "'router'", "'generic'")),
    ("connection_method_enum", ("'meshcentral'", "'ssh'", "'graphql'", "'adb'", "'kdeconnect'")),
    ("meshcentral_status_enum", ("'online'", "'offline'", "'connected'", "'unknown'")),
    ("alert_severity_enum", ("'critical'", "'warning'", "'info'")),
    ("alert_source_enum", ("'prometheus'", "'meshcentral'", "'graphql'", "'ssh'", "'task'", "'manual'")),
    ("kts_ticket_status_enum", ("'open'", "'in_progress'", "'resolved'", "'closed'")),
    ("kts_ticket_priority_enum", ("'low'", "'medium'", "'high'", "'urgent'")),
]


async def create_tables() -> None:
    async with engine.begin() as conn:
        # Create all enum types idempotently
        for enum_name, values in ENUM_DEFS:
            values_sql = ", ".join(values)
            await conn.execute(
                text(
                    f"DO $$ BEGIN CREATE TYPE {enum_name} AS ENUM ({values_sql}); "
                    f"EXCEPTION WHEN duplicate_object THEN null; END $$;"
                )
            )
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created/verified.")


async def run_import(apply: bool) -> None:
    from scripts.import_obsidian import run as import_run
    await import_run(apply=apply)


async def main() -> None:
    apply = "--apply" in sys.argv
    await create_tables()
    await run_import(apply=apply)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())