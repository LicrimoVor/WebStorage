import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, Field, field_validator

from app.modules.materials.schemas import Quantity


class ManualMovementType(StrEnum):
    RECEIPT = "receipt"
    CONSUMPTION = "consumption"
    ADJUSTMENT = "adjustment"
    WRITE_OFF = "write_off"


class InventoryMovementCreate(BaseModel):
    movement_type: ManualMovementType
    quantity: Quantity
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, value: Decimal, info: object) -> Decimal:
        if value == 0:
            raise ValueError("quantity must not be zero")
        return value

    def validate_semantics(self) -> None:
        if self.movement_type != ManualMovementType.ADJUSTMENT and self.quantity < 0:
            raise ValueError("quantity must be positive for this movement type")


class InventoryMovementRead(BaseModel):
    id: uuid.UUID
    material_id: uuid.UUID
    movement_type: str
    quantity: Quantity
    balance_before: Quantity
    balance_after: Quantity
    comment: str | None
    source_type: str | None
    source_id: uuid.UUID | None
    created_at: datetime


class InventoryMovementList(BaseModel):
    items: list[InventoryMovementRead]
    page: int
    page_size: int
    total: int
    pages: int

