import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.types import Quantity


class ProductionComponentKind(StrEnum):
    MATERIAL = "material"
    MANUFACTURED_ITEM = "manufactured_item"


class ProductionRecordCreate(BaseModel):
    item_id: uuid.UUID
    quantity: Quantity = Field(gt=0)
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("comment")
    @classmethod
    def clean_comment(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class ProductionComponentRead(BaseModel):
    kind: ProductionComponentKind
    entity_id: uuid.UUID
    name: str
    unit: str
    quantity: Quantity
    movement_id: uuid.UUID


class ProductionRecordRead(BaseModel):
    id: uuid.UUID
    production_plan_id: uuid.UUID | None
    item_id: uuid.UUID
    item_name: str
    item_unit: str
    quantity: Quantity
    process_version_id: uuid.UUID
    process_version_number: int
    idempotency_key: str
    created_by: str
    comment: str | None
    output_movement_id: uuid.UUID
    output_balance_after: Quantity
    components: list[ProductionComponentRead]
    work_entry_ids: list[uuid.UUID] = Field(default_factory=list)
    created_at: datetime


class ProductionRecordList(BaseModel):
    items: list[ProductionRecordRead]
    page: int
    page_size: int
    total: int
    pages: int


class DirectProductionPreviewRequest(BaseModel):
    quantity: Quantity = Field(gt=0)


class ProductionOperationAssignment(BaseModel):
    operation_id: uuid.UUID
    employee_id: uuid.UUID | None = None


class DirectProductionCreate(BaseModel):
    quantity: Quantity = Field(gt=0)
    operation_assignments: list[ProductionOperationAssignment] = Field(
        default_factory=list
    )
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("comment")
    @classmethod
    def clean_direct_comment(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @model_validator(mode="after")
    def unique_operations(self) -> "DirectProductionCreate":
        operation_ids = [item.operation_id for item in self.operation_assignments]
        if len(operation_ids) != len(set(operation_ids)):
            raise ValueError("operation assignments must be unique")
        return self


class DirectProductionMaterialRead(BaseModel):
    material_id: uuid.UUID
    name: str
    unit: str
    required_quantity: Quantity
    stock_used_quantity: Quantity
    deficit_quantity: Quantity


class DirectProductionOperationRead(BaseModel):
    operation_id: uuid.UUID
    name: str
    required_quantity: Quantity
    required_time_minutes: Quantity | None


class DirectProductionTreeRead(BaseModel):
    item_id: uuid.UUID
    name: str
    unit: str
    required_quantity: Quantity
    stock_used_quantity: Quantity
    to_produce_quantity: Quantity
    process_version_id: uuid.UUID | None
    process_version_number: int | None
    recipe_source: str | None
    children: list["DirectProductionTreeRead"] = Field(default_factory=list)


class DirectProductionPreviewRead(BaseModel):
    item_id: uuid.UUID
    item_name: str
    item_unit: str
    quantity: Quantity
    can_produce: bool
    tree: DirectProductionTreeRead
    materials: list[DirectProductionMaterialRead]
    operations: list[DirectProductionOperationRead]
