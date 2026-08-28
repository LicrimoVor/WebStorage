import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field, field_validator

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
    production_plan_id: uuid.UUID
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
    created_at: datetime


class ProductionRecordList(BaseModel):
    items: list[ProductionRecordRead]
    page: int
    page_size: int
    total: int
    pages: int
