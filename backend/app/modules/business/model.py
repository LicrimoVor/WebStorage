import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin


class FundingSource(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "funding_sources"
    __table_args__ = (
        Index("ux_funding_sources_name_lower", func.lower(text("name")), unique=True),
    )
    name: Mapped[str] = mapped_column(String(200), unique=True)


class BusinessDocument(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "business_documents"
    kind: Mapped[str] = mapped_column(String(24), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(100), unique=True)
    fingerprint: Mapped[str] = mapped_column(String(64))
    funding_source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("funding_sources.id"))
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_by: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProductUnit(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "product_units"
    serial_number: Mapped[str] = mapped_column(String(200), unique=True)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("manufactured_items.id"))
    production_record_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("production_records.id"))
    photo: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    sale_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sales.id"), nullable=True)
    issued_for_repair_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("business_documents.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
