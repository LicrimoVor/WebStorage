import uuid
from decimal import Decimal

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.modules.inventory.model import InventoryMovement
from app.modules.inventory.types import MovementType
from app.modules.materials.model import Material


async def create_movement(
    session: AsyncSession,
    *,
    material_id: uuid.UUID,
    movement_type: MovementType,
    quantity: Decimal,
    comment: str | None,
    source_type: str | None,
    source_id: uuid.UUID | None = None,
) -> InventoryMovement:
    material_statement = select(Material).where(Material.id == material_id).with_for_update()
    material = (await session.execute(material_statement)).scalar_one_or_none()
    if material is None:
        raise NotFoundError("Material was not found")
    if material.archived:
        raise ConflictError("Archived material cannot receive inventory movements")

    balance_statement = select(
        func.coalesce(func.sum(InventoryMovement.quantity), Decimal("0"))
    ).where(InventoryMovement.material_id == material_id)
    balance_before = Decimal((await session.execute(balance_statement)).scalar_one())
    balance_after = balance_before + quantity
    if balance_after < 0:
        raise ConflictError("Inventory movement would make the balance negative")

    movement = InventoryMovement(
        material_id=material_id,
        movement_type=movement_type.value,
        quantity=quantity,
        balance_before=balance_before,
        balance_after=balance_after,
        comment=comment,
        source_type=source_type,
        source_id=source_id,
    )
    session.add(movement)
    await session.flush()
    return movement


async def list_movements(
    session: AsyncSession,
    *,
    material_id: uuid.UUID,
    page: int,
    page_size: int,
) -> tuple[list[InventoryMovement], int]:
    exists = await session.get(Material, material_id)
    if exists is None:
        raise NotFoundError("Material was not found")
    base = select(InventoryMovement).where(InventoryMovement.material_id == material_id)
    count_statement = select(func.count()).select_from(base.subquery())
    total = int((await session.execute(count_statement)).scalar_one())
    statement = (
        base.order_by(desc(InventoryMovement.created_at), desc(InventoryMovement.id))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = list((await session.execute(statement)).scalars().all())
    return items, total
