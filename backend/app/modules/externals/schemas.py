import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.types import Quantity
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
    process_id: uuid.UUID
    provider_id: uuid.UUID
    active: bool = True


class OfferRead(OfferWrite):
    id: uuid.UUID
    process_version_id: uuid.UUID | None
    process_name: str
    item_id: uuid.UUID
    money_cost: Decimal
    materials: list[ExternalMaterial]
    provider_name: str
    item_name: str
    unit: str


class ExternalReceiptCreate(FundingWrite):
    offer_id: uuid.UUID
    quantity: Quantity = Field(gt=0)
    funding_source_id: uuid.UUID
    occurred_at: datetime
    comment: str = Field(default="", max_length=2000)
