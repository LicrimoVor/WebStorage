import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Index, Numeric, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ExternalProvider(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "external_providers"
    __table_args__ = (
        Index("ux_external_providers_name_lower", func.lower(text("name")), unique=True),
    )
    name: Mapped[str] = mapped_column(String(200), unique=True)


class ExternalOffer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "external_offers"
    __table_args__ = (
        UniqueConstraint("provider_id", "item_id", name="uq_external_offers_provider_item"),
    )
    provider_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("external_providers.id", ondelete="RESTRICT")
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("manufactured_items.id", ondelete="RESTRICT")
    )
    operation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("operations.id", ondelete="RESTRICT"), unique=True
    )
    money_cost: Mapped[Decimal] = mapped_column(
        Numeric(20, 2), default=Decimal("0"), server_default="0"
    )
    materials: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default="[]"
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
