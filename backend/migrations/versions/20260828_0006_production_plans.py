"""Add production plans and calculated requirement snapshots.

Revision ID: 20260828_0006
Revises: 20260828_0005
Create Date: 2026-08-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260828_0006"
down_revision: str | None = "20260828_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "production_plans",
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("process_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("planned_quantity", sa.Numeric(20, 6), nullable=False),
        sa.Column(
            "produced_quantity",
            sa.Numeric(20, 6),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(16),
            server_default=sa.text("'active'"),
            nullable=False,
        ),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("created_by", sa.String(200), nullable=False),
        sa.Column(
            "calculation_complete",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "missing_data",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("total_required_time_minutes", sa.Numeric(20, 6), nullable=True),
        sa.Column("estimated_cost", sa.Numeric(20, 2), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "planned_quantity > 0",
            name=op.f("ck_production_plans_planned_quantity_positive"),
        ),
        sa.CheckConstraint(
            "produced_quantity >= 0",
            name=op.f("ck_production_plans_produced_quantity_non_negative"),
        ),
        sa.CheckConstraint(
            "produced_quantity <= planned_quantity",
            name=op.f("ck_production_plans_produced_quantity_not_above_planned"),
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'active', 'completed', 'cancelled')",
            name=op.f("ck_production_plans_status_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["process_version_id"],
            ["technological_process_versions.id"],
            name=op.f("fk_production_plans_process_version_id_technological_process_versions"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["manufactured_items.id"],
            name=op.f("fk_production_plans_product_id_manufactured_items"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_production_plans")),
    )
    op.create_index(
        "ix_production_plans_status_created",
        "production_plans",
        ["status", "created_at"],
    )
    op.create_index("ix_production_plans_product", "production_plans", ["product_id"])

    op.create_table(
        "production_plan_material_requirements",
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("material_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name_snapshot", sa.String(200), nullable=False),
        sa.Column("unit_snapshot", sa.String(32), nullable=False),
        sa.Column("required_quantity", sa.Numeric(20, 6), nullable=False),
        sa.Column("stock_used_quantity", sa.Numeric(20, 6), nullable=False),
        sa.Column("deficit_quantity", sa.Numeric(20, 6), nullable=False),
        sa.Column("unit_price_snapshot", sa.Numeric(20, 2), nullable=True),
        sa.Column("cost", sa.Numeric(20, 2), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint(
            "required_quantity >= 0",
            name=op.f("ck_production_plan_material_requirements_required_non_negative"),
        ),
        sa.CheckConstraint(
            "stock_used_quantity >= 0",
            name=op.f("ck_production_plan_material_requirements_stock_non_negative"),
        ),
        sa.CheckConstraint(
            "deficit_quantity >= 0",
            name=op.f("ck_production_plan_material_requirements_deficit_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["material_id"],
            ["materials.id"],
            name=op.f("fk_production_plan_material_requirements_material_id_materials"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["production_plans.id"],
            name=op.f("fk_production_plan_material_requirements_plan_id_production_plans"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_production_plan_material_requirements")),
    )
    op.create_index(
        "ix_plan_material_requirements_plan",
        "production_plan_material_requirements",
        ["plan_id"],
    )
    op.create_index(
        "ix_plan_material_requirements_material",
        "production_plan_material_requirements",
        ["material_id"],
    )

    op.create_table(
        "production_plan_item_requirements",
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("manufactured_item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("process_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name_snapshot", sa.String(200), nullable=False),
        sa.Column("unit_snapshot", sa.String(32), nullable=False),
        sa.Column("required_quantity", sa.Numeric(20, 6), nullable=False),
        sa.Column("stock_used_quantity", sa.Numeric(20, 6), nullable=False),
        sa.Column("to_produce_quantity", sa.Numeric(20, 6), nullable=False),
        sa.Column("is_plan_output", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint(
            "required_quantity >= 0",
            name=op.f("ck_production_plan_item_requirements_required_non_negative"),
        ),
        sa.CheckConstraint(
            "stock_used_quantity >= 0",
            name=op.f("ck_production_plan_item_requirements_stock_non_negative"),
        ),
        sa.CheckConstraint(
            "to_produce_quantity >= 0",
            name=op.f("ck_production_plan_item_requirements_produce_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["manufactured_item_id"],
            ["manufactured_items.id"],
            name=op.f(
                "fk_production_plan_item_requirements_manufactured_item_id_manufactured_items"
            ),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["production_plans.id"],
            name=op.f("fk_production_plan_item_requirements_plan_id_production_plans"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["process_version_id"],
            ["technological_process_versions.id"],
            name=op.f(
                "fk_production_plan_item_requirements_process_version_id_technological_process_versions"
            ),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_production_plan_item_requirements")),
    )
    op.create_index(
        "ix_plan_item_requirements_plan",
        "production_plan_item_requirements",
        ["plan_id"],
    )
    op.create_index(
        "ix_plan_item_requirements_item",
        "production_plan_item_requirements",
        ["manufactured_item_id"],
    )

    op.create_table(
        "production_plan_operation_requirements",
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name_snapshot", sa.String(200), nullable=False),
        sa.Column("required_quantity", sa.Numeric(20, 6), nullable=False),
        sa.Column("time_norm_snapshot", sa.Numeric(20, 6), nullable=True),
        sa.Column("required_time_minutes", sa.Numeric(20, 6), nullable=True),
        sa.Column("price_snapshot", sa.Numeric(20, 2), nullable=True),
        sa.Column("cost", sa.Numeric(20, 2), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint(
            "required_quantity >= 0",
            name=op.f("ck_production_plan_operation_requirements_required_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["operation_id"],
            ["operations.id"],
            name=op.f("fk_production_plan_operation_requirements_operation_id_operations"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"],
            ["production_plans.id"],
            name=op.f("fk_production_plan_operation_requirements_plan_id_production_plans"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_production_plan_operation_requirements")),
    )
    op.create_index(
        "ix_plan_operation_requirements_plan",
        "production_plan_operation_requirements",
        ["plan_id"],
    )
    op.create_index(
        "ix_plan_operation_requirements_operation",
        "production_plan_operation_requirements",
        ["operation_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_plan_operation_requirements_operation",
        table_name="production_plan_operation_requirements",
    )
    op.drop_index(
        "ix_plan_operation_requirements_plan",
        table_name="production_plan_operation_requirements",
    )
    op.drop_table("production_plan_operation_requirements")
    op.drop_index(
        "ix_plan_item_requirements_item",
        table_name="production_plan_item_requirements",
    )
    op.drop_index(
        "ix_plan_item_requirements_plan",
        table_name="production_plan_item_requirements",
    )
    op.drop_table("production_plan_item_requirements")
    op.drop_index(
        "ix_plan_material_requirements_material",
        table_name="production_plan_material_requirements",
    )
    op.drop_index(
        "ix_plan_material_requirements_plan",
        table_name="production_plan_material_requirements",
    )
    op.drop_table("production_plan_material_requirements")
    op.drop_index("ix_production_plans_product", table_name="production_plans")
    op.drop_index("ix_production_plans_status_created", table_name="production_plans")
    op.drop_table("production_plans")
