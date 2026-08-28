import uuid
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Index, Numeric, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Material(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "materials"
    __table_args__ = (
        CheckConstraint("price IS NULL OR price >= 0", name="price_non_negative"),
        Index("ix_materials_name_lower", func.lower(text("name")), unique=True),
        Index("ix_materials_archived", "archived"),
    )

    id: Mapped[uuid.UUID]
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    price: Mapped[Decimal | None] = mapped_column(Numeric(20, 2), nullable=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    image: Mapped[str | None] = mapped_column(Text, nullable=True)
    archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"), default=False
    )
