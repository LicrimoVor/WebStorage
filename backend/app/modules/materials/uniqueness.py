"""Material names are unique within each assigned group, including the archive."""

import uuid
from collections.abc import Iterable

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError
from app.modules.materials.model import Material
from app.modules.warehouse.model import InventoryGroupMaterial


async def lock_material_catalog(session: AsyncSession) -> None:
    # Serialize name/group changes, imports and group deletion so concurrent
    # requests cannot both pass a uniqueness check across the association table.
    await session.execute(text("SELECT pg_advisory_xact_lock(2026092902)"))


async def validate_material_name(
    session: AsyncSession, name: str, group_ids: Iterable[uuid.UUID],
    material_id: uuid.UUID | None = None,
) -> None:
    requested = set(group_ids)
    statement = select(Material.id).where(func.lower(Material.name) == name.lower())
    if material_id is not None:
        statement = statement.where(Material.id != material_id)
    membership = select(InventoryGroupMaterial.material_id)
    if requested:
        statement = statement.where(Material.id.in_(
            membership.where(InventoryGroupMaterial.group_id.in_(requested))
        ))
    else:
        statement = statement.where(Material.id.not_in(membership))
    if await session.scalar(statement.limit(1)):
        scope = "выбранной группе/подгруппе" if requested else "разделе «Без группы»"
        raise ConflictError(
            f'Материал «{name}» уже существует в {scope} (возможно, в архиве). '
            'Измените название или группу.'
        )
