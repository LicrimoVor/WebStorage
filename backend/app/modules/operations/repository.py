import uuid

from sqlalchemy import asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.query import SortOrder
from app.modules.operations.model import Operation
from app.modules.operations.schemas import OperationSortField


async def list_operations(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    search: str | None,
    include_archived: bool,
    sort_by: OperationSortField,
    sort_order: SortOrder,
) -> tuple[list[Operation], int]:
    statement = select(Operation)
    if not include_archived:
        statement = statement.where(Operation.archived.is_(False))
    if search:
        statement = statement.where(Operation.name.ilike(f"%{search.strip()}%"))
    total = int(
        (
            await session.execute(
                select(func.count()).select_from(statement.order_by(None).subquery())
            )
        ).scalar_one()
    )
    order_columns = {
        OperationSortField.NAME: func.lower(Operation.name),
        OperationSortField.TIME_NORM: Operation.time_norm,
        OperationSortField.PRICE_PER_OPERATION: Operation.price_per_operation,
        OperationSortField.CREATED_AT: Operation.created_at,
    }
    direction = asc if sort_order == SortOrder.ASC else desc
    statement = statement.order_by(
        direction(order_columns[sort_by]).nulls_last(), asc(Operation.id)
    )
    statement = statement.offset((page - 1) * page_size).limit(page_size)
    return list((await session.execute(statement)).scalars().all()), total


async def get_operation(
    session: AsyncSession, operation_id: uuid.UUID, *, for_update: bool = False
) -> Operation | None:
    statement = select(Operation).where(Operation.id == operation_id)
    if for_update:
        statement = statement.with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def create_operation(
    session: AsyncSession, operation: Operation
) -> Operation:
    session.add(operation)
    await session.flush()
    return operation
