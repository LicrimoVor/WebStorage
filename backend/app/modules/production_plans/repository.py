import uuid

from sqlalchemy import delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.production_plans.model import (
    ProductionPlan,
    ProductionPlanItemRequirement,
    ProductionPlanMaterialRequirement,
    ProductionPlanOperationRequirement,
)

RequirementRows = tuple[
    list[ProductionPlanMaterialRequirement],
    list[ProductionPlanItemRequirement],
    list[ProductionPlanOperationRequirement],
]


async def list_plans(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    status: str | None,
) -> tuple[list[ProductionPlan], int]:
    statement = select(ProductionPlan)
    if status is not None:
        statement = statement.where(ProductionPlan.status == status)
    total = int(
        (
            await session.execute(
                select(func.count()).select_from(statement.order_by(None).subquery())
            )
        ).scalar_one()
    )
    plans = list(
        (
            await session.execute(
                statement.order_by(desc(ProductionPlan.created_at), desc(ProductionPlan.id))
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        .scalars()
        .all()
    )
    return plans, total


async def get_plan(
    session: AsyncSession, plan_id: uuid.UUID, *, for_update: bool = False
) -> ProductionPlan | None:
    statement = select(ProductionPlan).where(ProductionPlan.id == plan_id)
    if for_update:
        statement = statement.with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def active_plans_for_update(session: AsyncSession) -> list[ProductionPlan]:
    return list(
        (
            await session.execute(
                select(ProductionPlan)
                .where(ProductionPlan.status == "active")
                .order_by(ProductionPlan.created_at, ProductionPlan.id)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )


async def active_plans(session: AsyncSession) -> list[ProductionPlan]:
    return list(
        (
            await session.execute(
                select(ProductionPlan)
                .where(ProductionPlan.status == "active")
                .order_by(ProductionPlan.created_at, ProductionPlan.id)
            )
        )
        .scalars()
        .all()
    )


async def requirements(session: AsyncSession, plan_id: uuid.UUID) -> RequirementRows:
    material_rows = list(
        (
            await session.execute(
                select(ProductionPlanMaterialRequirement)
                .where(ProductionPlanMaterialRequirement.plan_id == plan_id)
                .order_by(ProductionPlanMaterialRequirement.name_snapshot)
            )
        )
        .scalars()
        .all()
    )
    item_rows = list(
        (
            await session.execute(
                select(ProductionPlanItemRequirement)
                .where(ProductionPlanItemRequirement.plan_id == plan_id)
                .order_by(
                    ProductionPlanItemRequirement.is_plan_output.desc(),
                    ProductionPlanItemRequirement.name_snapshot,
                )
            )
        )
        .scalars()
        .all()
    )
    operation_rows = list(
        (
            await session.execute(
                select(ProductionPlanOperationRequirement)
                .where(ProductionPlanOperationRequirement.plan_id == plan_id)
                .order_by(ProductionPlanOperationRequirement.name_snapshot)
            )
        )
        .scalars()
        .all()
    )
    return material_rows, item_rows, operation_rows


async def clear_requirements(session: AsyncSession, plan_ids: list[uuid.UUID]) -> None:
    if not plan_ids:
        return
    for model in (
        ProductionPlanMaterialRequirement,
        ProductionPlanItemRequirement,
        ProductionPlanOperationRequirement,
    ):
        await session.execute(delete(model).where(model.plan_id.in_(plan_ids)))
    await session.flush()
