import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainValidationError, NotFoundError
from app.core.types import Quantity
from app.modules.manufactured_items.model import ManufacturedItem
from app.modules.materials.model import Material
from app.modules.operations.model import Operation
from app.modules.production.standalone import _recipe_demand, _recipe_for_item
from app.modules.technological_processes.model import TechnologicalProcess


class CompositionEntry(BaseModel):
    id: uuid.UUID
    kind: Literal["material", "semi_finished", "operation"]
    name: str
    unit: str
    quantity: Quantity


class ItemComposition(BaseModel):
    process_id: uuid.UUID | None = None
    version_number: int | None = None
    has_recipe: bool = False
    entries: list[CompositionEntry] = []


async def get_composition(session: AsyncSession, item_id: uuid.UUID) -> ItemComposition:
    item = await session.get(ManufacturedItem, item_id)
    if item is None:
        raise NotFoundError("Изделие не найдено")
    try:
        recipe = await _recipe_for_item(session, item)
    except DomainValidationError as error:
        if "has no active" not in str(error):
            raise
        # An unpublished process can still be opened from the warehouse.
        process_id = await session.scalar(select(TechnologicalProcess.id).where(
            TechnologicalProcess.output_item_id == (item.product_id or item.id),
            TechnologicalProcess.archived.is_(False),
        ))
        return ItemComposition(process_id=process_id)
    demand = await _recipe_demand(session, recipe, Decimal(1))
    entries: list[CompositionEntry] = []
    for material in await session.scalars(
        select(Material).where(Material.id.in_(demand.materials))
    ):
        entries.append(CompositionEntry(
            id=material.id, kind="material", name=material.name, unit=material.unit,
            quantity=demand.materials[material.id],
        ))
    for child in await session.scalars(
        select(ManufacturedItem).where(ManufacturedItem.id.in_(demand.items))
    ):
        entries.append(CompositionEntry(
            id=child.id, kind="semi_finished", name=child.name, unit=child.unit,
            quantity=demand.items[child.id],
        ))
    for operation in await session.scalars(
        select(Operation).where(Operation.id.in_(demand.operations))
    ):
        entries.append(CompositionEntry(
            id=operation.id, kind="operation", name=operation.name, unit="операций",
            quantity=demand.operations[operation.id],
        ))
    return ItemComposition(
        process_id=recipe.version.process_id, version_number=recipe.version.version_number,
        has_recipe=True, entries=sorted(entries, key=lambda entry: (entry.kind, entry.name)),
    )
