import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import case, func, literal, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select
from sqlalchemy.sql.selectable import Subquery

from app.core.query import SortOrder
from app.modules.employees.model import Employee
from app.modules.finance.model import FinancialTransaction
from app.modules.finance.schemas import FinanceSource, FinancialDirection
from app.modules.inventory.model import InventoryMovement
from app.modules.manufactured_items.model import ManufacturedItem
from app.modules.materials.model import Material
from app.modules.payroll.model import EmployeePayment
from app.modules.sales.model import Sale


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


def entry_union() -> Subquery:
    manual = select(
        FinancialTransaction.id.label("id"),
        FinancialTransaction.id.label("source_id"),
        literal(FinanceSource.MANUAL.value).label("source_type"),
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
            InventoryMovement.id.label("source_id"),
            literal(FinanceSource.MATERIAL.value).label("source_type"),
            literal(FinancialDirection.EXPENSE.value).label("direction"),
            literal("Материалы").label("category"),
            Material.name.label("description"),
            InventoryMovement.total_amount_snapshot.label("amount"),
            InventoryMovement.created_at.label("occurred_at"),
            InventoryMovement.comment.label("comment"),
            literal("system").label("created_by"),
        )
        .join(Material, Material.id == InventoryMovement.material_id)
        .where(
            InventoryMovement.quantity < 0,
            InventoryMovement.total_amount_snapshot.is_not(None),
        )
    )
    return union_all(manual, sales, labour, materials).subquery("finance_entries")


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
) -> tuple[list[FinanceEntryRecord], int]:
    entries = entry_union()
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
        entries.c.occurred_at.asc()
        if sort_order == SortOrder.ASC
        else entries.c.occurred_at.desc()
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
) -> tuple[Decimal, Decimal, Decimal, Decimal, Decimal, int]:
    sales_statement = with_period(
        select(func.coalesce(func.sum(Sale.total_amount), Decimal("0"))),
        Sale.sold_at,
        date_from,
        date_to,
    )
    labour_statement = with_period(
        select(func.coalesce(func.sum(EmployeePayment.amount), Decimal("0"))),
        EmployeePayment.paid_at,
        date_from,
        date_to,
    )
    material_statement = with_period(
        select(
            func.coalesce(func.sum(InventoryMovement.total_amount_snapshot), Decimal("0"))
        ).where(
            InventoryMovement.quantity < 0,
            InventoryMovement.total_amount_snapshot.is_not(None),
        ),
        InventoryMovement.created_at,
        date_from,
        date_to,
    )
    manual_statement = with_period(
        select(
            func.coalesce(
                func.sum(
                    case(
                        (
                            FinancialTransaction.transaction_type
                            == FinancialDirection.INCOME.value,
                            FinancialTransaction.amount,
                        ),
                        else_=Decimal("0"),
                    )
                ),
                Decimal("0"),
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            FinancialTransaction.transaction_type
                            == FinancialDirection.EXPENSE.value,
                            FinancialTransaction.amount,
                        ),
                        else_=Decimal("0"),
                    )
                ),
                Decimal("0"),
            ),
        ),
        FinancialTransaction.occurred_at,
        date_from,
        date_to,
    )
    incomplete_statement = with_period(
        select(func.count()).where(
            InventoryMovement.quantity < 0,
            InventoryMovement.total_amount_snapshot.is_(None),
        ),
        InventoryMovement.created_at,
        date_from,
        date_to,
    )
    sales_income = Decimal((await session.execute(sales_statement)).scalar_one())
    labour_expense = Decimal((await session.execute(labour_statement)).scalar_one())
    material_expense = Decimal((await session.execute(material_statement)).scalar_one())
    manual = (await session.execute(manual_statement)).one()
    incomplete = int((await session.execute(incomplete_statement)).scalar_one())
    return (
        sales_income,
        material_expense,
        labour_expense,
        Decimal(manual[0]),
        Decimal(manual[1]),
        incomplete,
    )
