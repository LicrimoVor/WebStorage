import uuid
from decimal import Decimal

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.modules.inventory.types import MovementType
from app.modules.manufactured_items.model import (
    ManufacturedItem,
    ManufacturedItemMovement,
)


async def create_movement(
    session: AsyncSession,
    *,
    item_id: uuid.UUID,
    movement_type: MovementType,
    quantity: Decimal,
    comment: str | None,
    source_type: str | None,
    source_id: uuid.UUID | None = None,
    production_record_id: uuid.UUID | None = None,
    sale_id: uuid.UUID | None = None,
) -> ManufacturedItemMovement:
    item_statement = (
        select(ManufacturedItem).where(ManufacturedItem.id == item_id).with_for_update()
    )
    item = (await session.execute(item_statement)).scalar_one_or_none()
    if item is None:
        raise NotFoundError("Manufactured item was not found")
    if item.archived:
        raise ConflictError("Archived manufactured item cannot receive inventory movements")

    balance_statement = select(
        func.coalesce(func.sum(ManufacturedItemMovement.quantity), Decimal("0"))
    ).where(ManufacturedItemMovement.manufactured_item_id == item_id)
    balance_before = Decimal((await session.execute(balance_statement)).scalar_one())
    balance_after = balance_before + quantity
    if balance_after < 0:
        raise ConflictError("Inventory movement would make the balance negative")

    movement = ManufacturedItemMovement(
        manufactured_item_id=item_id,
        movement_type=movement_type.value,
        quantity=quantity,
        balance_before=balance_before,
        balance_after=balance_after,
        comment=comment,
        source_type=source_type,
        source_id=source_id,
        production_record_id=production_record_id,
        sale_id=sale_id,
    )
    session.add(movement)
    await session.flush()
    return movement


async def list_movements(
    session: AsyncSession,
    *,
    item_id: uuid.UUID,
    page: int,
    page_size: int,
) -> tuple[list[ManufacturedItemMovement], int]:
    exists = await session.get(ManufacturedItem, item_id)
    if exists is None:
        raise NotFoundError("Manufactured item was not found")
    base = select(ManufacturedItemMovement).where(
        ManufacturedItemMovement.manufactured_item_id == item_id
    )
    count_statement = select(func.count()).select_from(base.subquery())
    total = int((await session.execute(count_statement)).scalar_one())
    statement = (
        base.order_by(
            desc(ManufacturedItemMovement.created_at),
            desc(ManufacturedItemMovement.id),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = list((await session.execute(statement)).scalars().all())
    return items, total
