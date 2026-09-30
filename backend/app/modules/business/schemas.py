import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.types import Money, Quantity
from app.modules.finance.funding import FundingWrite


class FundingSourceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Укажите название")
        return value.strip()


class FundingSourceRead(FundingSourceCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    archived: bool = False


class ReceiptLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    material_id: uuid.UUID
    quantity: Quantity = Field(gt=0)
    unit_price: Money | None = None


class ReceiptCreate(FundingWrite):
    total_amount: Money | None = None
    funding_source_id: uuid.UUID
    occurred_at: datetime
    comment: str = Field(default="", max_length=2000)
    entries: list[ReceiptLine] = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def unique_materials(self) -> "ReceiptCreate":
        if self.total_amount is None and any(line.unit_price is None for line in self.entries):
            raise ValueError("Укажите сумму за приход")
        ids = [line.material_id for line in self.entries]
        if len(ids) != len(set(ids)):
            raise ValueError("Материалы не должны повторяться")
        return self


class RepairMaterial(BaseModel):
    material_id: uuid.UUID
    quantity: Quantity = Field(gt=0)


class RepairOperation(BaseModel):
    operation_id: uuid.UUID
    quantity: Quantity = Field(gt=0)


class RepairCreate(FundingWrite):
    funding_source_id: uuid.UUID
    occurred_at: datetime
    serial_number: str = Field(min_length=1, max_length=200)
    replacement_serial_number: str | None = Field(default=None, max_length=200)
    comment: str = Field(min_length=1, max_length=2000)
    copied_from_id: uuid.UUID | None = None
    materials: list[RepairMaterial] = Field(min_length=1, max_length=2000)
    operations: list[RepairOperation] = Field(min_length=1, max_length=1000)
    service_cost: Money = Field(default=Decimal("0"), ge=0)

    @field_validator("serial_number", "comment", "replacement_serial_number")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Поле не должно быть пустым")
        return value.strip() if value is not None else None

    @model_validator(mode="after")
    def unique_lines(self) -> "RepairCreate":
        if self.replacement_serial_number == self.serial_number:
            raise ValueError("Номер подменного изделия должен отличаться от ремонтируемого")
        for ids in (
            [line.material_id for line in self.materials],
            [line.operation_id for line in self.operations],
        ):
            if len(ids) != len(set(ids)):
                raise ValueError("Строки не должны повторяться")
        return self
