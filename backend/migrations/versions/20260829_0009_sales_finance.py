"""Add atomic sales, financial transactions and historical material prices.

Revision ID: 20260829_0009
Revises: 20260829_0008
Create Date: 2026-08-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260829_0009"
down_revision: str | None = "20260829_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sales",
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantity", sa.Numeric(20, 6), nullable=False),
        sa.Column("unit_price", sa.Numeric(20, 2), nullable=False),
        sa.Column("total_amount", sa.Numeric(20, 2), nullable=False),
        sa.Column("sold_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=100), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("created_by", sa.String(length=200), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint(
            "quantity > 0", name=op.f("ck_sales_quantity_positive")
        ),
        sa.CheckConstraint(
            "total_amount >= 0", name=op.f("ck_sales_total_amount_non_negative")
        ),
        sa.CheckConstraint(
            "unit_price >= 0", name=op.f("ck_sales_unit_price_non_negative")
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["manufactured_items.id"],
            name=op.f("fk_sales_product_id_manufactured_items"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sales")),
    )
    op.create_index("ix_sales_product_sold", "sales", ["product_id", "sold_at"])
    op.create_index("ix_sales_sold_at", "sales", ["sold_at"])
    op.create_index(
        "ux_sales_idempotency_key", "sales", ["idempotency_key"], unique=True
    )

    op.add_column(
        "manufactured_item_movements",
        sa.Column("sale_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_manufactured_item_movements_sale_id_sales"),
        "manufactured_item_movements",
        "sales",
        ["sale_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ux_manufactured_item_movements_sale",
        "manufactured_item_movements",
        ["sale_id"],
        unique=True,
    )

    op.add_column(
        "inventory_movements",
        sa.Column("unit_price_snapshot", sa.Numeric(20, 2), nullable=True),
    )
    op.add_column(
        "inventory_movements",
        sa.Column("total_amount_snapshot", sa.Numeric(20, 2), nullable=True),
    )
    op.create_check_constraint(
        op.f("ck_inventory_movements_unit_price_snapshot_non_negative"),
        "inventory_movements",
        "unit_price_snapshot IS NULL OR unit_price_snapshot >= 0",
    )
    op.create_check_constraint(
        op.f("ck_inventory_movements_total_amount_snapshot_non_negative"),
        "inventory_movements",
        "total_amount_snapshot IS NULL OR total_amount_snapshot >= 0",
    )

    op.create_table(
        "financial_transactions",
        sa.Column("transaction_type", sa.String(length=20), nullable=False),
        sa.Column("amount", sa.Numeric(20, 2), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("category", sa.String(length=200), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(length=200), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint(
            "amount > 0", name=op.f("ck_financial_transactions_amount_positive")
        ),
        sa.CheckConstraint(
            "transaction_type IN ('income', 'expense')",
            name=op.f("ck_financial_transactions_transaction_type_valid"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_financial_transactions")),
    )
    op.create_index(
        "ix_financial_transactions_occurred",
        "financial_transactions",
        ["occurred_at"],
    )
    op.create_index(
        "ix_financial_transactions_type_category",
        "financial_transactions",
        ["transaction_type", "category"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_financial_transactions_type_category",
        table_name="financial_transactions",
    )
    op.drop_index(
        "ix_financial_transactions_occurred", table_name="financial_transactions"
    )
    op.drop_table("financial_transactions")
    op.drop_constraint(
        op.f("ck_inventory_movements_total_amount_snapshot_non_negative"),
        "inventory_movements",
        type_="check",
    )
    op.drop_constraint(
        op.f("ck_inventory_movements_unit_price_snapshot_non_negative"),
        "inventory_movements",
        type_="check",
    )
    op.drop_column("inventory_movements", "total_amount_snapshot")
    op.drop_column("inventory_movements", "unit_price_snapshot")
    op.drop_index(
        "ux_manufactured_item_movements_sale",
        table_name="manufactured_item_movements",
    )
    op.drop_constraint(
        op.f("fk_manufactured_item_movements_sale_id_sales"),
        "manufactured_item_movements",
        type_="foreignkey",
    )
    op.drop_column("manufactured_item_movements", "sale_id")
    op.drop_index("ux_sales_idempotency_key", table_name="sales")
    op.drop_index("ix_sales_sold_at", table_name="sales")
    op.drop_index("ix_sales_product_sold", table_name="sales")
    op.drop_table("sales")
