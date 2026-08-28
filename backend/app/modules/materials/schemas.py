import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator

Quantity = Annotated[Decimal, Field(max_digits=20, decimal_places=6)]
Money = Annotated[Decimal, Field(max_digits=20, decimal_places=2, ge=0)]


class MaterialSortField(StrEnum):
    NAME = "name"
    FREE_QUANTITY = "free_quantity"
    PRICE = "price"
    CREATED_AT = "created_at"


class SortOrder(StrEnum):
    ASC = "asc"
    DESC = "desc"


class AvailabilityFilter(StrEnum):
    ALL = "all"
    IN_STOCK = "in_stock"
    OUT_OF_STOCK = "out_of_stock"


class MaterialCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    unit: str = Field(min_length=1, max_length=32)
    initial_quantity: Quantity = Field(default=Decimal("0"), ge=0)
    price: Money | None = None
    url: AnyHttpUrl | None = None
    image: AnyHttpUrl | None = None

    @field_validator("name", "unit")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class MaterialUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    unit: str | None = Field(default=None, min_length=1, max_length=32)
    price: Money | None = None
    url: AnyHttpUrl | None = None
    image: AnyHttpUrl | None = None

    @field_validator("name", "unit")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class MaterialRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    unit: str
    free_quantity: Quantity
    required_quantity: Quantity = Decimal("0")
    deficit_quantity: Quantity = Decimal("0")
    price: Money | None
    url: AnyHttpUrl | None
    image: AnyHttpUrl | None
    archived: bool
    created_at: datetime
    updated_at: datetime


class MaterialList(BaseModel):
    items: list[MaterialRead]
    page: int
    page_size: int
    total: int
    pages: int

