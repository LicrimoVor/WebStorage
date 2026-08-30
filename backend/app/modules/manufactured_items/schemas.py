import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator

from app.core.types import Quantity
from app.modules.warehouse.schemas import InventoryGroupSummary


class ManufacturedItemSortField(StrEnum):
    NAME = "name"
    FREE_QUANTITY = "free_quantity"
    CREATED_AT = "created_at"


class ManufacturedItemKind(StrEnum):
    ALL = "all"
    SEMI_FINISHED = "semi_finished"
    PRODUCT = "product"


class ManufacturedItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    is_product: bool
    unit: str = Field(min_length=1, max_length=32)
    initial_quantity: Quantity = Field(default=Decimal("0"), ge=0)
    image: AnyHttpUrl | None = None
    group_ids: list[uuid.UUID] = Field(default_factory=list)

    @field_validator("name", "unit")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class ManufacturedItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    is_product: bool | None = None
    unit: str | None = Field(default=None, min_length=1, max_length=32)
    image: AnyHttpUrl | None = None
    group_ids: list[uuid.UUID] | None = None

    @field_validator("name", "unit")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class ManufacturedItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    is_product: bool
    unit: str
    free_quantity: Quantity
    required_quantity: Quantity = Decimal("0")
    to_produce_quantity: Quantity = Decimal("0")
    image: AnyHttpUrl | None
    groups: list[InventoryGroupSummary] = Field(default_factory=list)
    active_process_id: uuid.UUID | None
    archived: bool
    created_at: datetime
    updated_at: datetime


class ManufacturedItemList(BaseModel):
    items: list[ManufacturedItemRead]
    page: int
    page_size: int
    total: int
    pages: int


class ManufacturedItemMovementRead(BaseModel):
    id: uuid.UUID
    manufactured_item_id: uuid.UUID
    movement_type: str
    quantity: Quantity
    balance_before: Quantity
    balance_after: Quantity
    comment: str | None
    source_type: str | None
    source_id: uuid.UUID | None
    production_record_id: uuid.UUID | None
    sale_id: uuid.UUID | None
    created_at: datetime


class ManufacturedItemMovementList(BaseModel):
    items: list[ManufacturedItemMovementRead]
    page: int
    page_size: int
    total: int
    pages: int
