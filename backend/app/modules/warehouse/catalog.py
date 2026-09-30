import math
import uuid
from typing import Annotated, Literal

from fastapi import Depends, Query
from sqlalchemy import Numeric, cast, func, literal, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.query import AvailabilityFilter, SortOrder
from app.modules.manufactured_items import repository as items
from app.modules.manufactured_items.model import ManufacturedItem
from app.modules.manufactured_items.service import to_read_model as item_read
from app.modules.materials import repository as materials
from app.modules.materials.model import Material
from app.modules.materials.schemas import MaterialList, MaterialRead, MaterialSortField
from app.modules.materials.service import to_read_model as material_read
from app.modules.warehouse import repository as groups
from app.modules.warehouse.composition import product_components
from app.modules.warehouse.model import (
    InventoryGroup,
    InventoryGroupManufacturedItem,
    InventoryGroupMaterial,
)


class CatalogRow(MaterialRead):
    kind: Literal["material", "semi_finished", "product"]


class CatalogList(MaterialList):
    items: list[CatalogRow]  # type: ignore[assignment]


async def catalog(
    session: Annotated[AsyncSession, Depends(get_session)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, max_length=200),
    kind: Literal["all", "semi_finished", "product"] = "all",
    group_id: uuid.UUID | None = None,
    ungrouped: bool = False,
    product_id: uuid.UUID | None = None,
    availability: AvailabilityFilter = AvailabilityFilter.ALL,
    deficit_only: bool = False,
    sort_by: MaterialSortField = MaterialSortField.NAME,
    sort_order: SortOrder = SortOrder.ASC,
) -> CatalogList:
    material_query = select(
        Material.id,
        literal("material").label("kind"),
        Material.name,
        materials.balance_expression().label("balance"),
        materials.required_expression().label("required"),
        Material.price,
        Material.created_at,
    ).where(Material.archived.is_(False))
    from sqlalchemy import case

    item_query = select(
        ManufacturedItem.id,
        case((ManufacturedItem.is_product, "product"), else_="semi_finished").label("kind"),
        ManufacturedItem.name,
        items.balance_expression().label("balance"),
        items.required_expression().label("required"),
        cast(literal(None), Numeric(20, 2)).label("price"),
        ManufacturedItem.created_at,
    ).where(ManufacturedItem.archived.is_(False))
    item_query = item_query.where(
        (ManufacturedItem.is_product | ManufacturedItem.is_byproduct)
        if kind == "product"
        else ManufacturedItem.is_product.is_(False)
    )
    if ungrouped and kind != "product":
        material_query = material_query.where(
            ~select(InventoryGroupMaterial.material_id)
            .where(InventoryGroupMaterial.material_id == Material.id)
            .exists()
        )
        item_query = item_query.where(
            ~select(InventoryGroupManufacturedItem.manufactured_item_id)
            .where(InventoryGroupManufacturedItem.manufactured_item_id == ManufacturedItem.id)
            .exists()
        )
    elif group_id and kind != "product":
        group_ids = select(InventoryGroup.id).where(
            (InventoryGroup.id == group_id) | (InventoryGroup.parent_id == group_id)
        )
        material_query = material_query.where(
            Material.id.in_(
                select(InventoryGroupMaterial.material_id).where(
                    InventoryGroupMaterial.group_id.in_(group_ids)
                )
            )
        )
        item_query = item_query.where(
            ManufacturedItem.id.in_(
                select(InventoryGroupManufacturedItem.manufactured_item_id).where(
                    InventoryGroupManufacturedItem.group_id.in_(group_ids)
                )
            )
        )
    if product_id and kind != "product":
        components = await product_components(session, product_id)
        material_query = material_query.where(Material.id.in_(components.material_ids))
        item_query = item_query.where(ManufacturedItem.product_id == product_id)
    rows = (
        union_all(material_query, item_query).subquery() if kind == "all" else item_query.subquery()
    )
    statement = select(rows)
    if search:
        statement = statement.where(rows.c.name.ilike(f"%{search.strip()}%"))
    if availability == AvailabilityFilter.IN_STOCK:
        statement = statement.where(rows.c.balance > 0)
    elif availability == AvailabilityFilter.OUT_OF_STOCK:
        statement = statement.where(rows.c.balance <= 0)
    if deficit_only:
        statement = statement.where(rows.c.required > rows.c.balance)
    total = int((await session.scalar(select(func.count()).select_from(statement.subquery()))) or 0)
    ordering = {
        "name": func.lower(rows.c.name),
        "free_quantity": rows.c.balance,
        "price": rows.c.price,
        "created_at": rows.c.created_at,
    }[sort_by]
    selected = (
        await session.execute(
            statement.order_by(
                ordering.asc().nulls_last()
                if sort_order == SortOrder.ASC
                else ordering.desc().nulls_last(),
                rows.c.id,
                rows.c.kind,
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    mids = [r.id for r in selected if r.kind == "material"]
    iids = [r.id for r in selected if r.kind != "material"]
    material_map = {
        m.id: m for m in await session.scalars(select(Material).where(Material.id.in_(mids)))
    }
    item_map = {
        m.id: m
        for m in await session.scalars(
            select(ManufacturedItem).where(ManufacturedItem.id.in_(iids))
        )
    }
    material_groups = await groups.material_group_map(session, mids)
    item_groups = await groups.item_group_map(session, iids)
    result = []
    for row in selected:
        if row.kind == "material":
            data = material_read(
                material_map[row.id], row.balance, row.required, material_groups.get(row.id, [])
            ).model_dump()
        else:
            data = item_read(
                item_map[row.id], row.balance, row.required, item_groups.get(row.id, [])
            ).model_dump()
            data.update(price=None, url=None, deficit_quantity=data["to_produce_quantity"])
        result.append(CatalogRow(kind=row.kind, **data))
    return CatalogList(
        items=result,
        page=page,
        page_size=page_size,
        total=total,
        pages=math.ceil(total / page_size) if total else 0,
    )
