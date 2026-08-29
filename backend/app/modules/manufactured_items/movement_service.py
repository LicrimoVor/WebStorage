import math
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainValidationError
from app.modules.inventory.domain import manual_movement_delta
from app.modules.inventory.schemas import InventoryMovementCreate
from app.modules.inventory.types import MovementType
from app.modules.manufactured_items import movement_repository
from app.modules.manufactured_items.model import ManufacturedItemMovement
from app.modules.manufactured_items.schemas import (
    ManufacturedItemMovementList,
    ManufacturedItemMovementRead,
)


def to_read_model(
    movement: ManufacturedItemMovement,
) -> ManufacturedItemMovementRead:
    return ManufacturedItemMovementRead(
        id=movement.id,
        manufactured_item_id=movement.manufactured_item_id,
        movement_type=movement.movement_type,
        quantity=movement.quantity,
        balance_before=movement.balance_before,
        balance_after=movement.balance_after,
        comment=movement.comment,
        source_type=movement.source_type,
        source_id=movement.source_id,
        production_record_id=movement.production_record_id,
        sale_id=movement.sale_id,
        created_at=movement.created_at,
    )


async def apply_manual_movement(
    session: AsyncSession,
    *,
    item_id: uuid.UUID,
    payload: InventoryMovementCreate,
) -> ManufacturedItemMovementRead:
    try:
        delta = manual_movement_delta(payload.movement_type, payload.quantity)
    except ValueError as error:
        raise DomainValidationError(str(error)) from error
    movement = await movement_repository.create_movement(
        session,
        item_id=item_id,
        movement_type=MovementType(payload.movement_type.value),
        quantity=delta,
        comment=payload.comment,
        source_type="manual",
    )
    await session.commit()
    await session.refresh(movement)
    return to_read_model(movement)


async def history(
    session: AsyncSession,
    *,
    item_id: uuid.UUID,
    page: int,
    page_size: int,
) -> ManufacturedItemMovementList:
    items, total = await movement_repository.list_movements(
        session, item_id=item_id, page=page, page_size=page_size
    )
    return ManufacturedItemMovementList(
        items=[to_read_model(item) for item in items],
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
    )
