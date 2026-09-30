"""Sellable byproducts and anonymous production units."""

import sqlalchemy as sa
from alembic import op

revision = "20260930_0028"
down_revision = "20260930_0027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "manufactured_items",
        sa.Column("is_byproduct", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.alter_column("product_units", "serial_number", existing_type=sa.String(200), nullable=True)


def downgrade() -> None:
    op.execute(
        "UPDATE product_units SET serial_number = 'anonymous-' || id::text WHERE serial_number IS NULL"
    )
    op.alter_column("product_units", "serial_number", existing_type=sa.String(200), nullable=False)
    op.drop_column("manufactured_items", "is_byproduct")
