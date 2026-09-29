"""Scope inventory group names to their parent."""

import sqlalchemy as sa
from alembic import op

revision = "20260929_0020"
down_revision = "20260929_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_inventory_groups_name_lower", table_name="inventory_groups")
    op.create_index(
        "ux_inventory_groups_root_name", "inventory_groups", [sa.text("lower(name)")],
        unique=True, postgresql_where=sa.text("parent_id IS NULL"),
    )
    op.create_index(
        "ux_inventory_groups_child_name", "inventory_groups",
        ["parent_id", sa.text("lower(name)")],
        unique=True, postgresql_where=sa.text("parent_id IS NOT NULL"),
    )


def downgrade() -> None:
    # The old constraint must succeed before removing the new ones. Duplicate
    # names across parents must be resolved manually before downgrading.
    op.create_index(
        "ix_inventory_groups_name_lower", "inventory_groups", [sa.text("lower(name)")],
        unique=True,
    )
    op.drop_index("ux_inventory_groups_child_name", table_name="inventory_groups")
    op.drop_index("ux_inventory_groups_root_name", table_name="inventory_groups")
