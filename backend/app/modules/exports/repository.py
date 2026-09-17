from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import Select, asc, case, desc, func, literal, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainValidationError
from app.core.query import AvailabilityFilter, SortOrder
from app.modules.business.model import FundingSource
from app.modules.employees.model import Employee
from app.modules.exports.schemas import ExportDataset, ExportFilters
from app.modules.finance.repository import entry_union
from app.modules.finance.schemas import FinanceSource
from app.modules.inventory.model import InventoryMovement
from app.modules.manufactured_items import repository as manufactured_repository
from app.modules.manufactured_items.model import ManufacturedItem, ManufacturedItemMovement
from app.modules.manufactured_items.schemas import ManufacturedItemKind
from app.modules.materials import repository as material_repository
from app.modules.materials.model import Material
from app.modules.operations import repository as operation_repository
from app.modules.operations.model import Operation
from app.modules.payroll.model import EmployeePayment, PaymentAllocation, WorkEntry
from app.modules.production.model import ProductionRecord
from app.modules.production_plans.model import ProductionPlan
from app.modules.sales.model import Sale
from app.modules.technological_processes.model import TechnologicalProcessVersion

MAX_EXPORT_ROWS = 100_000


async def limited_rows(
    session: AsyncSession, statement: Select[Any]
) -> list[dict[str, Any]]:
    rows = list(
        (await session.execute(statement.limit(MAX_EXPORT_ROWS + 1))).mappings().all()
    )
    if len(rows) > MAX_EXPORT_ROWS:
        raise DomainValidationError(
            f"export contains more than {MAX_EXPORT_ROWS} rows; narrow the filters"
        )
    return [dict(row) for row in rows]


def direction(filters: ExportFilters) -> Any:
    return asc if filters.sort_order == SortOrder.ASC else desc


def apply_period(
    statement: Select[Any],
    column: Any,
    date_from: datetime | None,
    date_to: datetime | None,
) -> Select[Any]:
    if date_from is not None:
        statement = statement.where(column >= date_from)
    if date_to is not None:
        statement = statement.where(column <= date_to)
    return statement


def apply_ids(
    statement: Select[Any], column: Any, ids: list[Any] | None
) -> Select[Any]:
    return statement.where(column.in_(ids)) if ids else statement


async def materials(
    session: AsyncSession, filters: ExportFilters
) -> list[dict[str, Any]]:
    balance = material_repository.balance_expression().label("free_quantity")
    required = material_repository.required_expression().label("required_quantity")
    statement = select(
        Material.id.label("id"),
        Material.name.label("name"),
        Material.unit.label("unit"),
        balance,
        required,
        func.greatest(required - balance, Decimal("0")).label("deficit_quantity"),
        Material.price.label("price"),
        Material.url.label("url"),
        Material.archived.label("archived"),
        Material.created_at.label("created_at"),
    )
    if not filters.include_archived:
        statement = statement.where(Material.archived.is_(False))
    if filters.search:
        statement = statement.where(Material.name.ilike(f"%{filters.search.strip()}%"))
    if filters.availability == AvailabilityFilter.IN_STOCK:
        statement = statement.where(balance > 0)
    elif filters.availability == AvailabilityFilter.OUT_OF_STOCK:
        statement = statement.where(balance <= 0)
    if filters.deficit_only:
        statement = statement.where(required > balance)
    statement = apply_ids(statement, Material.id, filters.ids)
    order_columns = {
        "name": func.lower(Material.name),
        "free_quantity": balance,
        "price": Material.price,
        "created_at": Material.created_at,
    }
    order = order_columns.get(filters.sort_by or "name", func.lower(Material.name))
    statement = statement.order_by(direction(filters)(order).nulls_last(), Material.id)
    return await limited_rows(session, statement)


async def manufactured_items(
    session: AsyncSession, filters: ExportFilters
) -> list[dict[str, Any]]:
    balance = manufactured_repository.balance_expression().label("free_quantity")
    required = manufactured_repository.required_expression().label("required_quantity")
    statement = select(
        ManufacturedItem.id.label("id"),
        case(
            (ManufacturedItem.is_product.is_(True), "Продукт"),
            else_="Полуфабрикат",
        ).label("kind"),
        ManufacturedItem.name.label("name"),
        ManufacturedItem.unit.label("unit"),
        balance,
        required,
        func.greatest(required - balance, Decimal("0")).label("to_produce_quantity"),
        ManufacturedItem.archived.label("archived"),
        ManufacturedItem.created_at.label("created_at"),
    )
    if not filters.include_archived:
        statement = statement.where(ManufacturedItem.archived.is_(False))
    if filters.search:
        statement = statement.where(
            ManufacturedItem.name.ilike(f"%{filters.search.strip()}%")
        )
    if filters.kind == ManufacturedItemKind.PRODUCT:
        statement = statement.where(ManufacturedItem.is_product.is_(True))
    elif filters.kind == ManufacturedItemKind.SEMI_FINISHED:
        statement = statement.where(ManufacturedItem.is_product.is_(False))
    if filters.availability == AvailabilityFilter.IN_STOCK:
        statement = statement.where(balance > 0)
    elif filters.availability == AvailabilityFilter.OUT_OF_STOCK:
        statement = statement.where(balance <= 0)
    statement = apply_ids(statement, ManufacturedItem.id, filters.ids)
    order_columns = {
        "name": func.lower(ManufacturedItem.name),
        "free_quantity": balance,
        "created_at": ManufacturedItem.created_at,
    }
    order = order_columns.get(
        filters.sort_by or "name", func.lower(ManufacturedItem.name)
    )
    statement = statement.order_by(direction(filters)(order).nulls_last(), ManufacturedItem.id)
    return await limited_rows(session, statement)


async def inventory_movements(
    session: AsyncSession, filters: ExportFilters
) -> list[dict[str, Any]]:
    material_rows = (
        select(
            InventoryMovement.id.label("id"),
            InventoryMovement.material_id.label("entity_id"),
            literal("Материал").label("kind"),
            Material.name.label("name"),
            Material.unit.label("unit"),
            InventoryMovement.movement_type.label("movement_type"),
            InventoryMovement.quantity.label("quantity"),
            InventoryMovement.balance_before.label("balance_before"),
            InventoryMovement.balance_after.label("balance_after"),
            InventoryMovement.unit_price_snapshot.label("unit_price"),
            InventoryMovement.total_amount_snapshot.label("total_amount"),
            InventoryMovement.comment.label("comment"),
            InventoryMovement.created_at.label("created_at"),
        )
        .join(Material, Material.id == InventoryMovement.material_id)
    )
    manufactured_rows = (
        select(
            ManufacturedItemMovement.id.label("id"),
            ManufacturedItemMovement.manufactured_item_id.label("entity_id"),
            case(
                (ManufacturedItem.is_product.is_(True), "Продукт"),
                else_="Полуфабрикат",
            ).label("kind"),
            ManufacturedItem.name.label("name"),
            ManufacturedItem.unit.label("unit"),
            ManufacturedItemMovement.movement_type.label("movement_type"),
            ManufacturedItemMovement.quantity.label("quantity"),
            ManufacturedItemMovement.balance_before.label("balance_before"),
            ManufacturedItemMovement.balance_after.label("balance_after"),
            literal(None).label("unit_price"),
            literal(None).label("total_amount"),
            ManufacturedItemMovement.comment.label("comment"),
            ManufacturedItemMovement.created_at.label("created_at"),
        )
        .join(
            ManufacturedItem,
            ManufacturedItem.id == ManufacturedItemMovement.manufactured_item_id,
        )
    )
    movements = union_all(material_rows, manufactured_rows).subquery("export_movements")
    statement = select(movements)
    if filters.material_id is not None:
        statement = statement.where(
            movements.c.kind == "Материал",
            movements.c.entity_id == filters.material_id,
        )
    if filters.product_id is not None:
        statement = statement.where(
            movements.c.kind.in_(["Полуфабрикат", "Продукт"]),
            movements.c.entity_id == filters.product_id,
        )
    if filters.kind == ManufacturedItemKind.PRODUCT:
        statement = statement.where(movements.c.kind == "Продукт")
    elif filters.kind == ManufacturedItemKind.SEMI_FINISHED:
        statement = statement.where(movements.c.kind == "Полуфабрикат")
    if filters.movement_type:
        statement = statement.where(
            movements.c.movement_type == filters.movement_type
        )
    if filters.search:
        statement = statement.where(
            movements.c.name.ilike(f"%{filters.search.strip()}%")
        )
    statement = apply_period(
        statement, movements.c.created_at, filters.date_from, filters.date_to
    )
    statement = apply_ids(statement, movements.c.id, filters.ids)
    statement = statement.order_by(direction(filters)(movements.c.created_at), movements.c.id)
    return await limited_rows(session, statement)


async def operations(
    session: AsyncSession, filters: ExportFilters
) -> list[dict[str, Any]]:
    required = operation_repository.required_expression().label("required_quantity")
    required_time = operation_repository.required_time_expression().label(
        "required_time_minutes"
    )
    completed = operation_repository.completed_expression().label("completed_quantity")
    statement = select(
        Operation.id.label("id"),
        Operation.name.label("name"),
        Operation.time_norm.label("time_norm"),
        Operation.price_per_operation.label("price_per_operation"),
        required,
        required_time,
        completed,
        Operation.archived.label("archived"),
        Operation.created_at.label("created_at"),
    )
    if not filters.include_archived:
        statement = statement.where(Operation.archived.is_(False))
    if filters.search:
        statement = statement.where(Operation.name.ilike(f"%{filters.search.strip()}%"))
    statement = apply_ids(statement, Operation.id, filters.ids)
    order_columns = {
        "name": func.lower(Operation.name),
        "time_norm": Operation.time_norm,
        "price_per_operation": Operation.price_per_operation,
        "created_at": Operation.created_at,
    }
    order = order_columns.get(filters.sort_by or "name", func.lower(Operation.name))
    statement = statement.order_by(direction(filters)(order).nulls_last(), Operation.id)
    return await limited_rows(session, statement)


def work_entries_statement(filters: ExportFilters) -> Select[Any]:
    paid = (
        select(func.coalesce(func.sum(PaymentAllocation.amount), Decimal("0")))
        .where(PaymentAllocation.work_entry_id == WorkEntry.id)
        .correlate(WorkEntry)
        .scalar_subquery()
    )
    statement = (
        select(
            WorkEntry.id.label("id"),
            func.coalesce(Employee.full_name, "Анонимно").label("employee"),
            Operation.name.label("operation"),
            WorkEntry.input_mode.label("input_mode"),
            WorkEntry.input_value.label("input_value"),
            WorkEntry.equivalent_quantity.label("equivalent_quantity"),
            WorkEntry.time_minutes.label("time_minutes"),
            WorkEntry.rate_snapshot.label("rate"),
            WorkEntry.accrued_amount.label("accrued"),
            paid.label("paid"),
            func.greatest(
                func.coalesce(WorkEntry.accrued_amount, Decimal("0")) - paid,
                Decimal("0"),
            ).label("payable"),
            WorkEntry.performed_at.label("performed_at"),
            WorkEntry.comment.label("comment"),
            WorkEntry.voided_at.label("voided_at"),
        )
        .outerjoin(Employee, Employee.id == WorkEntry.employee_id)
        .join(Operation, Operation.id == WorkEntry.operation_id)
    )
    if filters.employee_id is not None:
        statement = statement.where(WorkEntry.employee_id == filters.employee_id)
    if filters.operation_id is not None:
        statement = statement.where(WorkEntry.operation_id == filters.operation_id)
    if not filters.include_voided:
        statement = statement.where(WorkEntry.voided_at.is_(None))
    if filters.search:
        search = f"%{filters.search.strip()}%"
        statement = statement.where(
            Employee.full_name.ilike(search) | Operation.name.ilike(search)
        )
    statement = apply_period(
        statement, WorkEntry.performed_at, filters.date_from, filters.date_to
    )
    statement = apply_ids(statement, WorkEntry.id, filters.ids)
    return statement.order_by(
        direction(filters)(WorkEntry.performed_at), WorkEntry.id
    )


async def work_entries(
    session: AsyncSession, filters: ExportFilters
) -> list[dict[str, Any]]:
    return await limited_rows(session, work_entries_statement(filters))


async def employees(
    session: AsyncSession, filters: ExportFilters
) -> list[dict[str, Any]]:
    accrued = (
        select(func.coalesce(func.sum(WorkEntry.accrued_amount), Decimal("0")))
        .where(
            WorkEntry.employee_id == Employee.id,
            WorkEntry.voided_at.is_(None),
        )
        .correlate(Employee)
        .scalar_subquery()
    )
    completed = (
        select(
            func.coalesce(func.sum(WorkEntry.equivalent_quantity), Decimal("0"))
        )
        .where(
            WorkEntry.employee_id == Employee.id,
            WorkEntry.voided_at.is_(None),
        )
        .correlate(Employee)
        .scalar_subquery()
    )
    paid = (
        select(func.coalesce(func.sum(PaymentAllocation.amount), Decimal("0")))
        .join(WorkEntry, WorkEntry.id == PaymentAllocation.work_entry_id)
        .where(WorkEntry.employee_id == Employee.id)
        .correlate(Employee)
        .scalar_subquery()
    )
    paid_equivalent = (
        select(
            func.coalesce(
                func.sum(
                    case(
                        (
                            WorkEntry.accrued_amount > 0,
                            func.coalesce(
                                WorkEntry.equivalent_quantity, Decimal("0")
                            )
                            * func.least(
                                func.coalesce(
                                    select(func.sum(PaymentAllocation.amount))
                                    .where(
                                        PaymentAllocation.work_entry_id == WorkEntry.id
                                    )
                                    .correlate(WorkEntry)
                                    .scalar_subquery(),
                                    Decimal("0"),
                                )
                                / WorkEntry.accrued_amount,
                                Decimal("1"),
                            ),
                        ),
                        else_=Decimal("0"),
                    )
                ),
                Decimal("0"),
            )
        )
        .where(
            WorkEntry.employee_id == Employee.id,
            WorkEntry.voided_at.is_(None),
        )
        .correlate(Employee)
        .scalar_subquery()
    )
    statement = select(
        Employee.id.label("id"),
        Employee.full_name.label("full_name"),
        Employee.active.label("active"),
        Employee.compensation_type.label("compensation_type"),
        Employee.hourly_rate.label("hourly_rate"),
        completed.label("completed_operations"),
        paid_equivalent.label("paid_operations_equivalent"),
        accrued.label("accrued"),
        paid.label("paid"),
        func.greatest(accrued - paid, Decimal("0")).label("payable"),
        Employee.comment.label("comment"),
        Employee.created_at.label("created_at"),
    )
    if not filters.include_archived:
        statement = statement.where(Employee.active.is_(True))
    if filters.search:
        statement = statement.where(
            Employee.full_name.ilike(f"%{filters.search.strip()}%")
        )
    statement = apply_ids(statement, Employee.id, filters.ids)
    order_columns = {
        "full_name": func.lower(Employee.full_name),
        "created_at": Employee.created_at,
    }
    order = order_columns.get(
        filters.sort_by or "full_name", func.lower(Employee.full_name)
    )
    statement = statement.order_by(direction(filters)(order), Employee.id)
    return await limited_rows(session, statement)


async def payments(
    session: AsyncSession, filters: ExportFilters
) -> list[dict[str, Any]]:
    statement = (
        select(
            EmployeePayment.id.label("id"),
            Employee.full_name.label("employee"),
            EmployeePayment.amount.label("amount"),
            EmployeePayment.paid_at.label("paid_at"),
            EmployeePayment.allocation_mode.label("allocation_mode"),
            EmployeePayment.comment.label("comment"),
            EmployeePayment.created_by.label("created_by"),
        )
        .join(Employee, Employee.id == EmployeePayment.employee_id)
    )
    if filters.employee_id is not None:
        statement = statement.where(EmployeePayment.employee_id == filters.employee_id)
    if filters.search:
        statement = statement.where(
            Employee.full_name.ilike(f"%{filters.search.strip()}%")
        )
    statement = apply_period(
        statement, EmployeePayment.paid_at, filters.date_from, filters.date_to
    )
    statement = apply_ids(statement, EmployeePayment.id, filters.ids)
    statement = statement.order_by(
        direction(filters)(EmployeePayment.paid_at), EmployeePayment.id
    )
    return await limited_rows(session, statement)


async def production_plans(
    session: AsyncSession, filters: ExportFilters
) -> list[dict[str, Any]]:
    statement = (
        select(
            ProductionPlan.id.label("id"),
            ManufacturedItem.name.label("product"),
            ManufacturedItem.unit.label("unit"),
            ProductionPlan.planned_quantity.label("planned_quantity"),
            ProductionPlan.produced_quantity.label("produced_quantity"),
            (
                ProductionPlan.planned_quantity - ProductionPlan.produced_quantity
            ).label("remaining_quantity"),
            ProductionPlan.status.label("status"),
            ProductionPlan.target_date.label("target_date"),
            ProductionPlan.total_required_time_minutes.label("required_minutes"),
            ProductionPlan.estimated_cost.label("estimated_cost"),
            ProductionPlan.calculation_complete.label("calculation_complete"),
            ProductionPlan.created_by.label("created_by"),
            ProductionPlan.created_at.label("created_at"),
        )
        .join(ManufacturedItem, ManufacturedItem.id == ProductionPlan.product_id)
    )
    if filters.status:
        statement = statement.where(ProductionPlan.status == filters.status)
    if filters.product_id is not None:
        statement = statement.where(ProductionPlan.product_id == filters.product_id)
    if filters.search:
        statement = statement.where(
            ManufacturedItem.name.ilike(f"%{filters.search.strip()}%")
        )
    statement = apply_period(
        statement, ProductionPlan.created_at, filters.date_from, filters.date_to
    )
    statement = apply_ids(statement, ProductionPlan.id, filters.ids)
    statement = statement.order_by(
        direction(filters)(ProductionPlan.created_at), ProductionPlan.id
    )
    return await limited_rows(session, statement)


async def production_records(
    session: AsyncSession, filters: ExportFilters
) -> list[dict[str, Any]]:
    output_item = ManufacturedItem.__table__.alias("output_item")
    plan_product = ManufacturedItem.__table__.alias("plan_product")
    statement = (
        select(
            ProductionRecord.id.label("id"),
            plan_product.c.name.label("plan_product"),
            output_item.c.name.label("produced_item"),
            output_item.c.unit.label("unit"),
            ProductionRecord.quantity.label("quantity"),
            TechnologicalProcessVersion.version_number.label("process_version"),
            ProductionRecord.comment.label("comment"),
            ProductionRecord.created_by.label("created_by"),
            ProductionRecord.created_at.label("created_at"),
        )
        .outerjoin(ProductionPlan, ProductionPlan.id == ProductionRecord.production_plan_id)
        .outerjoin(plan_product, plan_product.c.id == ProductionPlan.product_id)
        .join(output_item, output_item.c.id == ProductionRecord.item_id)
        .join(
            TechnologicalProcessVersion,
            TechnologicalProcessVersion.id == ProductionRecord.process_version_id,
        )
    )
    if filters.plan_id is not None:
        statement = statement.where(
            ProductionRecord.production_plan_id == filters.plan_id
        )
    if filters.product_id is not None:
        statement = statement.where(ProductionRecord.item_id == filters.product_id)
    if filters.search:
        search = f"%{filters.search.strip()}%"
        statement = statement.where(
            output_item.c.name.ilike(search) | plan_product.c.name.ilike(search)
        )
    statement = apply_period(
        statement, ProductionRecord.created_at, filters.date_from, filters.date_to
    )
    statement = apply_ids(statement, ProductionRecord.id, filters.ids)
    statement = statement.order_by(
        direction(filters)(ProductionRecord.created_at), ProductionRecord.id
    )
    return await limited_rows(session, statement)


async def sales(
    session: AsyncSession, filters: ExportFilters
) -> list[dict[str, Any]]:
    statement = (
        select(
            Sale.id.label("id"),
            ManufacturedItem.name.label("product"),
            ManufacturedItem.unit.label("unit"),
            Sale.quantity.label("quantity"),
            Sale.unit_price.label("unit_price"),
            Sale.total_amount.label("total_amount"),
            Sale.sold_at.label("sold_at"),
            Sale.comment.label("comment"),
            Sale.created_by.label("created_by"),
        )
        .join(ManufacturedItem, ManufacturedItem.id == Sale.product_id)
    )
    if filters.product_id is not None:
        statement = statement.where(Sale.product_id == filters.product_id)
    if filters.search:
        statement = statement.where(
            ManufacturedItem.name.ilike(f"%{filters.search.strip()}%")
        )
    statement = apply_period(statement, Sale.sold_at, filters.date_from, filters.date_to)
    statement = apply_ids(statement, Sale.id, filters.ids)
    order_columns = {
        "sold_at": Sale.sold_at,
        "product": func.lower(ManufacturedItem.name),
        "quantity": Sale.quantity,
        "total_amount": Sale.total_amount,
    }
    order = order_columns.get(filters.sort_by or "sold_at", Sale.sold_at)
    statement = statement.order_by(direction(filters)(order), Sale.id)
    return await limited_rows(session, statement)


async def finance_entries(session: AsyncSession, filters: ExportFilters) -> list[dict[str, Any]]:
    entries = entry_union()
    statement = select(entries, FundingSource.name.label("funding_source_name")).outerjoin(
        FundingSource, FundingSource.id == entries.c.funding_source_id
    )
    if filters.funding_source_id is not None:
        statement = statement.where(entries.c.funding_source_id == filters.funding_source_id)
    if filters.source != FinanceSource.ALL:
        statement = statement.where(entries.c.source_type == filters.source.value)
    if filters.direction is not None:
        statement = statement.where(entries.c.direction == filters.direction.value)
    if filters.search:
        search = f"%{filters.search.strip()}%"
        statement = statement.where(
            entries.c.category.ilike(search) | entries.c.description.ilike(search)
        )
    statement = apply_period(statement, entries.c.occurred_at, filters.date_from, filters.date_to)
    statement = apply_ids(statement, entries.c.id, filters.ids)
    statement = statement.order_by(direction(filters)(entries.c.occurred_at), entries.c.id)
    return await limited_rows(session, statement)


async def rows_for_dataset(
    session: AsyncSession, dataset: ExportDataset, filters: ExportFilters
) -> list[dict[str, Any]]:
    handlers = {
        ExportDataset.MATERIALS: materials,
        ExportDataset.MANUFACTURED_ITEMS: manufactured_items,
        ExportDataset.INVENTORY_MOVEMENTS: inventory_movements,
        ExportDataset.OPERATIONS: operations,
        ExportDataset.WORK_ENTRIES: work_entries,
        ExportDataset.EMPLOYEES: employees,
        ExportDataset.PAYROLL_ACCRUALS: work_entries,
        ExportDataset.EMPLOYEE_PAYMENTS: payments,
        ExportDataset.PRODUCTION_PLANS: production_plans,
        ExportDataset.PRODUCTION_RECORDS: production_records,
        ExportDataset.SALES: sales,
        ExportDataset.FINANCE_ENTRIES: finance_entries,
    }
    handler = handlers.get(dataset)
    if handler is None:
        raise ValueError(f"dataset {dataset.value} has no row handler")
    return await handler(session, filters)
