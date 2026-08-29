import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel

from app.core.types import Money, Quantity


class AnalyticsBucket(StrEnum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


class AnalyticsPeriodRead(BaseModel):
    date_from: datetime
    date_to: datetime
    bucket: AnalyticsBucket


class ProductionPoint(BaseModel):
    period_start: datetime
    products_quantity: Quantity = Decimal("0")
    semi_finished_quantity: Quantity = Decimal("0")


class ProductionAnalytics(BaseModel):
    produced_products: Quantity = Decimal("0")
    produced_semi_finished: Quantity = Decimal("0")
    production_records: int = 0
    plans: int = 0
    completed_plans: int = 0
    plan_completion_percent: Decimal = Decimal("0")
    completed_operations: Quantity = Decimal("0")
    person_hours: Quantity = Decimal("0")
    dynamics: list[ProductionPoint]


class SalesPoint(BaseModel):
    period_start: datetime
    quantity: Quantity = Decimal("0")
    revenue: Money = Decimal("0")


class ProductSalesRow(BaseModel):
    product_id: uuid.UUID
    name: str
    unit: str
    quantity: Quantity = Decimal("0")
    revenue: Money = Decimal("0")
    current_stock: Quantity = Decimal("0")


class SalesAnalytics(BaseModel):
    sold_quantity: Quantity = Decimal("0")
    revenue: Money = Decimal("0")
    average_unit_price: Money = Decimal("0")
    current_product_stock: Quantity = Decimal("0")
    dynamics: list[SalesPoint]
    by_product: list[ProductSalesRow]


class DemandedMaterialRow(BaseModel):
    material_id: uuid.UUID
    name: str
    unit: str
    consumed_quantity: Quantity = Decimal("0")


class StockPoint(BaseModel):
    period_start: datetime
    materials_delta: Quantity = Decimal("0")
    semi_finished_delta: Quantity = Decimal("0")
    products_delta: Quantity = Decimal("0")


class WarehouseAnalytics(BaseModel):
    current_material_stock_value: Money = Decimal("0")
    unpriced_material_positions: int = 0
    material_deficit_positions: int = 0
    material_deficit_quantity: Quantity = Decimal("0")
    material_movements: int = 0
    material_inflow: Quantity = Decimal("0")
    material_outflow: Quantity = Decimal("0")
    semi_finished_movements: int = 0
    semi_finished_inflow: Quantity = Decimal("0")
    semi_finished_outflow: Quantity = Decimal("0")
    demanded_materials: list[DemandedMaterialRow]
    dynamics: list[StockPoint]


class EmployeeAnalyticsRow(BaseModel):
    employee_id: uuid.UUID
    full_name: str
    accrued: Money = Decimal("0")
    paid: Money = Decimal("0")
    payable_current: Money = Decimal("0")
    completed_operations: Quantity = Decimal("0")
    person_hours: Quantity = Decimal("0")


class OperationAnalyticsRow(BaseModel):
    operation_id: uuid.UUID
    name: str
    completed_operations: Quantity = Decimal("0")
    person_hours: Quantity = Decimal("0")
    accrued: Money = Decimal("0")


class PersonnelAnalytics(BaseModel):
    accrued: Money = Decimal("0")
    paid: Money = Decimal("0")
    payable_current: Money = Decimal("0")
    completed_operations: Quantity = Decimal("0")
    person_hours: Quantity = Decimal("0")
    by_employee: list[EmployeeAnalyticsRow]
    by_operation: list[OperationAnalyticsRow]


class AnalyticsDashboardRead(BaseModel):
    period: AnalyticsPeriodRead
    production: ProductionAnalytics
    sales: SalesAnalytics
    warehouse: WarehouseAnalytics
    personnel: PersonnelAnalytics
