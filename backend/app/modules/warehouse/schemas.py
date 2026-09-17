import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.types import Quantity


class InventoryGroupSummary(BaseModel):
    parent_id: uuid.UUID | None = None
    id: uuid.UUID
    name: str


class InventoryGroupCreate(BaseModel):
    parent_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class InventoryGroupUpdate(InventoryGroupCreate):
    pass


class InventoryGroupRead(InventoryGroupSummary):
    model_config = ConfigDict(from_attributes=True)

    material_count: int = 0
    semi_finished_count: int = 0
    created_at: datetime
    updated_at: datetime


class StockRevisionEntityType(StrEnum):
    MATERIAL = "material"
    SEMI_FINISHED = "semi_finished"
    PRODUCT = "product"


class StockRevisionCatalogRef(BaseModel):
    id: uuid.UUID
    name: str


class StockRevisionRow(BaseModel):
    id: uuid.UUID
    type: StockRevisionEntityType
    name: str
    image: str | None
    unit: str
    products: list[StockRevisionCatalogRef] = Field(default_factory=list)
    groups: list[InventoryGroupSummary] = Field(default_factory=list)
    current_quantity: Quantity


class StockRevisionEntryCreate(BaseModel):
    id: uuid.UUID
    type: StockRevisionEntityType
    counted_quantity: Quantity = Field(ge=0)


class StockRevisionCreate(BaseModel):
    entries: list[StockRevisionEntryCreate] = Field(min_length=1, max_length=2000)
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("comment")
    @classmethod
    def clean_comment(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @model_validator(mode="after")
    def entries_are_unique(self) -> "StockRevisionCreate":
        keys = [(entry.type, entry.id) for entry in self.entries]
        if len(keys) != len(set(keys)):
            raise ValueError("revision entries must be unique")
        return self


class StockRevisionEntryRead(StockRevisionEntryCreate):
    balance_before: Quantity
    adjustment: Quantity


class StockRevisionRead(BaseModel):
    id: uuid.UUID
    created_by: str
    comment: str | None
    created_at: datetime
    entries: list[StockRevisionEntryRead]
