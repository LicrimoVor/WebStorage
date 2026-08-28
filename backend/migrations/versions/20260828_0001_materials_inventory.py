"""Create materials and inventory movement ledger.

Revision ID: 20260828_0001
Revises:
Create Date: 2026-08-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260828_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "materials",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("price", sa.Numeric(precision=20, scale=2), nullable=True),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("image", sa.Text(), nullable=True),
        sa.Column("archived", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_materials")),
        sa.CheckConstraint(
            "price IS NULL OR price >= 0",
            name=op.f("ck_materials_price_non_negative"),
        ),
    )
    op.create_index("ix_materials_archived", "materials", ["archived"], unique=False)
    op.create_index(
        "ix_materials_name_lower",
        "materials",
        [sa.literal_column("lower(name)")],
        unique=True,
    )

    op.create_table(
        "inventory_movements",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("material_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("movement_type", sa.String(length=24), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=20, scale=6), nullable=False),
        sa.Column("balance_before", sa.Numeric(precision=20, scale=6), nullable=False),
        sa.Column("balance_after", sa.Numeric(precision=20, scale=6), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("source_type", sa.String(length=64), nullable=True),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "balance_after >= 0",
            name=op.f("ck_inventory_movements_balance_after_non_negative"),
        ),
        sa.CheckConstraint(
            "balance_before >= 0",
            name=op.f("ck_inventory_movements_balance_before_non_negative"),
        ),
        sa.CheckConstraint(
            "movement_type IN ('receipt', 'consumption', 'production', 'sale', 'adjustment', 'write_off')",
            name=op.f("ck_inventory_movements_movement_type_valid"),
        ),
        sa.CheckConstraint(
            "quantity <> 0",
            name=op.f("ck_inventory_movements_quantity_non_zero"),
        ),
        sa.ForeignKeyConstraint(
            ["material_id"],
            ["materials.id"],
            name="fk_inventory_movements_material_id_materials",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inventory_movements")),
    )
    op.create_index(
        "ix_inventory_movements_material_created",
        "inventory_movements",
        ["material_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_inventory_movements_type",
        "inventory_movements",
        ["movement_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_inventory_movements_type", table_name="inventory_movements")
    op.drop_index("ix_inventory_movements_material_created", table_name="inventory_movements")
    op.drop_table("inventory_movements")
    op.drop_index("ix_materials_name_lower", table_name="materials")
    op.drop_index("ix_materials_archived", table_name="materials")
    op.drop_table("materials")
