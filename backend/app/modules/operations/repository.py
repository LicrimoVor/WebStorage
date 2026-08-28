import uuid
from decimal import Decimal

from sqlalchemy import asc, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.query import SortOrder
from app.modules.operations.model import Operation
from app.modules.operations.schemas import OperationSortField
from app.modules.production_plans.model import (
    ProductionPlan,
    ProductionPlanOperationRequirement,
)


def required_expression() -> ColumnElement[Decimal]:
    return (
        select(
            func.coalesce(
                func.sum(ProductionPlanOperationRequirement.required_quantity),
                Decimal("0"),
            )
        )
        .join(
            ProductionPlan,
            ProductionPlan.id == ProductionPlanOperationRequirement.plan_id,
        )
        .where(
            ProductionPlanOperationRequirement.operation_id == Operation.id,
            ProductionPlan.status == "active",
        )
        .correlate(Operation)
        .scalar_subquery()
    )


def required_time_expression() -> ColumnElement[Decimal | None]:
    return (
        select(
            func.coalesce(
                func.sum(ProductionPlanOperationRequirement.required_time_minutes),
                Decimal("0"),
            )
        )
        .join(
            ProductionPlan,
            ProductionPlan.id == ProductionPlanOperationRequirement.plan_id,
        )
        .where(
            ProductionPlanOperationRequirement.operation_id == Operation.id,
            ProductionPlan.status == "active",
        )
        .correlate(Operation)
        .scalar_subquery()
    )


async def list_operations(
    session: AsyncSession,
    *,
    page: int,
    page_size: int,
    search: str | None,
    include_archived: bool,
    sort_by: OperationSortField,
    sort_order: SortOrder,
) -> tuple[list[tuple[Operation, Decimal, Decimal]], int]:
    statement = select(Operation)
    if not include_archived:
        statement = statement.where(Operation.archived.is_(False))
    if search:
        statement = statement.where(Operation.name.ilike(f"%{search.strip()}%"))
    total = int(
        (
            await session.execute(
                select(func.count()).select_from(statement.order_by(None).subquery())
            )
        ).scalar_one()
    )
    order_columns = {
        OperationSortField.NAME: func.lower(Operation.name),
        OperationSortField.TIME_NORM: Operation.time_norm,
        OperationSortField.PRICE_PER_OPERATION: Operation.price_per_operation,
        OperationSortField.CREATED_AT: Operation.created_at,
    }
    direction = asc if sort_order == SortOrder.ASC else desc
    statement = statement.order_by(
        direction(order_columns[sort_by]).nulls_last(), asc(Operation.id)
    )
    statement = (
        statement.add_columns(
            required_expression().label("required_quantity"),
            required_time_expression().label("required_time_minutes"),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await session.execute(statement)).all()
    return [(row[0], Decimal(row[1]), Decimal(row[2])) for row in rows], total


async def get_operation(
    session: AsyncSession, operation_id: uuid.UUID, *, for_update: bool = False
) -> Operation | None:
    statement = select(Operation).where(Operation.id == operation_id)
    if for_update:
        statement = statement.with_for_update()
    return (await session.execute(statement)).scalar_one_or_none()


async def get_operation_with_projection(
    session: AsyncSession, operation_id: uuid.UUID
) -> tuple[Operation, Decimal, Decimal] | None:
    statement = (
        select(
            Operation,
            required_expression().label("required_quantity"),
            required_time_expression().label("required_time_minutes"),
        )
        .where(Operation.id == operation_id)
    )
    row = (await session.execute(statement)).one_or_none()
    if row is None:
        return None
    return row[0], Decimal(row[1]), Decimal(row[2])


async def create_operation(session: AsyncSession, operation: Operation) -> Operation:
    session.add(operation)
    await session.flush()
    return operation
