import math
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainValidationError
from app.modules.inventory import repository
from app.modules.inventory.domain import manual_movement_delta
from app.modules.inventory.model import InventoryMovement
from app.modules.inventory.schemas import (
    InventoryMovementCreate,
    InventoryMovementList,
    InventoryMovementRead,
)
from app.modules.inventory.types import MovementType


def to_read_model(movement: InventoryMovement) -> InventoryMovementRead:
    return InventoryMovementRead(
        id=movement.id,
        funding_source_id=movement.funding_source_id,
        material_id=movement.material_id,
        movement_type=movement.movement_type,
        quantity=movement.quantity,
        balance_before=movement.balance_before,
        balance_after=movement.balance_after,
        comment=movement.comment,
        source_type=movement.source_type,
        source_id=movement.source_id,
        production_record_id=movement.production_record_id,
        unit_price_snapshot=movement.unit_price_snapshot,
        total_amount_snapshot=movement.total_amount_snapshot,
        created_at=movement.created_at,
    )


async def apply_manual_movement(
    session: AsyncSession,
    *,
    material_id: uuid.UUID,
    payload: InventoryMovementCreate,
) -> InventoryMovementRead:
    try:
        delta = manual_movement_delta(payload.movement_type, payload.quantity)
    except ValueError as error:
        raise DomainValidationError(str(error)) from error
    movement = await repository.create_movement(
        session,
        material_id=material_id,
        movement_type=MovementType(payload.movement_type.value),
        quantity=delta,
        comment=payload.comment,
        source_type="manual",
    )
    if payload.movement_type.value == "receipt":
        from app.modules.business.service import validate_funding

        await validate_funding(session, payload.funding_source_id)
        movement.funding_source_id = payload.funding_source_id
    await session.commit()
    await session.refresh(movement)
    return to_read_model(movement)


async def history(
    session: AsyncSession,
    *,
    material_id: uuid.UUID,
    page: int,
    page_size: int,
) -> InventoryMovementList:
    items, total = await repository.list_movements(
        session,
        material_id=material_id,
        page=page,
        page_size=page_size,
    )
    return InventoryMovementList(
        items=[to_read_model(item) for item in items],
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
    )
