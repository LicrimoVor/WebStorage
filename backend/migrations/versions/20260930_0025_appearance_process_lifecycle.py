"""Personal palettes and process lifecycle."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "20260930_0025"
down_revision = "20260930_0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_accounts", sa.Column("appearance", JSONB(), nullable=False, server_default="{}")
    )
    op.add_column(
        "technological_processes",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.drop_index("ix_technological_processes_name_lower", table_name="technological_processes")
    op.drop_index("ux_technological_processes_output_item", table_name="technological_processes")
    op.create_index(
        "ix_technological_processes_name_lower",
        "technological_processes",
        [sa.text("lower(name)")],
        unique=True,
        postgresql_where=sa.text("archived = false"),
    )
    op.create_index(
        "ux_technological_processes_output_item",
        "technological_processes",
        ["output_item_id"],
        unique=True,
        postgresql_where=sa.text("output_item_id IS NOT NULL AND archived = false"),
    )


def downgrade() -> None:
    op.drop_index("ix_technological_processes_name_lower", table_name="technological_processes")
    op.drop_index("ux_technological_processes_output_item", table_name="technological_processes")
    op.create_index(
        "ix_technological_processes_name_lower",
        "technological_processes",
        [sa.text("lower(name)")],
        unique=True,
    )
    op.create_index(
        "ux_technological_processes_output_item",
        "technological_processes",
        ["output_item_id"],
        unique=True,
        postgresql_where=sa.text("output_item_id IS NOT NULL"),
    )
    op.drop_column("technological_processes", "deleted_at")
    op.drop_column("user_accounts", "appearance")
