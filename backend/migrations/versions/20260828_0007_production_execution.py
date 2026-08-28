"""Add production records and strict inventory source references.

Revision ID: 20260828_0007
Revises: 20260828_0006
Create Date: 2026-08-28
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260828_0007"
down_revision: str | None = "20260828_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "production_records",
        sa.Column("production_plan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantity", sa.Numeric(20, 6), nullable=False),
        sa.Column("process_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("idempotency_key", sa.String(100), nullable=False),
        sa.Column("created_by", sa.String(200), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint(
            "quantity > 0", name=op.f("ck_production_records_quantity_positive")
        ),
        sa.ForeignKeyConstraint(
            ["item_id"],
            ["manufactured_items.id"],
            name=op.f("fk_production_records_item_id_manufactured_items"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["process_version_id"],
            ["technological_process_versions.id"],
            name=op.f(
                "fk_production_records_process_version_id_technological_process_versions"
            ),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["production_plan_id"],
            ["production_plans.id"],
            name=op.f("fk_production_records_production_plan_id_production_plans"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_production_records")),
    )
    op.create_index(
        "ux_production_records_idempotency_key",
        "production_records",
        ["idempotency_key"],
        unique=True,
    )
    op.create_index(
        "ix_production_records_plan_created",
        "production_records",
        ["production_plan_id", "created_at"],
    )
    op.create_index(
        "ix_production_records_item_created",
        "production_records",
        ["item_id", "created_at"],
    )

    op.add_column(
        "inventory_movements",
        sa.Column("production_record_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_inventory_movements_production_record_id_production_records"),
        "inventory_movements",
        "production_records",
        ["production_record_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_inventory_movements_production_record",
        "inventory_movements",
        ["production_record_id"],
    )

    op.add_column(
        "manufactured_item_movements",
        sa.Column("production_record_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        op.f(
            "fk_manufactured_item_movements_production_record_id_production_records"
        ),
        "manufactured_item_movements",
        "production_records",
        ["production_record_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_manufactured_item_movements_production_record",
        "manufactured_item_movements",
        ["production_record_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_manufactured_item_movements_production_record",
        table_name="manufactured_item_movements",
    )
    op.drop_constraint(
        op.f(
            "fk_manufactured_item_movements_production_record_id_production_records"
        ),
        "manufactured_item_movements",
        type_="foreignkey",
    )
    op.drop_column("manufactured_item_movements", "production_record_id")
    op.drop_index(
        "ix_inventory_movements_production_record",
        table_name="inventory_movements",
    )
    op.drop_constraint(
        op.f("fk_inventory_movements_production_record_id_production_records"),
        "inventory_movements",
        type_="foreignkey",
    )
    op.drop_column("inventory_movements", "production_record_id")
    op.drop_index("ix_production_records_item_created", table_name="production_records")
    op.drop_index("ix_production_records_plan_created", table_name="production_records")
    op.drop_index(
        "ux_production_records_idempotency_key", table_name="production_records"
    )
    op.drop_table("production_records")
