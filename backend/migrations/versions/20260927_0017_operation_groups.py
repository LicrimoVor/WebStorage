"""Group the operation catalog."""

import sqlalchemy as sa
from alembic import op

revision = "20260927_0017"
down_revision = "20260917_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "operation_groups",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ux_operation_groups_name_lower", "operation_groups", [sa.text("lower(name)")], unique=True
    )
    op.add_column(
        "operations",
        sa.Column(
            "group_id",
            sa.UUID(),
            sa.ForeignKey("operation_groups.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_operations_group_id", "operations", ["group_id"])
    op.execute(
        "CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON operation_groups FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()"
    )


def downgrade() -> None:
    op.drop_index("ix_operations_group_id", "operations")
    op.drop_column("operations", "group_id")
    op.drop_table("operation_groups")
