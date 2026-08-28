import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ProblemDetail
from app.core.security import Actor, get_current_actor
from app.modules.production import service
from app.modules.production.schemas import (
    ProductionRecordCreate,
    ProductionRecordList,
    ProductionRecordRead,
)

router = APIRouter(
    prefix="/production-plans",
    tags=["production execution"],
    responses={422: {"model": ProblemDetail}},
)
Session = Annotated[AsyncSession, Depends(get_session)]
ActorDependency = Annotated[Actor, Depends(get_current_actor)]
IdempotencyKey = Annotated[
    str,
    Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=100,
        description="Stable unique key for a retried production command",
    ),
]


@router.post(
    "/{plan_id}/production-records",
    response_model=ProductionRecordRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="registerProduction",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def register_production(
    plan_id: uuid.UUID,
    payload: ProductionRecordCreate,
    session: Session,
    actor: ActorDependency,
    idempotency_key: IdempotencyKey,
) -> ProductionRecordRead:
    return await service.register(
        session,
        plan_id=plan_id,
        payload=payload,
        idempotency_key=idempotency_key,
        created_by=actor.subject,
    )


@router.get(
    "/{plan_id}/production-records",
    response_model=ProductionRecordList,
    operation_id="listProductionRecords",
    responses={404: {"model": ProblemDetail}},
)
async def list_production_records(
    plan_id: uuid.UUID,
    session: Session,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ProductionRecordList:
    return await service.list_for_plan(
        session, plan_id=plan_id, page=page, page_size=page_size
    )
