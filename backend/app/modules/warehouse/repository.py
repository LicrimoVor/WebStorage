import uuid
from collections.abc import Iterable

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.modules.warehouse.model import (
    InventoryGroup,
    InventoryGroupManufacturedItem,
    InventoryGroupMaterial,
)
from app.modules.warehouse.schemas import InventoryGroupSummary


async def list_groups_with_counts(
    session: AsyncSession,
) -> list[tuple[InventoryGroup, int, int]]:
    material_count = (
        select(
            InventoryGroupMaterial.group_id,
            func.count().label("material_count"),
        )
        .group_by(InventoryGroupMaterial.group_id)
        .subquery()
    )
    item_count = (
        select(
            InventoryGroupManufacturedItem.group_id,
            func.count().label("item_count"),
        )
        .group_by(InventoryGroupManufacturedItem.group_id)
        .subquery()
    )
    rows = (
        await session.execute(
            select(
                InventoryGroup,
                func.coalesce(material_count.c.material_count, 0),
                func.coalesce(item_count.c.item_count, 0),
            )
            .outerjoin(material_count, material_count.c.group_id == InventoryGroup.id)
            .outerjoin(item_count, item_count.c.group_id == InventoryGroup.id)
            .order_by(func.lower(InventoryGroup.name), InventoryGroup.id)
        )
    ).all()
    return [(row[0], int(row[1]), int(row[2])) for row in rows]


async def validate_group_ids(
    session: AsyncSession, group_ids: Iterable[uuid.UUID]
) -> set[uuid.UUID]:
    requested = set(group_ids)
    if not requested:
        return set()
    found = set(
        (
            await session.execute(
                select(InventoryGroup.id).where(InventoryGroup.id.in_(requested))
            )
        )
        .scalars()
        .all()
    )
    if found != requested:
        raise NotFoundError("One or more inventory groups were not found")
    return found


async def set_material_groups(
    session: AsyncSession, material_id: uuid.UUID, group_ids: Iterable[uuid.UUID]
) -> None:
    requested = await validate_group_ids(session, group_ids)
    await session.execute(
        delete(InventoryGroupMaterial).where(
            InventoryGroupMaterial.material_id == material_id
        )
    )
    session.add_all(
        [
            InventoryGroupMaterial(group_id=group_id, material_id=material_id)
            for group_id in requested
        ]
    )
    await session.flush()


async def set_item_groups(
    session: AsyncSession, item_id: uuid.UUID, group_ids: Iterable[uuid.UUID]
) -> None:
    requested = await validate_group_ids(session, group_ids)
    await session.execute(
        delete(InventoryGroupManufacturedItem).where(
            InventoryGroupManufacturedItem.manufactured_item_id == item_id
        )
    )
    session.add_all(
        [
            InventoryGroupManufacturedItem(
                group_id=group_id, manufactured_item_id=item_id
            )
            for group_id in requested
        ]
    )
    await session.flush()


async def material_group_map(
    session: AsyncSession, material_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, list[InventoryGroupSummary]]:
    ids = set(material_ids)
    if not ids:
        return {}
    rows = (
        await session.execute(
            select(
                InventoryGroupMaterial.material_id,
                InventoryGroup.id,
                InventoryGroup.name,
                InventoryGroup.parent_id,
            )
            .join(InventoryGroup, InventoryGroup.id == InventoryGroupMaterial.group_id)
            .where(InventoryGroupMaterial.material_id.in_(ids))
            .order_by(func.lower(InventoryGroup.name), InventoryGroup.id)
        )
    ).all()
    result: dict[uuid.UUID, list[InventoryGroupSummary]] = {}
    for material_id, group_id, name, parent_id in rows:
        result.setdefault(material_id, []).append(
            InventoryGroupSummary(id=group_id, name=name, parent_id=parent_id)
        )
    return result


async def item_group_map(
    session: AsyncSession, item_ids: Iterable[uuid.UUID]
) -> dict[uuid.UUID, list[InventoryGroupSummary]]:
    ids = set(item_ids)
    if not ids:
        return {}
    rows = (
        await session.execute(
            select(
                InventoryGroupManufacturedItem.manufactured_item_id,
                InventoryGroup.id,
                InventoryGroup.name,
                InventoryGroup.parent_id,
            )
            .join(
                InventoryGroup,
                InventoryGroup.id == InventoryGroupManufacturedItem.group_id,
            )
            .where(InventoryGroupManufacturedItem.manufactured_item_id.in_(ids))
            .order_by(func.lower(InventoryGroup.name), InventoryGroup.id)
        )
    ).all()
    result: dict[uuid.UUID, list[InventoryGroupSummary]] = {}
    for item_id, group_id, name, parent_id in rows:
        result.setdefault(item_id, []).append(
            InventoryGroupSummary(id=group_id, name=name, parent_id=parent_id)
        )
    return result
