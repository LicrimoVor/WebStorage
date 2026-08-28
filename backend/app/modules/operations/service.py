import math
import uuid
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.core.query import SortOrder
from app.modules.operations import repository
from app.modules.operations.model import Operation
from app.modules.operations.schemas import (
    OperationCreate,
    OperationList,
    OperationRead,
    OperationSortField,
    OperationUpdate,
)


def to_read_model(operation: Operation) -> OperationRead:
    return OperationRead(
        id=operation.id,
        name=operation.name,
        time_norm=operation.time_norm,
        price_per_operation=operation.price_per_operation,
        required_quantity=Decimal("0"),
        completed_quantity=Decimal("0"),
        required_time_minutes=Decimal("0"),
        archived=operation.archived,
        created_at=operation.created_at,
        updated_at=operation.updated_at,
    )


async def create(session: AsyncSession, payload: OperationCreate) -> OperationRead:
    operation = Operation(**payload.model_dump())
    try:
        await repository.create_operation(session, operation)
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("An operation with this name already exists") from error
    await session.refresh(operation)
    return to_read_model(operation)


async def list_all(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    search: str | None,
    include_archived: bool,
    sort_by: OperationSortField,
    sort_order: SortOrder,
) -> OperationList:
    items, total = await repository.list_operations(
        session,
        page=page,
        page_size=page_size,
        search=search,
        include_archived=include_archived,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return OperationList(
        items=[to_read_model(item) for item in items],
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
    )


async def get(session: AsyncSession, operation_id: uuid.UUID) -> OperationRead:
    operation = await repository.get_operation(session, operation_id)
    if operation is None:
        raise NotFoundError("Operation was not found")
    return to_read_model(operation)


async def update(
    session: AsyncSession, operation_id: uuid.UUID, payload: OperationUpdate
) -> OperationRead:
    operation = await repository.get_operation(session, operation_id, for_update=True)
    if operation is None:
        raise NotFoundError("Operation was not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(operation, field, value)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("An operation with this name already exists") from error
    await session.refresh(operation)
    return to_read_model(operation)


async def archive(session: AsyncSession, operation_id: uuid.UUID) -> OperationRead:
    operation = await repository.get_operation(session, operation_id, for_update=True)
    if operation is None:
        raise NotFoundError("Operation was not found")
    operation.archived = True
    await session.commit()
    await session.refresh(operation)
    return to_read_model(operation)
