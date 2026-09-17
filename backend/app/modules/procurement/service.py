from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.core.errors import DomainValidationError
from app.modules.materials.model import Material
from app.modules.materials.repository import balance_expression, required_expression
from app.modules.procurement.schemas import ProcurementItemRead, ProcurementList
from app.modules.production_plans.model import ProductionPlan, ProductionPlanMaterialRequirement


def procurement_query(search: str | None = None) -> Select[Any]:
    plans = (
        select(
            ProductionPlanMaterialRequirement.material_id,
            func.min(ProductionPlan.target_date).label("target_date"),
            func.count(ProductionPlan.id).label("active_plans"),
        )
        .join(ProductionPlan, ProductionPlan.id == ProductionPlanMaterialRequirement.plan_id)
        .where(ProductionPlan.status == "active")
        .group_by(ProductionPlanMaterialRequirement.material_id).subquery()
    )
    stock = balance_expression()
    required = required_expression()
    deficit = required - stock
    statement = select(
        Material.id.label("material_id"), Material.name, Material.unit,
        required.label("required_quantity"), stock.label("stock_quantity"),
        deficit.label("purchase_quantity"), Material.price.label("unit_price"),
        func.round(deficit * Material.price, 2).label("estimated_cost"),
        plans.c.target_date, plans.c.active_plans, Material.url, Material.archived,
    ).join(plans, plans.c.material_id == Material.id).where(deficit > 0)
    if search and search.strip():
        statement = statement.where(Material.name.ilike(f"%{search.strip()}%"))
    return statement


async def list_procurement(
    session: AsyncSession, *, page: int, page_size: int, search: str | None,
) -> ProcurementList:
    rows = procurement_query(search).subquery()
    summary = (await session.execute(select(
        func.count(), func.coalesce(func.sum(rows.c.estimated_cost), Decimal("0")),
        func.count().filter(rows.c.unit_price.is_(None)),
    ).select_from(rows))).one()
    data = (await session.execute(
        select(rows).order_by(
            rows.c.target_date.asc().nulls_last(), rows.c.name, rows.c.material_id,
        )
        .offset((page - 1) * page_size).limit(page_size)
    )).mappings().all()
    total = int(summary[0])
    return ProcurementList(
        items=[ProcurementItemRead.model_validate(row) for row in data], page=page,
        page_size=page_size, total=total, pages=(total + page_size - 1) // page_size,
        known_cost=summary[1], unpriced_positions=summary[2], generated_at=datetime.now(UTC),
    )


async def export_rows(
    session: AsyncSession, search: str | None,
) -> list[dict[str, object | None]]:
    rows = procurement_query(search).subquery()
    data = (await session.execute(
        select(rows).order_by(
            rows.c.target_date.asc().nulls_last(), rows.c.name, rows.c.material_id,
        )
        .limit(100_001)
    )).mappings().all()
    if len(data) > 100_000:
        raise DomainValidationError("Too many procurement rows; narrow the search")
    return [dict(row) for row in data]
