import uuid
from decimal import Decimal

from sqlalchemy import Select, asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.query import AvailabilityFilter, SortOrder
from app.modules.inventory.model import InventoryMovement
from app.modules.materials.model import Material
from app.modules.materials.schemas import MaterialSortField
from app.modules.production_plans.model import (
    ProductionPlan,
    ProductionPlanMaterialRequirement,
)
from app.modules.warehouse.model import InventoryGroup, InventoryGroupMaterial


def balance_expression() -> ColumnElement[Decimal]:
    return (
        select(func.coalesce(func.sum(InventoryMovement.quantity), Decimal("0")))
        .where(InventoryMovement.material_id == Material.id)
        .correlate(Material)
        .scalar_subquery()
    )


def required_expression() -> ColumnElement[Decimal]:
    return (
        select(
            func.coalesce(
                func.sum(ProductionPlanMaterialRequirement.required_quantity),
                Decimal("0"),
            )
        )
        .join(
            ProductionPlan,
            ProductionPlan.id == ProductionPlanMaterialRequirement.plan_id,
        )
        .where(
            ProductionPlanMaterialRequirement.material_id == Material.id,
            ProductionPlan.status == "active",
        )
        .correlate(Material)
        .scalar_subquery()
    )


def _apply_filters(
    statement: Select[tuple[Material]],
    *,
    search: str | None,
    include_archived: bool,
    availability: AvailabilityFilter,
    deficit_only: bool,
    allowed_ids: set[uuid.UUID] | None,
    group_id: uuid.UUID | None,
) -> Select[tuple[Material]]:
    if not include_archived:
        statement = statement.where(Material.archived.is_(False))
    if search:
        statement = statement.where(Material.name.ilike(f"%{search.strip()}%"))
    if allowed_ids is not None:
        statement = statement.where(Material.id.in_(allowed_ids))
    if group_id is not None:
        statement = statement.where(
            Material.id.in_(
                select(InventoryGroupMaterial.material_id).where(
                    InventoryGroupMaterial.group_id.in_(
                        select(InventoryGroup.id).where(
                            (InventoryGroup.id == group_id) | (InventoryGroup.parent_id == group_id)
                        )
                    )
                )
            )
        )

    balance = balance_expression()
    if availability == AvailabilityFilter.IN_STOCK:
        statement = statement.where(balance > 0)
    elif availability == AvailabilityFilter.OUT_OF_STOCK:
        statement = statement.where(balance <= 0)
    if deficit_only:
        statement = statement.where(required_expression() > balance)
    return statement


async def list_materials(
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
    allowed_ids: set[uuid.UUID] | None = None,
    group_id: uuid.UUID | None = None,
) -> tuple[list[tuple[Material, Decimal, Decimal]], int]:
    balance = balance_expression().label("free_quantity")
    required = required_expression().label("required_quantity")
    statement = _apply_filters(
        select(Material),
        search=search,
        include_archived=include_archived,
        availability=availability,
        deficit_only=deficit_only,
        allowed_ids=allowed_ids,
        group_id=group_id,
    )
    count_statement = select(func.count()).select_from(statement.order_by(None).subquery())
    total = int((await session.execute(count_statement)).scalar_one())

    order_columns = {
        MaterialSortField.NAME: func.lower(Material.name),
        MaterialSortField.FREE_QUANTITY: balance,
        MaterialSortField.PRICE: Material.price,
        MaterialSortField.CREATED_AT: Material.created_at,
    }
    direction = asc if sort_order == SortOrder.ASC else desc
    data_statement = statement.add_columns(balance, required).order_by(
        direction(order_columns[sort_by]), asc(Material.id)
    )
    data_statement = data_statement.offset((page - 1) * page_size).limit(page_size)
    rows = (await session.execute(data_statement)).all()
    return [(row[0], Decimal(row[1]), Decimal(row[2])) for row in rows], total


async def get_material_with_balance(
    session: AsyncSession, material_id: uuid.UUID
) -> tuple[Material, Decimal, Decimal] | None:
    balance = balance_expression().label("free_quantity")
    required = required_expression().label("required_quantity")
    statement = select(Material, balance, required).where(Material.id == material_id)
    row = (await session.execute(statement)).one_or_none()
    if row is None:
        return None
    return row[0], Decimal(row[1]), Decimal(row[2])


async def get_material_for_update(session: AsyncSession, material_id: uuid.UUID) -> Material | None:
    statement = select(Material).where(Material.id == material_id).with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def create_material(session: AsyncSession, material: Material) -> Material:
    session.add(material)
    await session.flush()
    return material
