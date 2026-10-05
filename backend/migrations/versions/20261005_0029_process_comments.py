"""Support independent comments on process diagrams."""

from alembic import op

revision = "20261005_0029"
down_revision = "20260930_0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        op.f("ck_technological_process_nodes_node_type_valid"),
        "technological_process_nodes",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_technological_process_nodes_node_type_valid"),
        "technological_process_nodes",
        "node_type IN ('material', 'manufactured_item', 'operation', 'output', 'comment')",
    )


def downgrade() -> None:
    op.execute("DELETE FROM technological_process_nodes WHERE node_type = 'comment'")
    op.drop_constraint(
        op.f("ck_technological_process_nodes_node_type_valid"),
        "technological_process_nodes",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_technological_process_nodes_node_type_valid"),
        "technological_process_nodes",
        "node_type IN ('material', 'manufactured_item', 'operation', 'output')",
    )
