import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.types import Money, Quantity

TimeNorm = Annotated[Decimal, Field(max_digits=20, decimal_places=6, gt=0)]


class OperationSortField(StrEnum):
    NAME = "name"
    TIME_NORM = "time_norm"
    PRICE_PER_OPERATION = "price_per_operation"
    CREATED_AT = "created_at"


class OperationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    group_id: uuid.UUID | None = None
    time_norm: TimeNorm | None = None
    price_per_operation: Money | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class OperationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    group_id: uuid.UUID | None = None
    time_norm: TimeNorm | None = None
    price_per_operation: Money | None = None

    @field_validator("name")
    @classmethod
    def strip_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class OperationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    group_id: uuid.UUID | None = None
    time_norm: TimeNorm | None
    price_per_operation: Money | None
    required_quantity: Quantity = Decimal("0")
    completed_quantity: Quantity = Decimal("0")
    required_time_minutes: Quantity = Decimal("0")
    archived: bool
    created_at: datetime
    updated_at: datetime


class OperationList(BaseModel):
    items: list[OperationRead]
    page: int
    page_size: int
    total: int
    pages: int


class OperationGroupWrite(BaseModel):
    parent_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return OperationCreate.strip_name(value)


class OperationGroupRead(OperationGroupWrite):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
