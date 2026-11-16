"""001_initial_schema

Create all five tables from SPEC.md:
- servers (with JSONB service_keys, enums)
- alerts
- metrics
- mc_device_status
- ticketing_config (singleton)

Revision ID: 001_initial_schema
Revises:
Create Date: 2026-11-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- ENUM types ---
    device_type_enum = postgresql.ENUM(
        "unraid",
        "phone",
        "steamdeck",
        "htpc",
        "laptop",
        "router",
        "generic",
        name="device_type_enum",
        create_type=True,
    )
    auth_type_enum = postgresql.ENUM(
        "password", "key", name="auth_type_enum", create_type=True
    )
    connection_method_enum = postgresql.ENUM(
        "meshcentral",
        "ssh",
        "graphql",
        "adb",
        "kdeconnect",
        name="connection_method_enum",
        create_type=True,
    )
    alert_severity_enum = postgresql.ENUM(
        "critical", "warning", "info", name="alert_severity_enum", create_type=True
    )
    alert_source_enum = postgresql.ENUM(
        "prometheus",
        "meshcentral",
        "graphql",
        "ssh",
        "task",
        "manual",
        name="alert_source_enum",
        create_type=True,
    )
    meshcentral_status_enum = postgresql.ENUM(
        "online",
        "offline",
        "connected",
        "unknown",
        name="meshcentral_status_enum",
        create_type=True,
    )

    # --- servers ---
    op.create_table(
        "servers",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("hostname", sa.String(), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False, server_default="22"),
        sa.Column("username", sa.String(), nullable=False, server_default="root"),
        sa.Column(
            "auth_type",
            auth_type_enum,
            nullable=False,
            server_default="password",
        ),
        sa.Column("auth_password", sa.String(), nullable=True),
        sa.Column("auth_key_path", sa.String(), nullable=True),
        sa.Column("auth_passphrase", sa.String(), nullable=True),
        sa.Column(
            "device_type",
            device_type_enum,
            nullable=False,
            server_default="unraid",
        ),
        sa.Column("api_key", sa.String(), nullable=True),
        sa.Column("meshcentral_device_id", sa.String(), nullable=True),
        sa.Column("meshcentral_enrolled_at", sa.String(), nullable=True),
        sa.Column(
            "meshcentral_status", meshcentral_status_enum, nullable=True
        ),
        sa.Column(
            "connection_priority",
            postgresql.ARRAY(connection_method_enum),
            nullable=True,
        ),
        sa.Column(
            "service_keys",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # --- alerts ---
    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "severity", alert_severity_enum, nullable=False
        ),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("device_id", sa.String(), nullable=True),
        sa.Column(
            "source", alert_source_enum, nullable=False
        ),
        sa.Column(
            "acknowledged", sa.Boolean(), nullable=False, server_default="false"
        ),
        sa.Column("acknowledged_by", sa.String(), nullable=True),
        sa.Column("acknowledged_at", sa.TIMESTAMP(), nullable=True),
        sa.Column("auto_ack_rule", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["servers.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_alerts_device", "alerts", ["device_id"])
    op.create_index("idx_alerts_created", "alerts", ["created_at"])
    op.create_index("idx_alerts_severity", "alerts", ["severity"])

    # --- metrics ---
    op.create_table(
        "metrics",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(), nullable=False),
        sa.Column("metric", sa.String(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column(
            "timestamp",
            sa.TIMESTAMP(),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["servers.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_metrics_device_metric", "metrics", ["device_id", "metric"])
    op.create_index("idx_metrics_timestamp", "metrics", ["timestamp"])

    # --- mc_device_status ---
    op.create_table(
        "mc_device_status",
        sa.Column("device_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(), nullable=False),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["servers.id"],
        ),
        sa.PrimaryKeyConstraint("device_id"),
    )

    # --- ticketing_config (singleton) ---
    op.create_table(
        "ticketing_config",
        sa.Column("id", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "bridge_url",
            sa.String(),
            nullable=True,
            server_default="http://127.0.0.1:8799",
        ),
        sa.Column("bridge_token", sa.String(), nullable=True),
        sa.Column(
            "use_live_bridge",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
        sa.Column(
            "updated_at",
            sa.TIMESTAMP(),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint("id = 1", name="ticketing_config_singleton"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_index("idx_metrics_timestamp", table_name="metrics")
    op.drop_index("idx_metrics_device_metric", table_name="metrics")
    op.drop_table("metrics")

    op.drop_index("idx_alerts_severity", table_name="alerts")
    op.drop_index("idx_alerts_created", table_name="alerts")
    op.drop_index("idx_alerts_device", table_name="alerts")
    op.drop_table("alerts")

    op.drop_table("mc_device_status")

    op.drop_table("ticketing_config")

    op.drop_table("servers")

    # Drop ENUM types (PostgreSQL requires dropping after tables)
    op.execute("DROP TYPE IF EXISTS meshcentral_status_enum")
    op.execute("DROP TYPE IF EXISTS alert_source_enum")
    op.execute("DROP TYPE IF EXISTS alert_severity_enum")
    op.execute("DROP TYPE IF EXISTS connection_method_enum")
    op.execute("DROP TYPE IF EXISTS device_type_enum")
    op.execute("DROP TYPE IF EXISTS auth_type_enum")
