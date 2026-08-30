import uuid
from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainValidationError, NotFoundError
from app.modules.manufactured_items.model import ManufacturedItem
from app.modules.production.standalone import _recipe_demand, _recipe_for_item


@dataclass(slots=True)
class ProductComponents:
    material_ids: set[uuid.UUID] = field(default_factory=set)
    manufactured_item_ids: set[uuid.UUID] = field(default_factory=set)


async def product_components(
    session: AsyncSession, product_id: uuid.UUID
) -> ProductComponents:
    product = await session.get(ManufacturedItem, product_id)
    if product is None or product.archived:
        raise NotFoundError("Product was not found")
    if not product.is_product:
        raise DomainValidationError("The selected item is not a product")

    result = ProductComponents()
    visited: set[uuid.UUID] = set()

    async def walk(item: ManufacturedItem, stack: tuple[uuid.UUID, ...]) -> None:
        if item.id in stack:
            raise DomainValidationError("Manufactured item recipes contain a cycle")
        if item.id in visited:
            return
        visited.add(item.id)
        try:
            recipe = await _recipe_for_item(session, item)
        except DomainValidationError as error:
            if not item.is_product and "has no active recipe" in str(error):
                return
            raise
        demand = await _recipe_demand(session, recipe, Decimal("1"))
        result.material_ids.update(demand.materials)
        for child_id in demand.items:
            result.manufactured_item_ids.add(child_id)
            child = await session.get(ManufacturedItem, child_id)
            if child is None or child.archived:
                raise DomainValidationError("A recipe references a missing item")
            await walk(child, (*stack, item.id))

    await walk(product, ())
    return result


async def all_product_memberships(
    session: AsyncSession,
) -> tuple[
    dict[uuid.UUID, list[tuple[uuid.UUID, str]]],
    dict[uuid.UUID, list[tuple[uuid.UUID, str]]],
]:
    products = list(
        (
            await session.execute(
                select(ManufacturedItem)
                .where(
                    ManufacturedItem.is_product.is_(True),
                    ManufacturedItem.archived.is_(False),
                )
                .order_by(ManufacturedItem.name)
            )
        )
        .scalars()
        .all()
    )
    materials: dict[uuid.UUID, list[tuple[uuid.UUID, str]]] = {}
    items: dict[uuid.UUID, list[tuple[uuid.UUID, str]]] = {}
    for product in products:
        items.setdefault(product.id, []).append((product.id, product.name))
        try:
            components = await product_components(session, product.id)
        except DomainValidationError:
            continue
        for material_id in components.material_ids:
            materials.setdefault(material_id, []).append((product.id, product.name))
        for item_id in components.manufactured_item_ids:
            items.setdefault(item_id, []).append((product.id, product.name))
    return materials, items
