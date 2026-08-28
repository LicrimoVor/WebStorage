import uuid
from decimal import Decimal

from sqlalchemy import Select, asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.query import AvailabilityFilter, SortOrder
from app.modules.manufactured_items.model import (
    ManufacturedItem,
    ManufacturedItemMovement,
)
from app.modules.manufactured_items.schemas import (
    ManufacturedItemKind,
    ManufacturedItemSortField,
)


def balance_expression() -> ColumnElement[Decimal]:
    return (
        select(
            func.coalesce(func.sum(ManufacturedItemMovement.quantity), Decimal("0"))
        )
        .where(ManufacturedItemMovement.manufactured_item_id == ManufacturedItem.id)
        .correlate(ManufacturedItem)
        .scalar_subquery()
    )


def _apply_filters(
    statement: Select[tuple[ManufacturedItem]],
    *,
    search: str | None,
    include_archived: bool,
    availability: AvailabilityFilter,
    kind: ManufacturedItemKind,
) -> Select[tuple[ManufacturedItem]]:
    if not include_archived:
        statement = statement.where(ManufacturedItem.archived.is_(False))
    if search:
        statement = statement.where(ManufacturedItem.name.ilike(f"%{search.strip()}%"))
    if kind == ManufacturedItemKind.PRODUCT:
        statement = statement.where(ManufacturedItem.is_product.is_(True))
    elif kind == ManufacturedItemKind.SEMI_FINISHED:
        statement = statement.where(ManufacturedItem.is_product.is_(False))

    balance = balance_expression()
    if availability == AvailabilityFilter.IN_STOCK:
        statement = statement.where(balance > 0)
    elif availability == AvailabilityFilter.OUT_OF_STOCK:
        statement = statement.where(balance <= 0)
    return statement


async def list_items(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    search: str | None,
    include_archived: bool,
    availability: AvailabilityFilter,
    kind: ManufacturedItemKind,
    sort_by: ManufacturedItemSortField,
    sort_order: SortOrder,
) -> tuple[list[tuple[ManufacturedItem, Decimal]], int]:
    balance = balance_expression().label("free_quantity")
    statement = _apply_filters(
        select(ManufacturedItem),
        search=search,
        include_archived=include_archived,
        availability=availability,
        kind=kind,
    )
    count_statement = select(func.count()).select_from(statement.order_by(None).subquery())
    total = int((await session.execute(count_statement)).scalar_one())
    order_columns = {
        ManufacturedItemSortField.NAME: func.lower(ManufacturedItem.name),
        ManufacturedItemSortField.FREE_QUANTITY: balance,
        ManufacturedItemSortField.CREATED_AT: ManufacturedItem.created_at,
    }
    direction = asc if sort_order == SortOrder.ASC else desc
    data_statement = statement.add_columns(balance).order_by(
        direction(order_columns[sort_by]), asc(ManufacturedItem.id)
    )
    data_statement = data_statement.offset((page - 1) * page_size).limit(page_size)
    rows = (await session.execute(data_statement)).all()
    return [(row[0], Decimal(row[1])) for row in rows], total


async def get_item_with_balance(
    session: AsyncSession, item_id: uuid.UUID
) -> tuple[ManufacturedItem, Decimal] | None:
    balance = balance_expression().label("free_quantity")
    statement = select(ManufacturedItem, balance).where(ManufacturedItem.id == item_id)
    row = (await session.execute(statement)).one_or_none()
    if row is None:
        return None
    return row[0], Decimal(row[1])


async def get_item_for_update(
    session: AsyncSession, item_id: uuid.UUID
) -> ManufacturedItem | None:
    statement = (
        select(ManufacturedItem)
        .where(ManufacturedItem.id == item_id)
        .with_for_update()
    )
    return (await session.execute(statement)).scalar_one_or_none()


async def create_item(
    session: AsyncSession, item: ManufacturedItem
) -> ManufacturedItem:
    session.add(item)
    await session.flush()
    return item
