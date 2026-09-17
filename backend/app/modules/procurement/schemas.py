import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.core.types import Money, Quantity


class ProcurementItemRead(BaseModel):
    material_id: uuid.UUID
    name: str
    unit: str
    required_quantity: Quantity
    stock_quantity: Quantity
    purchase_quantity: Quantity
    unit_price: Money | None
    estimated_cost: Money | None
    target_date: date | None
    active_plans: int
    url: str | None
    archived: bool


class ProcurementList(BaseModel):
    items: list[ProcurementItemRead]
    page: int
    page_size: int
    total: int
    pages: int
    known_cost: Money
    unpriced_positions: int
    generated_at: datetime
