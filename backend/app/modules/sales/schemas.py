import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.types import Money, Quantity


class SaleSortField(StrEnum):
    SOLD_AT = "sold_at"
    PRODUCT = "product"
    QUANTITY = "quantity"
    TOTAL_AMOUNT = "total_amount"


class SaleCreate(BaseModel):
    product_id: uuid.UUID
    quantity: Quantity = Field(gt=0)
    unit_price: Money
    sold_at: datetime | None = None
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("comment")
    @classmethod
    def strip_comment(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class SaleRead(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_name: str
    product_unit: str
    quantity: Quantity
    unit_price: Money
    total_amount: Money
    sold_at: datetime
    comment: str | None
    inventory_movement_id: uuid.UUID
    balance_after: Quantity
    idempotency_key: str
    created_by: str
    created_at: datetime


class SaleList(BaseModel):
    items: list[SaleRead]
    page: int
    page_size: int
    total: int
    pages: int
    filtered_quantity: Quantity
    filtered_amount: Money


class SaleSummary(BaseModel):
    sales_count: int
    total_quantity: Quantity = Decimal("0")
    total_amount: Money = Decimal("0")
    average_unit_price: Money = Decimal("0")


class SalePeriod(BaseModel):
    date_from: datetime | None = None
    date_to: datetime | None = None

    @model_validator(mode="after")
    def validate_range(self) -> "SalePeriod":
        if self.date_from is not None and self.date_to is not None:
            if self.date_from > self.date_to:
                raise ValueError("date_from must not be after date_to")
        return self
