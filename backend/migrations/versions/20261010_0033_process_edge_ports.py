"""Persist the sides used by process connections."""

import sqlalchemy as sa
from alembic import op

revision = "20261010_0033"
down_revision = "20261007_0032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "technological_process_edges", sa.Column("source_side", sa.String(6), nullable=True)
    )
    op.add_column(
        "technological_process_edges", sa.Column("target_side", sa.String(6), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("technological_process_edges", "target_side")
    op.drop_column("technological_process_edges", "source_side")
