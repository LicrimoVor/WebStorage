import math
import uuid
from decimal import Decimal

from pydantic import AnyHttpUrl
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.core.query import AvailabilityFilter, SortOrder
from app.modules.inventory.repository import create_movement
from app.modules.inventory.types import MovementType
from app.modules.materials import repository
from app.modules.materials.model import Material
from app.modules.materials.schemas import (
    MaterialCreate,
    MaterialList,
    MaterialRead,
    MaterialSortField,
    MaterialUpdate,
)
from app.modules.warehouse import repository as warehouse_repository
from app.modules.warehouse.composition import product_components
from app.modules.warehouse.schemas import InventoryGroupSummary


def _url_value(value: AnyHttpUrl | None) -> str | None:
    return str(value) if value is not None else None


def to_read_model(
    material: Material,
    free_quantity: Decimal,
    required_quantity: Decimal = Decimal("0"),
    groups: list[InventoryGroupSummary] | None = None,
) -> MaterialRead:
    return MaterialRead(
        id=material.id,
        name=material.name,
        unit=material.unit,
        free_quantity=free_quantity,
        required_quantity=required_quantity,
        deficit_quantity=max(required_quantity - free_quantity, Decimal("0")),
        price=material.price,
        url=material.url,
        image=material.image,
        groups=groups or [],
        archived=material.archived,
        created_at=material.created_at,
        updated_at=material.updated_at,
    )


async def create(session: AsyncSession, payload: MaterialCreate) -> MaterialRead:
    material = Material(
        name=payload.name,
        unit=payload.unit,
        price=payload.price,
        url=_url_value(payload.url),
        image=_url_value(payload.image),
    )
    try:
        await repository.create_material(session, material)
        await warehouse_repository.set_material_groups(
            session, material.id, payload.group_ids
        )
        balance = Decimal("0")
        if payload.initial_quantity > 0:
            movement = await create_movement(
                session,
                material_id=material.id,
                movement_type=MovementType.RECEIPT,
                quantity=payload.initial_quantity,
                comment="Initial balance",
                source_type="material_creation",
            )
            balance = movement.balance_after
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("A material with this name already exists") from error
    await session.refresh(material)
    groups = await warehouse_repository.material_group_map(session, [material.id])
    return to_read_model(material, balance, groups=groups.get(material.id, []))


async def list_all(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    search: str | None,
    include_archived: bool,
    availability: AvailabilityFilter,
    deficit_only: bool,
    sort_by: MaterialSortField,
    sort_order: SortOrder,
    product_id: uuid.UUID | None,
    group_id: uuid.UUID | None,
) -> MaterialList:
    allowed_ids = None
    if product_id is not None:
        allowed_ids = (await product_components(session, product_id)).material_ids
    rows, total = await repository.list_materials(
        session,
        page=page,
        page_size=page_size,
        search=search,
        include_archived=include_archived,
        availability=availability,
        deficit_only=deficit_only,
        sort_by=sort_by,
        sort_order=sort_order,
        allowed_ids=allowed_ids,
        group_id=group_id,
    )
    group_map = await warehouse_repository.material_group_map(
        session, (material.id for material, _, _ in rows)
    )
    return MaterialList(
        items=[
            to_read_model(
                material, balance, required, group_map.get(material.id, [])
            )
            for material, balance, required in rows
        ],
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
    )


async def get(session: AsyncSession, material_id: uuid.UUID) -> MaterialRead:
    result = await repository.get_material_with_balance(session, material_id)
    if result is None:
        raise NotFoundError("Material was not found")
    groups = await warehouse_repository.material_group_map(session, [material_id])
    return to_read_model(*result, groups.get(material_id, []))


async def update(
    session: AsyncSession, material_id: uuid.UUID, payload: MaterialUpdate
) -> MaterialRead:
    material = await repository.get_material_for_update(session, material_id)
    if material is None:
        raise NotFoundError("Material was not found")
    changes = payload.model_dump(exclude_unset=True)
    group_ids = changes.pop("group_ids", None)
    for field, value in changes.items():
        if field in {"url", "image"}:
            value = _url_value(value)
        setattr(material, field, value)
    if group_ids is not None:
        await warehouse_repository.set_material_groups(session, material.id, group_ids)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("A material with this name already exists") from error
    await session.refresh(material)
    result = await repository.get_material_with_balance(session, material_id)
    if result is None:  # pragma: no cover - protected by the row lock above
        raise NotFoundError("Material was not found")
    groups = await warehouse_repository.material_group_map(session, [material_id])
    return to_read_model(*result, groups.get(material_id, []))


async def archive(session: AsyncSession, material_id: uuid.UUID) -> MaterialRead:
    material = await repository.get_material_for_update(session, material_id)
    if material is None:
        raise NotFoundError("Material was not found")
    material.archived = True
    await session.commit()
    await session.refresh(material)
    result = await repository.get_material_with_balance(session, material_id)
    if result is None:  # pragma: no cover - protected by the row lock above
        raise NotFoundError("Material was not found")
    groups = await warehouse_repository.material_group_map(session, [material_id])
    return to_read_model(*result, groups.get(material_id, []))
