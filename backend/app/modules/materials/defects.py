import uuid

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, DomainValidationError
from app.modules.inventory.model import InventoryMovement
from app.modules.inventory.repository import create_movement
from app.modules.inventory.types import MovementType
from app.modules.materials.model import Material
from app.modules.materials.schemas import DefectTransfer, MaterialRead
from app.modules.materials.service import get


async def transfer(session: AsyncSession, material_id: uuid.UUID, payload: DefectTransfer) -> None:
    # The request UUID is also the history link for both sides of a conversion.
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": str(payload.request_id)},
    )
    ids = [line.material_id for line in payload.entries]
    if len(ids) != len(set(ids)) or material_id in ids:
        raise DomainValidationError("Материалы не должны повторяться")
    materials = list(
        (
            await session.scalars(
                select(Material)
                .where(Material.id.in_([material_id, *ids]))
                .order_by(Material.id)
                .with_for_update()
            )
        ).all()
    )
    by_id = {m.id: m for m in materials}
    origin = by_id.get(material_id)
    if origin is None or origin.archived:
        raise DomainValidationError("Материал не найден или архивирован")
    kind = "defect_recovery" if origin.source_material_id else "defect_conversion"
    expected = []
    for line in payload.entries:
        target = by_id.get(line.material_id)
        if target is None or target.archived or target.unit != origin.unit:
            raise DomainValidationError("Материал назначения недоступен")
        if (origin.source_material_id and target.id != origin.source_material_id) or (
            not origin.source_material_id and target.source_material_id != origin.id
        ):
            raise DomainValidationError("Выберите связанный вид брака или исходный материал")
        expected.extend(
            [(origin.id, -line.quantity, line.comment), (target.id, line.quantity, line.comment)]
        )
    existing = list(
        (
            await session.scalars(
                select(InventoryMovement).where(InventoryMovement.source_id == payload.request_id)
            )
        ).all()
    )
    if existing:
        actual = [(m.material_id, m.quantity, m.comment or "") for m in existing]
        if sorted(actual) != sorted(expected) or any(m.source_type != kind for m in existing):
            raise ConflictError("Ключ уже использован для другого перевода")
        return
    for target_id, quantity, comment in expected:
        await create_movement(
            session,
            material_id=target_id,
            movement_type=MovementType.RECEIPT if quantity > 0 else MovementType.WRITE_OFF,
            quantity=quantity,
            comment=comment,
            source_type=kind,
            source_id=payload.request_id,
        )
    await session.commit()


async def relatives(session: AsyncSession, material_id: uuid.UUID) -> list[MaterialRead]:
    item = await get(session, material_id)
    ids = (
        [item.source_material_id]
        if item.source_material_id
        else list(
            await session.scalars(
                select(Material.id)
                .where(Material.source_material_id == material_id, Material.archived.is_(False))
                .order_by(Material.name)
            )
        )
    )
    return [await get(session, target_id) for target_id in ids]
