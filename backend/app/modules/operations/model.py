import uuid
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Index, Numeric, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Operation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "operations"
    __table_args__ = (
        CheckConstraint("time_norm IS NULL OR time_norm > 0", name="time_norm_positive"),
        CheckConstraint(
            "price_per_operation IS NULL OR price_per_operation >= 0",
            name="price_per_operation_non_negative",
        ),
        Index("ix_operations_name_lower", func.lower(text("name")), unique=True),
        Index("ix_operations_archived", "archived"),
    )

    id: Mapped[uuid.UUID]
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    time_norm: Mapped[Decimal | None] = mapped_column(Numeric(20, 6), nullable=True)
    price_per_operation: Mapped[Decimal | None] = mapped_column(Numeric(20, 2), nullable=True)
    archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"), default=False
    )
