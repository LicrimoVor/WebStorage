import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.types import Money


class FinancialDirection(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"


class FinanceSource(StrEnum):
    ALL = "all"
    MATERIAL = "material"
    LABOUR = "labour"
    SALE = "sale"
    MANUAL = "manual"
    REPAIR = "repair"


class FinancialTransactionCreate(BaseModel):
    funding_source_id: uuid.UUID
    transaction_type: FinancialDirection
    amount: Money = Field(gt=0)
    occurred_at: datetime | None = None
    category: str = Field(min_length=1, max_length=200)
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("category")
    @classmethod
    def strip_category(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("comment")
    @classmethod
    def strip_comment(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class FinancialTransactionRead(BaseModel):
    funding_source_id: uuid.UUID | None = None
    id: uuid.UUID
    transaction_type: FinancialDirection
    amount: Money
    occurred_at: datetime
    category: str
    comment: str | None
    created_by: str
    created_at: datetime


class FinanceEntryRead(BaseModel):
    funding_source_id: uuid.UUID | None = None
    id: uuid.UUID
    source_id: uuid.UUID
    source_type: FinanceSource
    direction: FinancialDirection
    category: str
    description: str
    amount: Money
    occurred_at: datetime
    comment: str | None
    created_by: str


class FinanceEntryList(BaseModel):
    items: list[FinanceEntryRead]
    page: int
    page_size: int
    total: int
    pages: int


class FinanceSummary(BaseModel):
    total_income: Money = Decimal("0")
    total_expense: Money = Decimal("0")
    balance: Decimal = Decimal("0")
    sales_income: Money = Decimal("0")
    material_expense: Money = Decimal("0")
    labour_expense: Money = Decimal("0")
    repair_expense: Money = Decimal("0")
    manual_income: Money = Decimal("0")
    manual_expense: Money = Decimal("0")
    incomplete_material_movements: int = 0


class FinancePeriod(BaseModel):
    date_from: datetime | None = None
    date_to: datetime | None = None

    @model_validator(mode="after")
    def validate_range(self) -> "FinancePeriod":
        if self.date_from is not None and self.date_to is not None:
            if self.date_from > self.date_to:
                raise ValueError("date_from must not be after date_to")
        return self
