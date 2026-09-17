import math
import uuid
from decimal import Decimal

from pydantic import AnyHttpUrl
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, DomainValidationError, NotFoundError
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
from app.modules.warehouse import repository as warehouse_repository
from app.modules.warehouse.schemas import InventoryGroupSummary


def _url_value(value: AnyHttpUrl | None) -> str | None:
    return str(value) if value is not None else None


def to_read_model(
    item: ManufacturedItem,
    free_quantity: Decimal,
    required_quantity: Decimal = Decimal("0"),
    groups: list[InventoryGroupSummary] | None = None,
) -> ManufacturedItemRead:
    return ManufacturedItemRead(
        id=item.id,
        name=item.name,
        is_product=item.is_product,
        product_id=item.product_id,
        unit=item.unit,
        free_quantity=free_quantity,
        required_quantity=required_quantity,
        to_produce_quantity=max(required_quantity - free_quantity, Decimal("0")),
        image=item.image,
        groups=groups or [],
        active_process_id=item.active_process_id,
        archived=item.archived,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


async def create(session: AsyncSession, payload: ManufacturedItemCreate) -> ManufacturedItemRead:
    if payload.is_product and payload.group_ids:
        raise DomainValidationError("Groups can only be assigned to semi-finished items")
    await validate_product(session, payload.is_product, payload.product_id)
    item = ManufacturedItem(
        product_id=payload.product_id,
        name=payload.name,
        is_product=payload.is_product,
        unit=payload.unit,
        image=_url_value(payload.image),
    )
    try:
        await repository.create_item(session, item)
        await warehouse_repository.set_item_groups(session, item.id, payload.group_ids)
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
        raise ConflictError("A manufactured item with this name already exists") from error
    await session.refresh(item)
    groups = await warehouse_repository.item_group_map(session, [item.id])
    return to_read_model(item, balance, groups=groups.get(item.id, []))


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
    product_id: uuid.UUID | None,
    group_id: uuid.UUID | None,
) -> ManufacturedItemList:
    allowed_ids = None
    if product_id is not None:
        allowed_ids = set(
            (
                await session.scalars(
                    select(ManufacturedItem.id).where(
                        (ManufacturedItem.product_id == product_id)
                        | (ManufacturedItem.id == product_id)
                    )
                )
            ).all()
        )
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
        allowed_ids=allowed_ids,
        group_id=group_id,
    )
    group_map = await warehouse_repository.item_group_map(session, (item.id for item, _, _ in rows))
    return ManufacturedItemList(
        items=[
            to_read_model(item, balance, required, group_map.get(item.id, []))
            for item, balance, required in rows
        ],
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
    )


async def get(session: AsyncSession, item_id: uuid.UUID) -> ManufacturedItemRead:
    result = await repository.get_item_with_balance(session, item_id)
    if result is None:
        raise NotFoundError("Manufactured item was not found")
    groups = await warehouse_repository.item_group_map(session, [item_id])
    return to_read_model(*result, groups.get(item_id, []))


async def update(
    session: AsyncSession,
    item_id: uuid.UUID,
    payload: ManufacturedItemUpdate,
) -> ManufacturedItemRead:
    item = await repository.get_item_for_update(session, item_id)
    if item is None:
        raise NotFoundError("Manufactured item was not found")
    changes = payload.model_dump(exclude_unset=True)
    group_ids = changes.pop("group_ids", None)
    next_is_product = changes.get("is_product", item.is_product)
    if item.is_product and not next_is_product:
        if await session.scalar(
            select(ManufacturedItem.id).where(ManufacturedItem.product_id == item.id).limit(1)
        ):
            raise ConflictError("Изменение типа продукта запрещено: имеются полуфабрикаты")
    if next_is_product and group_ids:
        raise DomainValidationError("Groups can only be assigned to semi-finished items")
    await validate_product(
        session, next_is_product, changes.get("product_id", item.product_id), item.id
    )
    for field, value in changes.items():
        if field == "image":
            value = _url_value(value)
        setattr(item, field, value)
    if next_is_product:
        await warehouse_repository.set_item_groups(session, item.id, [])
    elif group_ids is not None:
        await warehouse_repository.set_item_groups(session, item.id, group_ids)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("A manufactured item with this name already exists") from error
    await session.refresh(item)
    result = await repository.get_item_with_balance(session, item_id)
    if result is None:  # pragma: no cover - protected by the row lock above
        raise NotFoundError("Manufactured item was not found")
    groups = await warehouse_repository.item_group_map(session, [item_id])
    return to_read_model(*result, groups.get(item_id, []))


async def archive(session: AsyncSession, item_id: uuid.UUID) -> ManufacturedItemRead:
    item = await repository.get_item_for_update(session, item_id)
    if item is None:
        raise NotFoundError("Manufactured item was not found")
    item.archived = True
    await session.commit()
    await session.refresh(item)
    result = await repository.get_item_with_balance(session, item_id)
    if result is None:  # pragma: no cover - protected by the row lock above
        raise NotFoundError("Manufactured item was not found")
    groups = await warehouse_repository.item_group_map(session, [item_id])
    return to_read_model(*result, groups.get(item_id, []))


async def validate_product(
    session: AsyncSession,
    is_product: bool,
    product_id: uuid.UUID | None,
    item_id: uuid.UUID | None = None,
) -> None:
    if is_product:
        if product_id is not None:
            raise DomainValidationError("Продукт не может принадлежать другому продукту")
        return
    product = await session.get(ManufacturedItem, product_id) if product_id else None
    if product is None or not product.is_product or product.archived or product.id == item_id:
        raise DomainValidationError("Полуфабрикат должен принадлежать одному действующему продукту")
