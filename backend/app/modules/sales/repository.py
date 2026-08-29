import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.core.query import SortOrder
from app.modules.manufactured_items.model import ManufacturedItem, ManufacturedItemMovement
from app.modules.sales.model import Sale
from app.modules.sales.schemas import SaleSortField

SaleRow = tuple[Sale, ManufacturedItem, ManufacturedItemMovement]


def filtered_sales_statement(
    *,
    product_id: uuid.UUID | None,
    date_from: datetime | None,
    date_to: datetime | None,
) -> Select[tuple[Sale]]:
    statement = select(Sale)
    if product_id is not None:
        statement = statement.where(Sale.product_id == product_id)
    if date_from is not None:
        statement = statement.where(Sale.sold_at >= date_from)
    if date_to is not None:
        statement = statement.where(Sale.sold_at <= date_to)
    return statement


async def create_sale(session: AsyncSession, sale: Sale) -> Sale:
    session.add(sale)
    await session.flush()
    return sale


async def get_by_idempotency_key(
    session: AsyncSession, idempotency_key: str
) -> Sale | None:
    return (
        await session.execute(
            select(Sale).where(Sale.idempotency_key == idempotency_key)
        )
    ).scalar_one_or_none()


async def get_sale_row(session: AsyncSession, sale_id: uuid.UUID) -> SaleRow | None:
    row = (
        await session.execute(
            select(Sale, ManufacturedItem, ManufacturedItemMovement)
            .join(ManufacturedItem, ManufacturedItem.id == Sale.product_id)
            .join(ManufacturedItemMovement, ManufacturedItemMovement.sale_id == Sale.id)
            .where(Sale.id == sale_id)
        )
    ).one_or_none()
    if row is None:
        return None
    return row[0], row[1], row[2]


async def list_sales(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    product_id: uuid.UUID | None,
    date_from: datetime | None,
    date_to: datetime | None,
    sort_by: SaleSortField,
    sort_order: SortOrder,
) -> tuple[list[SaleRow], int, Decimal, Decimal]:
    filtered = filtered_sales_statement(
        product_id=product_id, date_from=date_from, date_to=date_to
    )
    filtered_subquery = filtered.subquery()
    aggregate = (
        await session.execute(
            select(
                func.count(),
                func.coalesce(func.sum(filtered_subquery.c.quantity), Decimal("0")),
                func.coalesce(
                    func.sum(filtered_subquery.c.total_amount), Decimal("0")
                ),
            ).select_from(filtered_subquery)
        )
    ).one()
    total = int(aggregate[0])
    order_columns = {
        SaleSortField.SOLD_AT: Sale.sold_at,
        SaleSortField.PRODUCT: func.lower(ManufacturedItem.name),
        SaleSortField.QUANTITY: Sale.quantity,
        SaleSortField.TOTAL_AMOUNT: Sale.total_amount,
    }
    direction = asc if sort_order == SortOrder.ASC else desc
    statement = (
        filtered.join(ManufacturedItem, ManufacturedItem.id == Sale.product_id)
        .join(ManufacturedItemMovement, ManufacturedItemMovement.sale_id == Sale.id)
        .add_columns(ManufacturedItem, ManufacturedItemMovement)
        .order_by(direction(order_columns[sort_by]), desc(Sale.id))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await session.execute(statement)).all()
    return (
        [(row[0], row[1], row[2]) for row in rows],
        total,
        Decimal(aggregate[1]),
        Decimal(aggregate[2]),
    )


async def summary(
    session: AsyncSession,
    *,
    product_id: uuid.UUID | None,
    date_from: datetime | None,
    date_to: datetime | None,
) -> tuple[int, Decimal, Decimal]:
    filtered = filtered_sales_statement(
        product_id=product_id, date_from=date_from, date_to=date_to
    )
    filtered_subquery = filtered.subquery()
    row = (
        await session.execute(
            select(
                func.count(),
                func.coalesce(func.sum(filtered_subquery.c.quantity), Decimal("0")),
                func.coalesce(
                    func.sum(filtered_subquery.c.total_amount), Decimal("0")
                ),
            ).select_from(filtered_subquery)
        )
    ).one()
    return int(row[0]), Decimal(row[1]), Decimal(row[2])
