import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.types import Money, Quantity
from app.modules.finance.funding import FundingWrite


class ProviderWrite(BaseModel):
    name: str = Field(min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Укажите название исполнителя")
        return value.strip()


class ProviderRead(ProviderWrite):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class ExternalMaterial(BaseModel):
    material_id: uuid.UUID
    quantity: Quantity = Field(gt=0)


class OfferWrite(BaseModel):
    provider_id: uuid.UUID
    item_id: uuid.UUID
    money_cost: Money = Field(default=Decimal("0"), ge=0)
    materials: list[ExternalMaterial] = Field(default_factory=list, max_length=1000)
    active: bool = True

    @model_validator(mode="after")
    def unique_materials(self) -> "OfferWrite":
        ids = [line.material_id for line in self.materials]
        if len(set(ids)) != len(ids):
            raise ValueError("Материалы не должны повторяться")
        return self


class OfferRead(OfferWrite):
    id: uuid.UUID
    operation_id: uuid.UUID
    provider_name: str
    item_name: str
    unit: str


class ExternalReceiptCreate(FundingWrite):
    offer_id: uuid.UUID
    quantity: Quantity = Field(gt=0)
    funding_source_id: uuid.UUID
    occurred_at: datetime
    comment: str = Field(default="", max_length=2000)
