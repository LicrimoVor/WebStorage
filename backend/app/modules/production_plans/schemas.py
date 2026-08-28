import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, Field, model_validator

from app.core.types import Money, Quantity


class ProductionPlanStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ProductionPlanCreate(BaseModel):
    product_id: uuid.UUID
    planned_quantity: Quantity = Field(gt=0)
    target_date: date | None = None
    status: ProductionPlanStatus = ProductionPlanStatus.ACTIVE

    @model_validator(mode="after")
    def initial_status_is_open(self) -> "ProductionPlanCreate":
        if self.status not in {ProductionPlanStatus.DRAFT, ProductionPlanStatus.ACTIVE}:
            raise ValueError("a new plan must be draft or active")
        return self


class ProductionPlanUpdate(BaseModel):
    planned_quantity: Quantity | None = Field(default=None, gt=0)
    produced_quantity: Quantity | None = Field(default=None, ge=0)
    target_date: date | None = None
    status: ProductionPlanStatus | None = None


class ProductionPlanRecalculate(BaseModel):
    use_latest_process_version: bool = True


class PlanMaterialRequirementRead(BaseModel):
    material_id: uuid.UUID
    name: str
    unit: str
    required_quantity: Quantity
    stock_used_quantity: Quantity
    deficit_quantity: Quantity
    unit_price: Money | None
    cost: Money | None


class PlanItemRequirementRead(BaseModel):
    manufactured_item_id: uuid.UUID
    process_version_id: uuid.UUID | None
    name: str
    unit: str
    required_quantity: Quantity
    stock_used_quantity: Quantity
    to_produce_quantity: Quantity
    is_plan_output: bool


class PlanOperationRequirementRead(BaseModel):
    operation_id: uuid.UUID
    name: str
    required_quantity: Quantity
    time_norm: Quantity | None
    required_time_minutes: Quantity | None
    price: Money | None
    cost: Money | None


class ProductionPlanRead(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    product_unit: str
    process_version_id: uuid.UUID
    process_version_number: int
    planned_quantity: Quantity
    produced_quantity: Quantity
    remaining_quantity: Quantity
    status: ProductionPlanStatus
    target_date: date | None
    created_by: str
    calculation_complete: bool
    missing_data: list[str]
    total_required_time_minutes: Quantity | None
    total_required_hours: Quantity | None
    estimated_cost: Money | None
    materials: list[PlanMaterialRequirementRead]
    manufactured_items: list[PlanItemRequirementRead]
    operations: list[PlanOperationRequirementRead]
    created_at: datetime
    updated_at: datetime


class ProductionPlanList(BaseModel):
    items: list[ProductionPlanRead]
    page: int
    page_size: int
    total: int
    pages: int


class ProductionPlanSummary(BaseModel):
    active_plans: int
    products_to_produce: Quantity = Decimal("0")
    material_positions: int
    material_deficit_positions: int
    total_required_hours: Quantity | None
    estimated_cost: Money | None
    calculation_complete: bool
