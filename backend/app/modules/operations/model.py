import uuid
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Index, Numeric, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin


class OperationGroup(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "operation_groups"
    __table_args__ = (
        Index("ux_operation_groups_root_name", func.lower(text("name")), unique=True,
              postgresql_where=text("parent_id IS NULL")),
        Index("ux_operation_groups_child_name", "parent_id", func.lower(text("name")),
              unique=True, postgresql_where=text("parent_id IS NOT NULL")),
    )
    name: Mapped[str] = mapped_column(String(200))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("operation_groups.id", ondelete="RESTRICT"), nullable=True,
    )


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
    group_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("operation_groups.id", ondelete="SET NULL"), index=True
    )
    time_norm: Mapped[Decimal | None] = mapped_column(Numeric(20, 6), nullable=True)
    price_per_operation: Mapped[Decimal | None] = mapped_column(Numeric(20, 2), nullable=True)
    archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"), default=False
    )
