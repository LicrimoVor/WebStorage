import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel

from app.core.query import AvailabilityFilter, SortOrder
from app.modules.finance.schemas import FinanceSource, FinancialDirection
from app.modules.manufactured_items.schemas import ManufacturedItemKind


class ExportDataset(StrEnum):
    MATERIALS = "materials"
    MANUFACTURED_ITEMS = "manufactured_items"
    INVENTORY_MOVEMENTS = "inventory_movements"
    OPERATIONS = "operations"
    WORK_ENTRIES = "work_entries"
    EMPLOYEES = "employees"
    PAYROLL_ACCRUALS = "payroll_accruals"
    EMPLOYEE_PAYMENTS = "employee_payments"
    PRODUCTION_PLANS = "production_plans"
    PRODUCTION_RECORDS = "production_records"
    SALES = "sales"
    FINANCE_ENTRIES = "finance_entries"
    ANALYTICS = "analytics"


class ExportFilters(BaseModel):
    search: str | None = None
    include_archived: bool = False
    include_voided: bool = False
    availability: AvailabilityFilter = AvailabilityFilter.ALL
    deficit_only: bool = False
    kind: ManufacturedItemKind = ManufacturedItemKind.ALL
    status: str | None = None
    movement_type: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    material_id: uuid.UUID | None = None
    product_id: uuid.UUID | None = None
    employee_id: uuid.UUID | None = None
    operation_id: uuid.UUID | None = None
    plan_id: uuid.UUID | None = None
    source: FinanceSource = FinanceSource.ALL
    direction: FinancialDirection | None = None
    sort_by: str | None = None
    sort_order: SortOrder = SortOrder.ASC
    ids: list[uuid.UUID] | None = None
