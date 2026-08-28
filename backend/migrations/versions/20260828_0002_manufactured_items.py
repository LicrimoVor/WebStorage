"""Create manufactured items and their inventory movement ledger.

Revision ID: 20260828_0002
Revises: 20260828_0001
Create Date: 2026-08-28
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260828_0002"
down_revision: str | None = "20260828_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "manufactured_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("is_product", sa.Boolean(), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("image", sa.Text(), nullable=True),
        sa.Column("active_process_id", postgresql.UUID(as_uuid=True), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_manufactured_items")),
    )
    op.create_index(
        "ix_manufactured_items_archived",
        "manufactured_items",
        ["archived"],
        unique=False,
    )
    op.create_index(
        "ix_manufactured_items_is_product",
        "manufactured_items",
        ["is_product"],
        unique=False,
    )
    op.create_index(
        "ix_manufactured_items_name_lower",
        "manufactured_items",
        [sa.literal_column("lower(name)")],
        unique=True,
    )

    op.create_table(
        "manufactured_item_movements",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "manufactured_item_id", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column("movement_type", sa.String(length=24), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=20, scale=6), nullable=False),
        sa.Column(
            "balance_before", sa.Numeric(precision=20, scale=6), nullable=False
        ),
        sa.Column(
            "balance_after", sa.Numeric(precision=20, scale=6), nullable=False
        ),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("source_type", sa.String(length=64), nullable=True),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "balance_after >= 0",
            name=op.f(
                "ck_manufactured_item_movements_balance_after_non_negative"
            ),
        ),
        sa.CheckConstraint(
            "balance_before >= 0",
            name=op.f(
                "ck_manufactured_item_movements_balance_before_non_negative"
            ),
        ),
        sa.CheckConstraint(
            "movement_type IN ('receipt', 'consumption', 'production', 'sale', 'adjustment', 'write_off')",
            name=op.f("ck_manufactured_item_movements_movement_type_valid"),
        ),
        sa.CheckConstraint(
            "quantity <> 0",
            name=op.f("ck_manufactured_item_movements_quantity_non_zero"),
        ),
        sa.ForeignKeyConstraint(
            ["manufactured_item_id"],
            ["manufactured_items.id"],
            name="fk_manufactured_movements_item",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint(
            "id", name=op.f("pk_manufactured_item_movements")
        ),
    )
    op.create_index(
        "ix_manufactured_item_movements_item_created",
        "manufactured_item_movements",
        ["manufactured_item_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_manufactured_item_movements_type",
        "manufactured_item_movements",
        ["movement_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_manufactured_item_movements_type",
        table_name="manufactured_item_movements",
    )
    op.drop_index(
        "ix_manufactured_item_movements_item_created",
        table_name="manufactured_item_movements",
    )
    op.drop_table("manufactured_item_movements")
    op.drop_index(
        "ix_manufactured_items_name_lower", table_name="manufactured_items"
    )
    op.drop_index(
        "ix_manufactured_items_is_product", table_name="manufactured_items"
    )
    op.drop_index("ix_manufactured_items_archived", table_name="manufactured_items")
    op.drop_table("manufactured_items")
