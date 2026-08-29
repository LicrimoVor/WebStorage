"""Add indexes used by period analytics.

Revision ID: 20260829_0010
Revises: 20260829_0009
Create Date: 2026-08-29
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20260829_0010"
down_revision: str | None = "20260829_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_production_records_created_at", "production_records", ["created_at"]
    )
    op.create_index(
        "ix_inventory_movements_created_at", "inventory_movements", ["created_at"]
    )
    op.create_index(
        "ix_manufactured_item_movements_created_at",
        "manufactured_item_movements",
        ["created_at"],
    )
    op.create_index(
        "ix_work_entries_performed_at", "work_entries", ["performed_at"]
    )
    op.create_index(
        "ix_employee_payments_paid_at", "employee_payments", ["paid_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_employee_payments_paid_at", table_name="employee_payments")
    op.drop_index("ix_work_entries_performed_at", table_name="work_entries")
    op.drop_index(
        "ix_manufactured_item_movements_created_at",
        table_name="manufactured_item_movements",
    )
    op.drop_index("ix_inventory_movements_created_at", table_name="inventory_movements")
    op.drop_index("ix_production_records_created_at", table_name="production_records")
