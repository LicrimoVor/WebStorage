import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.types import Money, Quantity


class EmployeeSortField(StrEnum):
    FULL_NAME = "full_name"
    CREATED_AT = "created_at"


class EmployeeCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("full_name")
    @classmethod
    def strip_full_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("comment")
    @classmethod
    def strip_comment(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class EmployeeUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("full_name")
    @classmethod
    def strip_optional_full_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("comment")
    @classmethod
    def strip_optional_comment(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class EmployeeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    active: bool
    comment: str | None
    accrued_total: Money = Decimal("0")
    paid_total: Money = Decimal("0")
    payable_total: Money = Decimal("0")
    completed_operations: Quantity = Decimal("0")
    created_at: datetime
    updated_at: datetime


class EmployeeList(BaseModel):
    items: list[EmployeeRead]
    page: int
    page_size: int
    total: int
    pages: int
