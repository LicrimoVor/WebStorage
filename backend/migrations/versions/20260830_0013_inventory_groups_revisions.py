"""inventory groups and stock revisions

Revision ID: 20260830_0013
Revises: 20260829_0012
Create Date: 2026-08-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260830_0013"
down_revision: str | None = "20260829_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "inventory_groups",
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inventory_groups")),
    )
    op.create_index(
        "ix_inventory_groups_name_lower",
        "inventory_groups",
        [sa.literal_column("lower(name)")],
        unique=True,
    )
    op.create_table(
        "inventory_group_materials",
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("material_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["inventory_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["material_id"], ["materials.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "material_id"),
    )
    op.create_index(
        "ix_inventory_group_materials_material",
        "inventory_group_materials",
        ["material_id"],
    )
    op.create_table(
        "inventory_group_manufactured_items",
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("manufactured_item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["inventory_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["manufactured_item_id"], ["manufactured_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("group_id", "manufactured_item_id"),
    )
    op.create_index(
        "ix_inventory_group_items_item",
        "inventory_group_manufactured_items",
        ["manufactured_item_id"],
    )
    op.create_table(
        "stock_revisions",
        sa.Column("created_by", sa.String(length=200), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_stock_revisions")),
    )
    op.create_index("ix_stock_revisions_created_at", "stock_revisions", ["created_at"])
    op.create_table(
        "stock_revision_entries",
        sa.Column("revision_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_type", sa.String(length=24), nullable=False),
        sa.Column("material_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("manufactured_item_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("balance_before", sa.Numeric(20, 6), nullable=False),
        sa.Column("counted_quantity", sa.Numeric(20, 6), nullable=False),
        sa.Column("adjustment", sa.Numeric(20, 6), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint(
            "entity_type IN ('material', 'semi_finished', 'product')",
            name=op.f("ck_stock_revision_entries_entity_type_valid"),
        ),
        sa.CheckConstraint(
            "counted_quantity >= 0",
            name=op.f("ck_stock_revision_entries_counted_quantity_non_negative"),
        ),
        sa.CheckConstraint(
            "balance_before >= 0",
            name=op.f("ck_stock_revision_entries_balance_before_non_negative"),
        ),
        sa.CheckConstraint(
            "(entity_type = 'material' AND material_id IS NOT NULL AND manufactured_item_id IS NULL) OR "
            "(entity_type IN ('semi_finished', 'product') AND material_id IS NULL AND manufactured_item_id IS NOT NULL)",
            name=op.f("ck_stock_revision_entries_entity_reference_valid"),
        ),
        sa.ForeignKeyConstraint(["revision_id"], ["stock_revisions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["material_id"], ["materials.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["manufactured_item_id"], ["manufactured_items.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_stock_revision_entries")),
    )
    op.create_index("ix_stock_revision_entries_revision", "stock_revision_entries", ["revision_id"])
    op.create_index(
        "ux_stock_revision_entries_material",
        "stock_revision_entries",
        ["revision_id", "material_id"],
        unique=True,
        postgresql_where=sa.text("material_id IS NOT NULL"),
    )
    op.create_index(
        "ux_stock_revision_entries_item",
        "stock_revision_entries",
        ["revision_id", "manufactured_item_id"],
        unique=True,
        postgresql_where=sa.text("manufactured_item_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_table("stock_revision_entries")
    op.drop_table("stock_revisions")
    op.drop_table("inventory_group_manufactured_items")
    op.drop_table("inventory_group_materials")
    op.drop_table("inventory_groups")
