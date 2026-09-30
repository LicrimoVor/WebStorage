"""Preserve authors of material receipts."""

import sqlalchemy as sa
from alembic import op

revision = "20260930_0024"
down_revision = "20260930_0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "inventory_movements",
        sa.Column("created_by", sa.String(200), nullable=False, server_default="unknow"),
    )


def downgrade() -> None:
    op.drop_column("inventory_movements", "created_by")
