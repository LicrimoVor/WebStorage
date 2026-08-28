import math
import uuid
from decimal import Decimal

from pydantic import AnyHttpUrl
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.core.query import AvailabilityFilter, SortOrder
from app.modules.inventory.types import MovementType
from app.modules.manufactured_items import movement_repository, repository
from app.modules.manufactured_items.model import ManufacturedItem
from app.modules.manufactured_items.schemas import (
    ManufacturedItemCreate,
    ManufacturedItemKind,
    ManufacturedItemList,
    ManufacturedItemRead,
    ManufacturedItemSortField,
    ManufacturedItemUpdate,
)


def _url_value(value: AnyHttpUrl | None) -> str | None:
    return str(value) if value is not None else None


def to_read_model(
    item: ManufacturedItem, free_quantity: Decimal
) -> ManufacturedItemRead:
    return ManufacturedItemRead(
        id=item.id,
        name=item.name,
        is_product=item.is_product,
        unit=item.unit,
        free_quantity=free_quantity,
        required_quantity=Decimal("0"),
        to_produce_quantity=Decimal("0"),
        image=item.image,
        active_process_id=item.active_process_id,
        archived=item.archived,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


async def create(
    session: AsyncSession, payload: ManufacturedItemCreate
) -> ManufacturedItemRead:
    item = ManufacturedItem(
        name=payload.name,
        is_product=payload.is_product,
        unit=payload.unit,
        image=_url_value(payload.image),
    )
    try:
        await repository.create_item(session, item)
        balance = Decimal("0")
        if payload.initial_quantity > 0:
            movement = await movement_repository.create_movement(
                session,
                item_id=item.id,
                movement_type=MovementType.RECEIPT,
                quantity=payload.initial_quantity,
                comment="Initial balance",
                source_type="manufactured_item_creation",
            )
            balance = movement.balance_after
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError(
            "A manufactured item with this name already exists"
        ) from error
    await session.refresh(item)
    return to_read_model(item, balance)


async def list_all(
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
) -> ManufacturedItemList:
    rows, total = await repository.list_items(
        session,
        page=page,
        page_size=page_size,
        search=search,
        include_archived=include_archived,
        availability=availability,
        kind=kind,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return ManufacturedItemList(
        items=[to_read_model(item, balance) for item, balance in rows],
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
    )


async def get(session: AsyncSession, item_id: uuid.UUID) -> ManufacturedItemRead:
    result = await repository.get_item_with_balance(session, item_id)
    if result is None:
        raise NotFoundError("Manufactured item was not found")
    return to_read_model(*result)


async def update(
    session: AsyncSession,
    item_id: uuid.UUID,
    payload: ManufacturedItemUpdate,
) -> ManufacturedItemRead:
    item = await repository.get_item_for_update(session, item_id)
    if item is None:
        raise NotFoundError("Manufactured item was not found")
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if field == "image":
            value = _url_value(value)
        setattr(item, field, value)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError(
            "A manufactured item with this name already exists"
        ) from error
    await session.refresh(item)
    result = await repository.get_item_with_balance(session, item_id)
    if result is None:  # pragma: no cover - protected by the row lock above
        raise NotFoundError("Manufactured item was not found")
    return to_read_model(*result)


async def archive(
    session: AsyncSession, item_id: uuid.UUID
) -> ManufacturedItemRead:
    item = await repository.get_item_for_update(session, item_id)
    if item is None:
        raise NotFoundError("Manufactured item was not found")
    item.archived = True
    await session.commit()
    await session.refresh(item)
    result = await repository.get_item_with_balance(session, item_id)
    if result is None:  # pragma: no cover - protected by the row lock above
        raise NotFoundError("Manufactured item was not found")
    return to_read_model(*result)
