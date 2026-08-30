import uuid
from decimal import Decimal

from sqlalchemy import false, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, DomainValidationError, NotFoundError
from app.modules.inventory import repository as inventory_repository
from app.modules.inventory.model import InventoryMovement
from app.modules.inventory.types import MovementType
from app.modules.manufactured_items import movement_repository
from app.modules.manufactured_items.model import (
    ManufacturedItem,
    ManufacturedItemMovement,
)
from app.modules.materials.model import Material
from app.modules.warehouse import repository
from app.modules.warehouse.composition import (
    all_product_memberships,
    product_components,
)
from app.modules.warehouse.model import (
    InventoryGroup,
    InventoryGroupManufacturedItem,
    InventoryGroupMaterial,
    StockRevision,
    StockRevisionEntry,
)
from app.modules.warehouse.schemas import (
    InventoryGroupCreate,
    InventoryGroupRead,
    InventoryGroupUpdate,
    StockRevisionCatalogRef,
    StockRevisionCreate,
    StockRevisionEntityType,
    StockRevisionEntryRead,
    StockRevisionRead,
    StockRevisionRow,
)


def _group_read(
    group: InventoryGroup, material_count: int = 0, item_count: int = 0
) -> InventoryGroupRead:
    return InventoryGroupRead(
        id=group.id,
        name=group.name,
        material_count=material_count,
        semi_finished_count=item_count,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


async def list_groups(session: AsyncSession) -> list[InventoryGroupRead]:
    rows = await repository.list_groups_with_counts(session)
    return [_group_read(*row) for row in rows]


async def create_group(
    session: AsyncSession, payload: InventoryGroupCreate
) -> InventoryGroupRead:
    group = InventoryGroup(name=payload.name)
    session.add(group)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("An inventory group with this name already exists") from error
    await session.refresh(group)
    return _group_read(group)


async def update_group(
    session: AsyncSession, group_id: uuid.UUID, payload: InventoryGroupUpdate
) -> InventoryGroupRead:
    group = await session.get(InventoryGroup, group_id)
    if group is None:
        raise NotFoundError("Inventory group was not found")
    group.name = payload.name
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("An inventory group with this name already exists") from error
    await session.refresh(group)
    rows = await repository.list_groups_with_counts(session)
    return next(_group_read(*row) for row in rows if row[0].id == group_id)


async def delete_group(session: AsyncSession, group_id: uuid.UUID) -> None:
    group = await session.get(InventoryGroup, group_id)
    if group is None:
        raise NotFoundError("Inventory group was not found")
    await session.delete(group)
    await session.commit()


async def list_revision_rows(
    session: AsyncSession,
    *,
    search: str | None,
    entity_type: StockRevisionEntityType | None,
    product_id: uuid.UUID | None,
    group_id: uuid.UUID | None,
) -> list[StockRevisionRow]:
    component_material_ids: set[uuid.UUID] | None = None
    component_item_ids: set[uuid.UUID] | None = None
    if product_id is not None:
        components = await product_components(session, product_id)
        component_material_ids = components.material_ids
        component_item_ids = {*components.manufactured_item_ids, product_id}

    material_balance = (
        select(func.coalesce(func.sum(InventoryMovement.quantity), Decimal("0")))
        .where(InventoryMovement.material_id == Material.id)
        .correlate(Material)
        .scalar_subquery()
    )
    item_balance = (
        select(func.coalesce(func.sum(ManufacturedItemMovement.quantity), Decimal("0")))
        .where(ManufacturedItemMovement.manufactured_item_id == ManufacturedItem.id)
        .correlate(ManufacturedItem)
        .scalar_subquery()
    )
    material_statement = select(Material, material_balance).where(Material.archived.is_(False))
    item_statement = select(ManufacturedItem, item_balance).where(
        ManufacturedItem.archived.is_(False)
    )
    if search:
        material_statement = material_statement.where(Material.name.ilike(f"%{search.strip()}%"))
        item_statement = item_statement.where(
            ManufacturedItem.name.ilike(f"%{search.strip()}%")
        )
    if component_material_ids is not None:
        material_statement = material_statement.where(Material.id.in_(component_material_ids))
        item_statement = item_statement.where(ManufacturedItem.id.in_(component_item_ids or set()))
    if group_id is not None:
        material_statement = material_statement.join(
            InventoryGroupMaterial,
            InventoryGroupMaterial.material_id == Material.id,
        ).where(InventoryGroupMaterial.group_id == group_id)
        item_statement = item_statement.join(
            InventoryGroupManufacturedItem,
            InventoryGroupManufacturedItem.manufactured_item_id == ManufacturedItem.id,
        ).where(InventoryGroupManufacturedItem.group_id == group_id)

    if entity_type == StockRevisionEntityType.MATERIAL:
        item_statement = item_statement.where(false())
    elif entity_type == StockRevisionEntityType.SEMI_FINISHED:
        material_statement = material_statement.where(false())
        item_statement = item_statement.where(ManufacturedItem.is_product.is_(False))
    elif entity_type == StockRevisionEntityType.PRODUCT:
        material_statement = material_statement.where(false())
        item_statement = item_statement.where(ManufacturedItem.is_product.is_(True))

    material_rows = (await session.execute(material_statement.order_by(Material.name))).all()
    item_rows = (await session.execute(item_statement.order_by(ManufacturedItem.name))).all()
    material_groups = await repository.material_group_map(
        session, (row[0].id for row in material_rows)
    )
    item_groups = await repository.item_group_map(session, (row[0].id for row in item_rows))
    material_products, item_products = await all_product_memberships(session)

    rows: list[StockRevisionRow] = []
    for material, balance in material_rows:
        rows.append(
            StockRevisionRow(
                id=material.id,
                type=StockRevisionEntityType.MATERIAL,
                name=material.name,
                image=material.image,
                unit=material.unit,
                products=[
                    StockRevisionCatalogRef(id=ref_id, name=name)
                    for ref_id, name in material_products.get(material.id, [])
                ],
                groups=material_groups.get(material.id, []),
                current_quantity=Decimal(balance),
            )
        )
    for item, balance in item_rows:
        rows.append(
            StockRevisionRow(
                id=item.id,
                type=(
                    StockRevisionEntityType.PRODUCT
                    if item.is_product
                    else StockRevisionEntityType.SEMI_FINISHED
                ),
                name=item.name,
                image=item.image,
                unit=item.unit,
                products=[
                    StockRevisionCatalogRef(id=ref_id, name=name)
                    for ref_id, name in item_products.get(item.id, [])
                ],
                groups=item_groups.get(item.id, []),
                current_quantity=Decimal(balance),
            )
        )
    return sorted(rows, key=lambda row: (row.name.casefold(), row.type.value, str(row.id)))


async def create_revision(
    session: AsyncSession,
    payload: StockRevisionCreate,
    *,
    created_by: str,
) -> StockRevisionRead:
    revision = StockRevision(created_by=created_by, comment=payload.comment)
    session.add(revision)
    await session.flush()
    reads: list[StockRevisionEntryRead] = []
    try:
        for requested in sorted(payload.entries, key=lambda row: (row.type.value, str(row.id))):
            if requested.type == StockRevisionEntityType.MATERIAL:
                material = await session.get(Material, requested.id, with_for_update=True)
                if material is None or material.archived:
                    raise NotFoundError("Material was not found")
                current = Decimal(
                    (
                        await session.execute(
                            select(
                                func.coalesce(
                                    func.sum(InventoryMovement.quantity), Decimal("0")
                                )
                            ).where(InventoryMovement.material_id == requested.id)
                        )
                    ).scalar_one()
                )
                adjustment = requested.counted_quantity - current
                if adjustment:
                    await inventory_repository.create_movement(
                        session,
                        material_id=requested.id,
                        movement_type=MovementType.ADJUSTMENT,
                        quantity=adjustment,
                        comment=payload.comment or "Stock revision",
                        source_type="stock_revision",
                        source_id=revision.id,
                    )
                entry = StockRevisionEntry(
                    revision_id=revision.id,
                    entity_type=requested.type.value,
                    material_id=requested.id,
                    manufactured_item_id=None,
                    balance_before=current,
                    counted_quantity=requested.counted_quantity,
                    adjustment=adjustment,
                )
            else:
                item = await session.get(
                    ManufacturedItem, requested.id, with_for_update=True
                )
                if item is None or item.archived:
                    raise NotFoundError("Manufactured item was not found")
                expected_product = requested.type == StockRevisionEntityType.PRODUCT
                if item.is_product != expected_product:
                    raise DomainValidationError("Revision item type does not match the catalog")
                current = Decimal(
                    (
                        await session.execute(
                            select(
                                func.coalesce(
                                    func.sum(ManufacturedItemMovement.quantity), Decimal("0")
                                )
                            ).where(
                                ManufacturedItemMovement.manufactured_item_id == requested.id
                            )
                        )
                    ).scalar_one()
                )
                adjustment = requested.counted_quantity - current
                if adjustment:
                    await movement_repository.create_movement(
                        session,
                        item_id=requested.id,
                        movement_type=MovementType.ADJUSTMENT,
                        quantity=adjustment,
                        comment=payload.comment or "Stock revision",
                        source_type="stock_revision",
                        source_id=revision.id,
                    )
                entry = StockRevisionEntry(
                    revision_id=revision.id,
                    entity_type=requested.type.value,
                    material_id=None,
                    manufactured_item_id=requested.id,
                    balance_before=current,
                    counted_quantity=requested.counted_quantity,
                    adjustment=adjustment,
                )
            session.add(entry)
            reads.append(
                StockRevisionEntryRead(
                    id=requested.id,
                    type=requested.type,
                    counted_quantity=requested.counted_quantity,
                    balance_before=current,
                    adjustment=adjustment,
                )
            )
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    await session.refresh(revision)
    return StockRevisionRead(
        id=revision.id,
        created_by=revision.created_by,
        comment=revision.comment,
        created_at=revision.created_at,
        entries=reads,
    )
