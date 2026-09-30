"""Funding source lifecycle and split payments."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260930_0023"
down_revision = "20260929_0022"
branch_labels = None
depends_on = None

TABLES = (
    "financial_transactions",
    "sales",
    "employee_payments",
    "inventory_movements",
    "business_documents",
)


def upgrade() -> None:
    op.add_column(
        "funding_sources",
        sa.Column("archived", sa.Boolean(), server_default="false", nullable=False),
    )
    for table in TABLES:
        op.add_column(
            table,
            sa.Column(
                "funding_allocations", postgresql.JSONB(), server_default="[]", nullable=False
            ),
        )


def downgrade() -> None:
    for table in TABLES:
        op.drop_column(table, "funding_allocations")
    op.drop_column("funding_sources", "archived")
