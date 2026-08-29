import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDPrimaryKeyMixin


class ProductionRecord(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "production_records"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        Index("ux_production_records_idempotency_key", "idempotency_key", unique=True),
        Index("ix_production_records_plan_created", "production_plan_id", "created_at"),
        Index("ix_production_records_item_created", "item_id", "created_at"),
        Index("ix_production_records_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID]
    production_plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("production_plans.id", ondelete="RESTRICT")
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("manufactured_items.id", ondelete="RESTRICT")
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    process_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("technological_process_versions.id", ondelete="RESTRICT"),
    )
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    created_by: Mapped[str] = mapped_column(String(200), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
