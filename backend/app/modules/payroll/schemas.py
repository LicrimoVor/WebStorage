import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.types import Money, Quantity


class WorkInputMode(StrEnum):
    QUANTITY = "quantity"
    TIME = "time"


class WorkEntryCreate(BaseModel):
    employee_id: uuid.UUID
    input_mode: WorkInputMode
    input_value: Quantity = Field(gt=0)
    performed_at: datetime | None = None
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("comment")
    @classmethod
    def strip_comment(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class WorkEntryUpdate(BaseModel):
    employee_id: uuid.UUID | None = None
    input_mode: WorkInputMode | None = None
    input_value: Quantity | None = Field(default=None, gt=0)
    performed_at: datetime | None = None
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("comment")
    @classmethod
    def strip_comment(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @model_validator(mode="after")
    def require_changes(self) -> "WorkEntryUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one field must be supplied")
        return self


class WorkEntryVoid(BaseModel):
    reason: str | None = Field(default=None, max_length=2000)

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class WorkEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    employee_name: str
    operation_id: uuid.UUID
    operation_name: str
    input_mode: WorkInputMode
    input_value: Quantity
    equivalent_quantity: Quantity | None
    time_minutes: Quantity | None
    time_norm_snapshot: Quantity | None
    rate_snapshot: Money | None
    accrued_amount: Money | None
    paid_amount: Money = Decimal("0")
    payable_amount: Money = Decimal("0")
    calculation_message: str | None = None
    performed_at: datetime
    comment: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime
    voided_at: datetime | None
    voided_by: str | None
    void_reason: str | None


class WorkEntryList(BaseModel):
    items: list[WorkEntryRead]
    page: int
    page_size: int
    total: int
    pages: int


class PaymentAllocationCreate(BaseModel):
    work_entry_id: uuid.UUID
    amount: Money = Field(gt=0)


class PaymentCreate(BaseModel):
    amount: Money = Field(gt=0)
    paid_at: datetime | None = None
    comment: str | None = Field(default=None, max_length=2000)
    allocations: list[PaymentAllocationCreate] | None = None

    @field_validator("comment")
    @classmethod
    def strip_comment(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @model_validator(mode="after")
    def validate_allocations(self) -> "PaymentCreate":
        if self.allocations is not None:
            identifiers = [item.work_entry_id for item in self.allocations]
            if len(identifiers) != len(set(identifiers)):
                raise ValueError("allocation work_entry_id values must be unique")
            allocated = sum((item.amount for item in self.allocations), Decimal("0"))
            if allocated != self.amount:
                raise ValueError("manual allocations must equal the payment amount")
        return self


class PaymentAllocationRead(BaseModel):
    work_entry_id: uuid.UUID
    operation_id: uuid.UUID
    operation_name: str
    performed_at: datetime
    amount: Money


class PaymentRead(BaseModel):
    id: uuid.UUID
    employee_id: uuid.UUID
    employee_name: str
    amount: Money
    paid_at: datetime
    comment: str | None
    created_by: str
    created_at: datetime
    allocation_mode: str
    allocations: list[PaymentAllocationRead]


class PaymentList(BaseModel):
    items: list[PaymentRead]
    page: int
    page_size: int
    total: int
    pages: int


class EmployeeOperationSummary(BaseModel):
    operation_id: uuid.UUID
    operation_name: str
    completed_quantity: Quantity
    time_minutes: Quantity
    accrued_amount: Money
    paid_amount: Money
    payable_amount: Money


class EmployeePayrollSummary(BaseModel):
    employee_id: uuid.UUID
    accrued_total: Money
    paid_total: Money
    payable_total: Money
    completed_operations: Quantity
    operations: list[EmployeeOperationSummary]
