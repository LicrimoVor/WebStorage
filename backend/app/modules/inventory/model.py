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
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDPrimaryKeyMixin


class InventoryMovement(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "inventory_movements"
    __table_args__ = (
        CheckConstraint("quantity <> 0", name="quantity_non_zero"),
        CheckConstraint("balance_before >= 0", name="balance_before_non_negative"),
        CheckConstraint("balance_after >= 0", name="balance_after_non_negative"),
        CheckConstraint(
            "movement_type IN ('receipt', 'consumption', 'production', "
            "'sale', 'adjustment', 'write_off')",
            name="movement_type_valid",
        ),
        Index("ix_inventory_movements_material_created", "material_id", "created_at"),
        Index("ix_inventory_movements_type", "movement_type"),
        Index("ix_inventory_movements_production_record", "production_record_id"),
    )

    id: Mapped[uuid.UUID]
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("materials.id", ondelete="RESTRICT"),
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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
