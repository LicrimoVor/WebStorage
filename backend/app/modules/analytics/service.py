from datetime import UTC, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainValidationError
from app.modules.analytics import repository
from app.modules.analytics.schemas import (
    AnalyticsBucket,
    AnalyticsDashboardRead,
    AnalyticsPeriodRead,
    DemandedMaterialRow,
    EmployeeAnalyticsRow,
    OperationAnalyticsRow,
    PersonnelAnalytics,
    ProductionAnalytics,
    ProductionPoint,
    ProductSalesRow,
    SalesAnalytics,
    SalesPoint,
    StockPoint,
    WarehouseAnalytics,
)

MONEY_STEP = Decimal("0.01")
QUANTITY_STEP = Decimal("0.000001")
PERCENT_STEP = Decimal("0.01")
MAX_PERIOD = timedelta(days=3660)


def utc_timestamp(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def decimal(value: Any | None) -> Decimal:
    return Decimal(value or 0)


def money(value: object | None) -> Decimal:
    return decimal(value).quantize(MONEY_STEP, rounding=ROUND_HALF_UP)


def quantity(value: object | None) -> Decimal:
    return decimal(value).quantize(QUANTITY_STEP, rounding=ROUND_HALF_UP)


def hours(minutes: object | None) -> Decimal:
    return quantity(decimal(minutes) / Decimal("60"))


async def get_dashboard(
    session: AsyncSession,
    *,
    date_from: datetime,
    date_to: datetime,
    bucket: AnalyticsBucket,
) -> AnalyticsDashboardRead:
    date_from = utc_timestamp(date_from)
    date_to = utc_timestamp(date_to)
    if date_from > date_to:
        raise DomainValidationError("date_from must not be after date_to")
    if date_to - date_from > MAX_PERIOD:
        raise DomainValidationError("analytics period must not exceed 10 years")

    production = await repository.production_overview(
        session, date_from=date_from, date_to=date_to
    )
    production_points = await repository.production_dynamics(
        session, date_from=date_from, date_to=date_to, bucket=bucket.value
    )
    sales = await repository.sales_overview(
        session, date_from=date_from, date_to=date_to
    )
    sales_points = await repository.sales_dynamics(
        session, date_from=date_from, date_to=date_to, bucket=bucket.value
    )
    product_rows = await repository.sales_by_product(
        session, date_from=date_from, date_to=date_to
    )
    warehouse = await repository.warehouse_overview(
        session, date_from=date_from, date_to=date_to
    )
    demanded_rows = await repository.demanded_materials(
        session, date_from=date_from, date_to=date_to
    )
    stock_points = await repository.stock_dynamics(
        session, date_from=date_from, date_to=date_to, bucket=bucket.value
    )
    personnel = await repository.personnel_overview(
        session, date_from=date_from, date_to=date_to
    )
    employee_rows = await repository.personnel_by_employee(
        session, date_from=date_from, date_to=date_to
    )
    operation_rows = await repository.personnel_by_operation(
        session, date_from=date_from, date_to=date_to
    )

    return AnalyticsDashboardRead(
        period=AnalyticsPeriodRead(
            date_from=date_from, date_to=date_to, bucket=bucket
        ),
        production=ProductionAnalytics(
            produced_products=quantity(production["products"]),
            produced_semi_finished=quantity(production["semi"]),
            production_records=int(production["records"]),
            plans=int(production["plans"]),
            completed_plans=int(production["completed_plans"]),
            plan_completion_percent=decimal(
                production["completion_percent"]
            ).quantize(PERCENT_STEP, rounding=ROUND_HALF_UP),
            completed_operations=quantity(production["operations"]),
            person_hours=hours(production["minutes"]),
            dynamics=[
                ProductionPoint(
                    period_start=row["period_start"],
                    products_quantity=quantity(row["products"]),
                    semi_finished_quantity=quantity(row["semi"]),
                )
                for row in production_points
            ],
        ),
        sales=SalesAnalytics(
            sold_quantity=quantity(sales["quantity"]),
            revenue=money(sales["revenue"]),
            average_unit_price=money(sales["average_price"]),
            current_product_stock=quantity(sales["current_stock"]),
            dynamics=[
                SalesPoint(
                    period_start=row["period_start"],
                    quantity=quantity(row["quantity"]),
                    revenue=money(row["revenue"]),
                )
                for row in sales_points
            ],
            by_product=[
                ProductSalesRow(
                    product_id=row["product_id"],
                    name=row["name"],
                    unit=row["unit"],
                    quantity=quantity(row["quantity"]),
                    revenue=money(row["revenue"]),
                    current_stock=quantity(row["current_stock"]),
                )
                for row in product_rows
            ],
        ),
        warehouse=WarehouseAnalytics(
            current_material_stock_value=money(warehouse["stock_value"]),
            unpriced_material_positions=int(warehouse["unpriced"]),
            material_deficit_positions=int(warehouse["deficit_positions"]),
            material_deficit_quantity=quantity(warehouse["deficit_quantity"]),
            material_movements=int(warehouse["material_movements"]),
            material_inflow=quantity(warehouse["material_inflow"]),
            material_outflow=quantity(warehouse["material_outflow"]),
            semi_finished_movements=int(warehouse["semi_movements"]),
            semi_finished_inflow=quantity(warehouse["semi_inflow"]),
            semi_finished_outflow=quantity(warehouse["semi_outflow"]),
            demanded_materials=[
                DemandedMaterialRow(
                    material_id=row["material_id"],
                    name=row["name"],
                    unit=row["unit"],
                    consumed_quantity=quantity(row["consumed"]),
                )
                for row in demanded_rows
            ],
            dynamics=[
                StockPoint(
                    period_start=row["period_start"],
                    materials_delta=quantity(row["materials"]),
                    semi_finished_delta=quantity(row["semi"]),
                    products_delta=quantity(row["products"]),
                )
                for row in stock_points
            ],
        ),
        personnel=PersonnelAnalytics(
            accrued=money(personnel["accrued"]),
            paid=money(personnel["paid"]),
            payable_current=money(personnel["payable"]),
            completed_operations=quantity(personnel["operations"]),
            person_hours=hours(personnel["minutes"]),
            by_employee=[
                EmployeeAnalyticsRow(
                    employee_id=row["employee_id"],
                    full_name=row["full_name"],
                    accrued=money(row["accrued"]),
                    paid=money(row["paid"]),
                    payable_current=money(row["payable"]),
                    completed_operations=quantity(row["operations"]),
                    person_hours=hours(row["minutes"]),
                )
                for row in employee_rows
            ],
            by_operation=[
                OperationAnalyticsRow(
                    operation_id=row["operation_id"],
                    name=row["name"],
                    completed_operations=quantity(row["operations"]),
                    person_hours=hours(row["minutes"]),
                    accrued=money(row["accrued"]),
                )
                for row in operation_rows
            ],
        ),
    )
