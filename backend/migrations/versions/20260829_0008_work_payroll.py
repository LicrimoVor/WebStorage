"""Add employee work entries, payments and payment allocations.

Revision ID: 20260829_0008
Revises: 20260828_0007
Create Date: 2026-08-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260829_0008"
down_revision: str | None = "20260828_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "work_entries",
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("input_mode", sa.String(length=20), nullable=False),
        sa.Column("input_value", sa.Numeric(20, 6), nullable=False),
        sa.Column("equivalent_quantity", sa.Numeric(20, 6), nullable=True),
        sa.Column("time_minutes", sa.Numeric(20, 6), nullable=True),
        sa.Column("time_norm_snapshot", sa.Numeric(20, 6), nullable=True),
        sa.Column("rate_snapshot", sa.Numeric(20, 2), nullable=True),
        sa.Column("accrued_amount", sa.Numeric(20, 2), nullable=True),
        sa.Column("performed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=200), nullable=False),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_by", sa.String(length=200), nullable=True),
        sa.Column("void_reason", sa.Text(), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "accrued_amount IS NULL OR accrued_amount >= 0",
            name=op.f("ck_work_entries_accrued_amount_non_negative"),
        ),
        sa.CheckConstraint(
            "equivalent_quantity IS NULL OR equivalent_quantity > 0",
            name=op.f("ck_work_entries_equivalent_quantity_positive"),
        ),
        sa.CheckConstraint(
            "input_mode IN ('quantity', 'time')",
            name=op.f("ck_work_entries_input_mode_valid"),
        ),
        sa.CheckConstraint(
            "input_value > 0", name=op.f("ck_work_entries_input_value_positive")
        ),
        sa.CheckConstraint(
            "rate_snapshot IS NULL OR rate_snapshot >= 0",
            name=op.f("ck_work_entries_rate_snapshot_non_negative"),
        ),
        sa.CheckConstraint(
            "time_minutes IS NULL OR time_minutes > 0",
            name=op.f("ck_work_entries_time_minutes_positive"),
        ),
        sa.CheckConstraint(
            "time_norm_snapshot IS NULL OR time_norm_snapshot > 0",
            name=op.f("ck_work_entries_time_norm_snapshot_positive"),
        ),
        sa.ForeignKeyConstraint(
            ["employee_id"],
            ["employees.id"],
            name=op.f("fk_work_entries_employee_id_employees"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["operation_id"],
            ["operations.id"],
            name=op.f("fk_work_entries_operation_id_operations"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_work_entries")),
    )
    op.create_index(
        "ix_work_entries_employee_performed",
        "work_entries",
        ["employee_id", "performed_at"],
    )
    op.create_index(
        "ix_work_entries_operation_performed",
        "work_entries",
        ["operation_id", "performed_at"],
    )
    op.create_index("ix_work_entries_voided_at", "work_entries", ["voided_at"])

    op.create_table(
        "employee_payments",
        sa.Column("employee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Numeric(20, 2), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=200), nullable=False),
        sa.Column("allocation_mode", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint(
            "allocation_mode IN ('fifo', 'manual')",
            name=op.f("ck_employee_payments_allocation_mode_valid"),
        ),
        sa.CheckConstraint(
            "amount > 0", name=op.f("ck_employee_payments_amount_positive")
        ),
        sa.ForeignKeyConstraint(
            ["employee_id"],
            ["employees.id"],
            name=op.f("fk_employee_payments_employee_id_employees"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employee_payments")),
    )
    op.create_index(
        "ix_employee_payments_employee_paid",
        "employee_payments",
        ["employee_id", "paid_at"],
    )

    op.create_table(
        "payment_allocations",
        sa.Column("payment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("work_entry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Numeric(20, 2), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint(
            "amount > 0", name=op.f("ck_payment_allocations_amount_positive")
        ),
        sa.ForeignKeyConstraint(
            ["payment_id"],
            ["employee_payments.id"],
            name=op.f("fk_payment_allocations_payment_id_employee_payments"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["work_entry_id"],
            ["work_entries.id"],
            name=op.f("fk_payment_allocations_work_entry_id_work_entries"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payment_allocations")),
        sa.UniqueConstraint(
            "payment_id",
            "work_entry_id",
            name=op.f("uq_payment_allocations_payment_id"),
        ),
    )
    op.create_index(
        "ix_payment_allocations_work_entry",
        "payment_allocations",
        ["work_entry_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_payment_allocations_work_entry", table_name="payment_allocations"
    )
    op.drop_table("payment_allocations")
    op.drop_index(
        "ix_employee_payments_employee_paid", table_name="employee_payments"
    )
    op.drop_table("employee_payments")
    op.drop_index("ix_work_entries_voided_at", table_name="work_entries")
    op.drop_index("ix_work_entries_operation_performed", table_name="work_entries")
    op.drop_index("ix_work_entries_employee_performed", table_name="work_entries")
    op.drop_table("work_entries")
