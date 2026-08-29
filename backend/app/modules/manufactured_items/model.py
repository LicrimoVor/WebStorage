import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
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


class ManufacturedItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "manufactured_items"
    __table_args__ = (
        Index("ix_manufactured_items_name_lower", func.lower(text("name")), unique=True),
        Index("ix_manufactured_items_archived", "archived"),
        Index("ix_manufactured_items_is_product", "is_product"),
    )

    id: Mapped[uuid.UUID]
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_product: Mapped[bool] = mapped_column(Boolean, nullable=False)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    image: Mapped[str | None] = mapped_column(Text, nullable=True)
    active_process_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "technological_process_versions.id",
            name="fk_manufactured_items_active_process",
            ondelete="RESTRICT",
            use_alter=True,
        ),
        nullable=True,
    )
    archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"), default=False
    )


class ManufacturedItemMovement(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "manufactured_item_movements"
    __table_args__ = (
        CheckConstraint("quantity <> 0", name="quantity_non_zero"),
        CheckConstraint("balance_before >= 0", name="balance_before_non_negative"),
        CheckConstraint("balance_after >= 0", name="balance_after_non_negative"),
        CheckConstraint(
            "movement_type IN ('receipt', 'consumption', 'production', "
            "'sale', 'adjustment', 'write_off')",
            name="movement_type_valid",
        ),
        Index(
            "ix_manufactured_item_movements_item_created",
            "manufactured_item_id",
            "created_at",
        ),
        Index("ix_manufactured_item_movements_type", "movement_type"),
        Index(
            "ix_manufactured_item_movements_production_record",
            "production_record_id",
        ),
        Index("ux_manufactured_item_movements_sale", "sale_id", unique=True),
    )

    id: Mapped[uuid.UUID]
    manufactured_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "manufactured_items.id",
            name="fk_manufactured_movements_item",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )
    movement_type: Mapped[str] = mapped_column(String(24), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    balance_before: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    production_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("production_records.id", ondelete="RESTRICT"),
        nullable=True,
    )
    sale_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sales.id", ondelete="RESTRICT"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
