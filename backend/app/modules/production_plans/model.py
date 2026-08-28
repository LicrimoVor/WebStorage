import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Numeric,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ProductionPlan(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "production_plans"
    __table_args__ = (
        CheckConstraint("planned_quantity > 0", name="planned_quantity_positive"),
        CheckConstraint("produced_quantity >= 0", name="produced_quantity_non_negative"),
        CheckConstraint(
            "produced_quantity <= planned_quantity",
            name="produced_quantity_not_above_planned",
        ),
        CheckConstraint(
            "status IN ('draft', 'active', 'completed', 'cancelled')",
            name="status_valid",
        ),
        Index("ix_production_plans_status_created", "status", "created_at"),
        Index("ix_production_plans_product", "product_id"),
    )

    id: Mapped[uuid.UUID]
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("manufactured_items.id", ondelete="RESTRICT"),
        nullable=False,
    )
    process_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("technological_process_versions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    planned_quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    produced_quantity: Mapped[Decimal] = mapped_column(
        Numeric(20, 6), nullable=False, server_default=text("0"), default=Decimal("0")
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'active'"), default="active"
    )
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_by: Mapped[str] = mapped_column(String(200), nullable=False)
    calculation_complete: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true"), default=True
    )
    missing_data: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb"), default=list
    )
    total_required_time_minutes: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 6), nullable=True
    )
    estimated_cost: Mapped[Decimal | None] = mapped_column(Numeric(20, 2), nullable=True)


class ProductionPlanMaterialRequirement(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "production_plan_material_requirements"
    __table_args__ = (
        CheckConstraint("required_quantity >= 0", name="required_non_negative"),
        CheckConstraint("stock_used_quantity >= 0", name="stock_non_negative"),
        CheckConstraint("deficit_quantity >= 0", name="deficit_non_negative"),
        Index("ix_plan_material_requirements_plan", "plan_id"),
        Index("ix_plan_material_requirements_material", "material_id"),
    )

    id: Mapped[uuid.UUID]
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("production_plans.id", ondelete="CASCADE")
    )
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("materials.id", ondelete="RESTRICT")
    )
    name_snapshot: Mapped[str] = mapped_column(String(200), nullable=False)
    unit_snapshot: Mapped[str] = mapped_column(String(32), nullable=False)
    required_quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    stock_used_quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    deficit_quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    unit_price_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(20, 2))
    cost: Mapped[Decimal | None] = mapped_column(Numeric(20, 2))


class ProductionPlanItemRequirement(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "production_plan_item_requirements"
    __table_args__ = (
        CheckConstraint("required_quantity >= 0", name="required_non_negative"),
        CheckConstraint("stock_used_quantity >= 0", name="stock_non_negative"),
        CheckConstraint("to_produce_quantity >= 0", name="produce_non_negative"),
        Index("ix_plan_item_requirements_plan", "plan_id"),
        Index("ix_plan_item_requirements_item", "manufactured_item_id"),
    )

    id: Mapped[uuid.UUID]
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("production_plans.id", ondelete="CASCADE")
    )
    manufactured_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("manufactured_items.id", ondelete="RESTRICT")
    )
    process_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("technological_process_versions.id", ondelete="RESTRICT"),
    )
    name_snapshot: Mapped[str] = mapped_column(String(200), nullable=False)
    unit_snapshot: Mapped[str] = mapped_column(String(32), nullable=False)
    required_quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    stock_used_quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    to_produce_quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    is_plan_output: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"), default=False
    )


class ProductionPlanOperationRequirement(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "production_plan_operation_requirements"
    __table_args__ = (
        CheckConstraint("required_quantity >= 0", name="required_non_negative"),
        Index("ix_plan_operation_requirements_plan", "plan_id"),
        Index("ix_plan_operation_requirements_operation", "operation_id"),
    )

    id: Mapped[uuid.UUID]
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("production_plans.id", ondelete="CASCADE")
    )
    operation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("operations.id", ondelete="RESTRICT")
    )
    name_snapshot: Mapped[str] = mapped_column(String(200), nullable=False)
    required_quantity: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    time_norm_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(20, 6))
    required_time_minutes: Mapped[Decimal | None] = mapped_column(Numeric(20, 6))
    price_snapshot: Mapped[Decimal | None] = mapped_column(Numeric(20, 2))
    cost: Mapped[Decimal | None] = mapped_column(Numeric(20, 2))
