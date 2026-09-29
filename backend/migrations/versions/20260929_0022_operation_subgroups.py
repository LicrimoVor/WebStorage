"""Two-level operation groups with names unique within a parent."""
import sqlalchemy as sa
from alembic import op

revision = "20260929_0022"
down_revision = "20260929_0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("operation_groups", sa.Column("parent_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_operation_groups_parent", "operation_groups", "operation_groups",
                          ["parent_id"], ["id"], ondelete="RESTRICT")
    op.drop_index("ux_operation_groups_name_lower", table_name="operation_groups")
    op.create_index("ux_operation_groups_root_name", "operation_groups", [sa.text("lower(name)")],
                    unique=True, postgresql_where=sa.text("parent_id IS NULL"))
    op.create_index("ux_operation_groups_child_name", "operation_groups",
                    ["parent_id", sa.text("lower(name)")], unique=True,
                    postgresql_where=sa.text("parent_id IS NOT NULL"))


def downgrade() -> None:
    op.create_index("ux_operation_groups_name_lower", "operation_groups", [sa.text("lower(name)")],
                    unique=True)
    op.drop_index("ux_operation_groups_child_name", table_name="operation_groups")
    op.drop_index("ux_operation_groups_root_name", table_name="operation_groups")
    op.drop_constraint("fk_operation_groups_parent", "operation_groups", type_="foreignkey")
    op.drop_column("operation_groups", "parent_id")
