import math
import uuid
from decimal import Decimal

from pydantic import AnyHttpUrl
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.modules.inventory.model import MovementType
from app.modules.inventory.repository import create_movement
from app.modules.materials import repository
from app.modules.materials.model import Material
from app.modules.materials.schemas import (
    AvailabilityFilter,
    MaterialCreate,
    MaterialList,
    MaterialRead,
    MaterialSortField,
    MaterialUpdate,
    SortOrder,
)


def _url_value(value: AnyHttpUrl | None) -> str | None:
    return str(value) if value is not None else None


def to_read_model(material: Material, free_quantity: Decimal) -> MaterialRead:
    return MaterialRead(
        id=material.id,
        name=material.name,
        unit=material.unit,
        free_quantity=free_quantity,
        required_quantity=Decimal("0"),
        deficit_quantity=Decimal("0"),
        price=material.price,
        url=material.url,
        image=material.image,
        archived=material.archived,
        created_at=material.created_at,
        updated_at=material.updated_at,
    )


async def create(
    session: AsyncSession, payload: MaterialCreate
) -> MaterialRead:
    material = Material(
        name=payload.name,
        unit=payload.unit,
        price=payload.price,
        url=_url_value(payload.url),
        image=_url_value(payload.image),
    )
    try:
        await repository.create_material(session, material)
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
    return to_read_model(material, balance)


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
) -> MaterialList:
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
    )
    return MaterialList(
        items=[to_read_model(material, balance) for material, balance in rows],
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
    )


async def get(session: AsyncSession, material_id: uuid.UUID) -> MaterialRead:
    result = await repository.get_material_with_balance(session, material_id)
    if result is None:
        raise NotFoundError("Material was not found")
    return to_read_model(*result)


async def update(
    session: AsyncSession, material_id: uuid.UUID, payload: MaterialUpdate
) -> MaterialRead:
    material = await repository.get_material_for_update(session, material_id)
    if material is None:
        raise NotFoundError("Material was not found")
    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        if field in {"url", "image"}:
            value = _url_value(value)
        setattr(material, field, value)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("A material with this name already exists") from error
    await session.refresh(material)
    result = await repository.get_material_with_balance(session, material_id)
    if result is None:  # pragma: no cover - protected by the row lock above
        raise NotFoundError("Material was not found")
    return to_read_model(*result)


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
    return to_read_model(*result)

