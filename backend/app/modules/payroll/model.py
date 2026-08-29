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
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin


class WorkEntry(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "work_entries"
    __table_args__ = (
        CheckConstraint(
            "input_mode IN ('quantity', 'time')", name="input_mode_valid"
        ),
        CheckConstraint("input_value > 0", name="input_value_positive"),
        CheckConstraint(
            "equivalent_quantity IS NULL OR equivalent_quantity > 0",
            name="equivalent_quantity_positive",
        ),
        CheckConstraint(
            "time_minutes IS NULL OR time_minutes > 0",
            name="time_minutes_positive",
        ),
        CheckConstraint(
            "time_norm_snapshot IS NULL OR time_norm_snapshot > 0",
            name="time_norm_snapshot_positive",
        ),
        CheckConstraint(
            "rate_snapshot IS NULL OR rate_snapshot >= 0",
            name="rate_snapshot_non_negative",
        ),
        CheckConstraint(
            "accrued_amount IS NULL OR accrued_amount >= 0",
            name="accrued_amount_non_negative",
        ),
        CheckConstraint(
            "compensation_type_snapshot IN ('piecework', 'hourly', 'anonymous')",
            name="compensation_type_snapshot_valid",
        ),
        CheckConstraint(
            "employee_id IS NOT NULL OR production_record_id IS NOT NULL",
            name="employee_or_production_present",
        ),
        Index("ix_work_entries_employee_performed", "employee_id", "performed_at"),
        Index("ix_work_entries_operation_performed", "operation_id", "performed_at"),
        Index("ix_work_entries_voided_at", "voided_at"),
        Index("ix_work_entries_performed_at", "performed_at"),
        Index("ix_work_entries_production_record", "production_record_id"),
    )

    id: Mapped[uuid.UUID]
    employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="RESTRICT"),
        nullable=True,
    )
    operation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("operations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    input_mode: Mapped[str] = mapped_column(String(20), nullable=False)
    compensation_type_snapshot: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="piecework", default="piecework"
    )
    input_value: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    equivalent_quantity: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 6), nullable=True
    )
    time_minutes: Mapped[Decimal | None] = mapped_column(Numeric(20, 6), nullable=True)
    time_norm_snapshot: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 6), nullable=True
    )
    rate_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(20, 2), nullable=True)
    accrued_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 2), nullable=True
    )
    performed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(200), nullable=False)
    production_record_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("production_records.id", ondelete="RESTRICT"),
        nullable=True,
    )
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class EmployeePayment(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "employee_payments"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint(
            "allocation_mode IN ('fifo', 'manual')", name="allocation_mode_valid"
        ),
        Index("ix_employee_payments_employee_paid", "employee_id", "paid_at"),
        Index("ix_employee_payments_paid_at", "paid_at"),
    )

    id: Mapped[uuid.UUID]
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="RESTRICT"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(20, 2), nullable=False)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(200), nullable=False)
    allocation_mode: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PaymentAllocation(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "payment_allocations"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        UniqueConstraint("payment_id", "work_entry_id"),
        Index("ix_payment_allocations_work_entry", "work_entry_id"),
    )

    id: Mapped[uuid.UUID]
    payment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employee_payments.id", ondelete="RESTRICT"),
        nullable=False,
    )
    work_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("work_entries.id", ondelete="RESTRICT"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(20, 2), nullable=False)
