import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin


class InventoryGroup(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "inventory_groups"
    __table_args__ = (
        Index("ix_inventory_groups_name_lower", func.lower(text("name")), unique=True),
    )

    id: Mapped[uuid.UUID]
    name: Mapped[str] = mapped_column(String(200), nullable=False)


class InventoryGroupMaterial(Base):
    __tablename__ = "inventory_group_materials"
    __table_args__ = (
        Index("ix_inventory_group_materials_material", "material_id"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_groups.id", ondelete="CASCADE"),
        primary_key=True,
    )
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("materials.id", ondelete="CASCADE"),
        primary_key=True,
    )


class InventoryGroupManufacturedItem(Base):
    __tablename__ = "inventory_group_manufactured_items"
    __table_args__ = (
        Index("ix_inventory_group_items_item", "manufactured_item_id"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory_groups.id", ondelete="CASCADE"),
        primary_key=True,
    )
    manufactured_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("manufactured_items.id", ondelete="CASCADE"),
        primary_key=True,
    )


class StockRevision(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "stock_revisions"
    __table_args__ = (Index("ix_stock_revisions_created_at", "created_at"),)

    id: Mapped[uuid.UUID]
    created_by: Mapped[str] = mapped_column(String(200), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class StockRevisionEntry(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "stock_revision_entries"
    __table_args__ = (
        CheckConstraint(
            "entity_type IN ('material', 'semi_finished', 'product')",
            name="entity_type_valid",
        ),
        CheckConstraint("counted_quantity >= 0", name="counted_quantity_non_negative"),
        CheckConstraint("balance_before >= 0", name="balance_before_non_negative"),
        CheckConstraint(
            "(entity_type = 'material' AND material_id IS NOT NULL "
            "AND manufactured_item_id IS NULL) OR "
            "(entity_type IN ('semi_finished', 'product') AND material_id IS NULL "
            "AND manufactured_item_id IS NOT NULL)",
            name="entity_reference_valid",
        ),
        Index("ix_stock_revision_entries_revision", "revision_id"),
        Index(
            "ux_stock_revision_entries_material",
            "revision_id",
            "material_id",
            unique=True,
            postgresql_where=text("material_id IS NOT NULL"),
        ),
        Index(
            "ux_stock_revision_entries_item",
            "revision_id",
            "manufactured_item_id",
            unique=True,
            postgresql_where=text("manufactured_item_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID]
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("stock_revisions.id", ondelete="CASCADE"),
        nullable=False,
    )
    entity_type: Mapped[str] = mapped_column(String(24), nullable=False)
    material_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("materials.id", ondelete="RESTRICT"), nullable=True
    )
    manufactured_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("manufactured_items.id", ondelete="RESTRICT"),
        nullable=True,
    )
    balance_before: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    counted_quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    adjustment: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
