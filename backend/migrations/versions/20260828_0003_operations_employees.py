"""Create operations and employees catalogs.

Revision ID: 20260828_0003
Revises: 20260828_0002
Create Date: 2026-08-28
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260828_0003"
down_revision: str | None = "20260828_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "operations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("time_norm", sa.Numeric(precision=20, scale=6), nullable=True),
        sa.Column(
            "price_per_operation", sa.Numeric(precision=20, scale=2), nullable=True
        ),
        sa.Column(
            "archived", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
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
            "price_per_operation IS NULL OR price_per_operation >= 0",
            name=op.f("ck_operations_price_per_operation_non_negative"),
        ),
        sa.CheckConstraint(
            "time_norm IS NULL OR time_norm > 0",
            name=op.f("ck_operations_time_norm_positive"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_operations")),
    )
    op.create_index(
        "ix_operations_archived", "operations", ["archived"], unique=False
    )
    op.create_index(
        "ix_operations_name_lower",
        "operations",
        [sa.literal_column("lower(name)")],
        unique=True,
    )

    op.create_table(
        "employees",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column(
            "active", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column("comment", sa.Text(), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employees")),
    )
    op.create_index("ix_employees_active", "employees", ["active"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_employees_active", table_name="employees")
    op.drop_table("employees")
    op.drop_index("ix_operations_name_lower", table_name="operations")
    op.drop_index("ix_operations_archived", table_name="operations")
    op.drop_table("operations")
