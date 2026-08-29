import uuid
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Index, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Employee(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "employees"
    __table_args__ = (
        CheckConstraint(
            "(compensation_type = 'piecework' AND hourly_rate IS NULL) OR "
            "(compensation_type = 'hourly' AND hourly_rate > 0)",
            name="compensation_valid",
        ),
        Index("ix_employees_active", "active"),
    )

    id: Mapped[uuid.UUID]
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true"), default=True
    )
    compensation_type: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="piecework", default="piecework"
    )
    hourly_rate: Mapped[Decimal | None] = mapped_column(Numeric(20, 2), nullable=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
