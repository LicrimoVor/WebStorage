"""Add hourly employees and production outside a plan.

Revision ID: 20260829_0011
Revises: 20260829_0010
Create Date: 2026-08-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260829_0011"
down_revision: str | None = "20260829_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "employees",
        sa.Column(
            "compensation_type",
            sa.String(length=20),
            server_default="piecework",
            nullable=False,
        ),
    )
    op.add_column(
        "employees",
        sa.Column("hourly_rate", sa.Numeric(precision=20, scale=2), nullable=True),
    )
    op.create_check_constraint(
        "compensation_valid",
        "employees",
        "(compensation_type = 'piecework' AND hourly_rate IS NULL) OR "
        "(compensation_type = 'hourly' AND hourly_rate > 0)",
    )

    op.alter_column("production_records", "production_plan_id", nullable=True)

    op.add_column(
        "work_entries",
        sa.Column(
            "compensation_type_snapshot",
            sa.String(length=20),
            server_default="piecework",
            nullable=False,
        ),
    )
    op.add_column(
        "work_entries",
        sa.Column(
            "production_record_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.drop_constraint(
        "fk_work_entries_employee_id_employees",
        "work_entries",
        type_="foreignkey",
    )
    op.alter_column("work_entries", "employee_id", nullable=True)
    op.create_foreign_key(
        op.f("fk_work_entries_employee_id_employees"),
        "work_entries",
        "employees",
        ["employee_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        op.f("fk_work_entries_production_record_id_production_records"),
        "work_entries",
        "production_records",
        ["production_record_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_work_entries_production_record",
        "work_entries",
        ["production_record_id"],
        unique=False,
    )
    op.create_check_constraint(
        "compensation_type_snapshot_valid",
        "work_entries",
        "compensation_type_snapshot IN ('piecework', 'hourly', 'anonymous')",
    )
    op.create_check_constraint(
        "employee_or_production_present",
        "work_entries",
        "employee_id IS NOT NULL OR production_record_id IS NOT NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_work_entries_employee_or_production_present",
        "work_entries",
        type_="check",
    )
    op.drop_constraint(
        "ck_work_entries_compensation_type_snapshot_valid",
        "work_entries",
        type_="check",
    )
    op.drop_index("ix_work_entries_production_record", table_name="work_entries")
    op.drop_constraint(
        "fk_work_entries_production_record_id_production_records",
        "work_entries",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_work_entries_employee_id_employees",
        "work_entries",
        type_="foreignkey",
    )
    op.alter_column("work_entries", "employee_id", nullable=False)
    op.create_foreign_key(
        op.f("fk_work_entries_employee_id_employees"),
        "work_entries",
        "employees",
        ["employee_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.drop_column("work_entries", "production_record_id")
    op.drop_column("work_entries", "compensation_type_snapshot")

    op.alter_column("production_records", "production_plan_id", nullable=False)

    op.drop_constraint(
        "ck_employees_compensation_valid", "employees", type_="check"
    )
    op.drop_column("employees", "hourly_rate")
    op.drop_column("employees", "compensation_type")
