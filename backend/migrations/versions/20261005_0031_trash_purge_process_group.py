"""Permanent trash dismissal and default process inventory group."""

import sqlalchemy as sa
from alembic import op

revision = "20261005_0031"
down_revision = "20261005_0030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trash_entries", sa.Column("purged_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("technological_processes", sa.Column("default_group_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_technological_processes_default_group", "technological_processes", "inventory_groups",
        ["default_group_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_technological_processes_default_group", "technological_processes", type_="foreignkey")
    op.drop_column("technological_processes", "default_group_id")
    op.drop_column("trash_entries", "purged_at")
