import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ProblemDetail
from app.core.security import Actor, get_current_actor
from app.modules.production_plans import service
from app.modules.production_plans.schemas import (
    ProductionPlanCreate,
    ProductionPlanList,
    ProductionPlanRead,
    ProductionPlanRecalculate,
    ProductionPlanStatus,
    ProductionPlanSummary,
    ProductionPlanUpdate,
)

router = APIRouter(
    prefix="/production-plans",
    tags=["production plans"],
    responses={422: {"model": ProblemDetail}},
)
Session = Annotated[AsyncSession, Depends(get_session)]
ActorDependency = Annotated[Actor, Depends(get_current_actor)]


@router.post(
    "",
    response_model=ProductionPlanRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createProductionPlan",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def create_production_plan(
    payload: ProductionPlanCreate, session: Session, actor: ActorDependency
) -> ProductionPlanRead:
    return await service.create(session, payload, created_by=actor.subject)


@router.get("", response_model=ProductionPlanList, operation_id="listProductionPlans")
async def list_production_plans(
    session: Session,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status_filter: Annotated[ProductionPlanStatus | None, Query(alias="status")] = None,
) -> ProductionPlanList:
    return await service.list_all(
        session,
        page=page,
        page_size=page_size,
        status=status_filter,
    )


@router.get(
    "/summary",
    response_model=ProductionPlanSummary,
    operation_id="getProductionPlanSummary",
)
async def get_production_plan_summary(session: Session) -> ProductionPlanSummary:
    return await service.summary(session)


@router.get(
    "/{plan_id}",
    response_model=ProductionPlanRead,
    operation_id="getProductionPlan",
    responses={404: {"model": ProblemDetail}},
)
async def get_production_plan(plan_id: uuid.UUID, session: Session) -> ProductionPlanRead:
    return await service.get(session, plan_id)


@router.patch(
    "/{plan_id}",
    response_model=ProductionPlanRead,
    operation_id="updateProductionPlan",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def update_production_plan(
    plan_id: uuid.UUID, payload: ProductionPlanUpdate, session: Session
) -> ProductionPlanRead:
    return await service.update(session, plan_id, payload)


@router.post(
    "/{plan_id}/recalculate",
    response_model=ProductionPlanRead,
    operation_id="recalculateProductionPlan",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def recalculate_production_plan(
    plan_id: uuid.UUID,
    payload: ProductionPlanRecalculate,
    session: Session,
) -> ProductionPlanRead:
    return await service.recalculate(session, plan_id, payload)
