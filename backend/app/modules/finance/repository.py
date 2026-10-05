import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import DateTime, Numeric, case, cast, column, func, literal, select, union_all
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select
from sqlalchemy.sql.selectable import Subquery

from app.core.query import SortOrder
from app.modules.business.model import BusinessDocument
from app.modules.employees.model import Employee
from app.modules.finance.model import FinancialTransaction
from app.modules.finance.schemas import FinanceSource, FinancialDirection
from app.modules.inventory.model import InventoryMovement
from app.modules.manufactured_items.model import ManufacturedItem
from app.modules.materials.model import Material
from app.modules.payroll.model import EmployeePayment
from app.modules.sales.model import Sale
from app.modules.trash.model import visible_finance_entry


@dataclass(frozen=True, slots=True)
class FinanceEntryRecord:
    id: uuid.UUID
    source_id: uuid.UUID
    source_type: str
    direction: str
    category: str
    description: str
    amount: Decimal
    occurred_at: datetime
    comment: str | None
    created_by: str
    funding_source_id: uuid.UUID | None
    funding_allocations: list[dict[str, Any]]


def entry_union(funding_source_id: uuid.UUID | None = None) -> Subquery:
    manual = select(
        FinancialTransaction.id.label("id"),
        FinancialTransaction.funding_source_id.label("funding_source_id"),
        FinancialTransaction.funding_allocations.label("funding_allocations"),
        FinancialTransaction.id.label("source_id"),
        case((FinancialTransaction.category == "Ремонт", "repair"), else_="manual").label(
            "source_type"
        ),
        FinancialTransaction.transaction_type.label("direction"),
        FinancialTransaction.category.label("category"),
        FinancialTransaction.category.label("description"),
        FinancialTransaction.amount.label("amount"),
        FinancialTransaction.occurred_at.label("occurred_at"),
        FinancialTransaction.comment.label("comment"),
        FinancialTransaction.created_by.label("created_by"),
    )
    sales = select(
        Sale.id.label("id"),
        Sale.funding_source_id.label("funding_source_id"),
        Sale.funding_allocations.label("funding_allocations"),
        Sale.id.label("source_id"),
        literal(FinanceSource.SALE.value).label("source_type"),
        literal(FinancialDirection.INCOME.value).label("direction"),
        literal("Продажи").label("category"),
        ManufacturedItem.name.label("description"),
        Sale.total_amount.label("amount"),
        Sale.sold_at.label("occurred_at"),
        Sale.comment.label("comment"),
        Sale.created_by.label("created_by"),
    ).join(ManufacturedItem, ManufacturedItem.id == Sale.product_id)
    labour = select(
        EmployeePayment.id.label("id"),
        EmployeePayment.funding_source_id.label("funding_source_id"),
        EmployeePayment.funding_allocations.label("funding_allocations"),
        EmployeePayment.id.label("source_id"),
        literal(FinanceSource.LABOUR.value).label("source_type"),
        literal(FinancialDirection.EXPENSE.value).label("direction"),
        literal("Оплата труда").label("category"),
        Employee.full_name.label("description"),
        EmployeePayment.amount.label("amount"),
        EmployeePayment.paid_at.label("occurred_at"),
        EmployeePayment.comment.label("comment"),
        EmployeePayment.created_by.label("created_by"),
    ).join(Employee, Employee.id == EmployeePayment.employee_id)
    materials = (
        select(
            InventoryMovement.id.label("id"),
            InventoryMovement.funding_source_id.label("funding_source_id"),
            InventoryMovement.funding_allocations.label("funding_allocations"),
            InventoryMovement.id.label("source_id"),
            literal(FinanceSource.MATERIAL.value).label("source_type"),
            literal(FinancialDirection.EXPENSE.value).label("direction"),
            literal("Материалы").label("category"),
            Material.name.label("description"),
            InventoryMovement.total_amount_snapshot.label("amount"),
            InventoryMovement.created_at.label("occurred_at"),
            InventoryMovement.comment.label("comment"),
            InventoryMovement.created_by.label("created_by"),
        )
        .join(Material, Material.id == InventoryMovement.material_id)
        .where(
            InventoryMovement.movement_type == "receipt",
            InventoryMovement.source_type.in_(["manual", "receipt"]),
            InventoryMovement.total_amount_snapshot.is_not(None),
        )
    )
    receipts = select(
        BusinessDocument.id.label("id"),
        BusinessDocument.funding_source_id.label("funding_source_id"),
        BusinessDocument.funding_allocations.label("funding_allocations"),
        BusinessDocument.id.label("source_id"),
        literal(FinanceSource.MATERIAL.value).label("source_type"),
        literal(FinancialDirection.EXPENSE.value).label("direction"),
        literal("Материалы").label("category"),
        literal("Приход материалов").label("description"),
        cast(BusinessDocument.data["total_amount"].astext, Numeric(20, 2)).label("amount"),
        cast(BusinessDocument.data["occurred_at"].astext, DateTime(timezone=True)).label(
            "occurred_at"
        ),
        BusinessDocument.data["comment"].astext.label("comment"),
        BusinessDocument.created_by.label("created_by"),
    ).where(
        BusinessDocument.kind == "receipt",
        BusinessDocument.data["total_amount"].astext.is_not(None),
    )
    manual = manual.where(visible_finance_entry(FinancialTransaction.id))
    sales = sales.where(visible_finance_entry(Sale.id))
    labour = labour.where(visible_finance_entry(EmployeePayment.id))
    materials = materials.where(visible_finance_entry(InventoryMovement.id))
    receipts = receipts.where(visible_finance_entry(BusinessDocument.id))
    entries = union_all(manual, sales, labour, materials, receipts).subquery("finance_entries")
    if funding_source_id is None:
        return entries
    parts = (
        func.jsonb_array_elements(entries.c.funding_allocations)
        .table_valued(column("value", JSONB))
        .alias("funding_part")
    )
    allocated = (
        select(func.sum(cast(parts.c.value["amount"].astext, Numeric(20, 2))))
        .where(parts.c.value["funding_source_id"].astext == str(funding_source_id))
        .correlate(entries)
        .scalar_subquery()
    )
    split = func.jsonb_array_length(entries.c.funding_allocations) > 0
    amount = case((split, allocated), else_=entries.c.amount)
    return (
        select(*[c for c in entries.c if c.key != "amount"], amount.label("amount"))
        .where(
            case(
                (split, allocated.is_not(None)),
                else_=entries.c.funding_source_id == funding_source_id,
            )
        )
        .subquery("filtered_finance_entries")
    )


async def create_transaction(
    session: AsyncSession, transaction: FinancialTransaction
) -> FinancialTransaction:
    session.add(transaction)
    await session.flush()
    return transaction


async def list_entries(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    source: FinanceSource,
    direction: FinancialDirection | None,
    date_from: datetime | None,
    date_to: datetime | None,
    sort_order: SortOrder,
    funding_source_id: uuid.UUID | None = None,
) -> tuple[list[FinanceEntryRecord], int]:
    entries = entry_union(funding_source_id)
    statement = select(entries)
    if source != FinanceSource.ALL:
        statement = statement.where(entries.c.source_type == source.value)
    if direction is not None:
        statement = statement.where(entries.c.direction == direction.value)
    if date_from is not None:
        statement = statement.where(entries.c.occurred_at >= date_from)
    if date_to is not None:
        statement = statement.where(entries.c.occurred_at <= date_to)
    total = int(
        (
            await session.execute(
                select(func.count()).select_from(statement.order_by(None).subquery())
            )
        ).scalar_one()
    )
    order = (
        entries.c.occurred_at.asc() if sort_order == SortOrder.ASC else entries.c.occurred_at.desc()
    )
    statement = statement.order_by(order, entries.c.id.desc())
    statement = statement.offset((page - 1) * page_size).limit(page_size)
    rows = (await session.execute(statement)).all()
    return (
        [
            FinanceEntryRecord(
                id=row.id,
                source_id=row.source_id,
                source_type=row.source_type,
                direction=row.direction,
                category=row.category,
                description=row.description,
                amount=Decimal(row.amount),
                occurred_at=row.occurred_at,
                comment=row.comment,
                created_by=row.created_by,
                funding_source_id=row.funding_source_id,
                funding_allocations=row.funding_allocations,
            )
            for row in rows
        ],
        total,
    )


def with_period(
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


async def summary_values(
    session: AsyncSession,
    *,
    date_from: datetime | None,
    date_to: datetime | None,
    funding_source_id: uuid.UUID | None = None,
) -> tuple[Decimal, Decimal, Decimal, Decimal, Decimal, int]:
    entries = entry_union(funding_source_id)
    statement = with_period(select(entries), entries.c.occurred_at, date_from, date_to).subquery()

    def total(source: list[str], direction: str) -> Any:
        return func.coalesce(
            func.sum(
                case(
                    (
                        (statement.c.source_type.in_(source))
                        & (statement.c.direction == direction),
                        statement.c.amount,
                    ),
                    else_=0,
                )
            ),
            0,
        )

    totals = (
        await session.execute(
            select(
                total(["sale"], "income"),
                total(["material"], "expense"),
                total(["labour"], "expense"),
                total(["manual", "repair"], "income"),
                total(["manual", "repair"], "expense"),
            )
        )
    ).one()
    incomplete_statement = with_period(
        select(func.count()).where(
            InventoryMovement.movement_type == "receipt",
            InventoryMovement.source_type.in_(["manual", "receipt"]),
            InventoryMovement.total_amount_snapshot.is_(None),
            visible_finance_entry(InventoryMovement.id),
        ),
        InventoryMovement.created_at,
        date_from,
        date_to,
    )
    if funding_source_id is not None:
        incomplete_statement = incomplete_statement.where(
            InventoryMovement.funding_source_id == funding_source_id
        )
    incomplete = int((await session.execute(incomplete_statement)).scalar_one())
    return (
        Decimal(totals[0]),
        Decimal(totals[1]),
        Decimal(totals[2]),
        Decimal(totals[3]),
        Decimal(totals[4]),
        incomplete,
    )
