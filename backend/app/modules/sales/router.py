import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ProblemDetail
from app.core.query import SortOrder
from app.core.security import Actor, Role, get_current_actor, require_any_role
from app.modules.sales import service
from app.modules.sales.schemas import SaleCreate, SaleList, SaleRead, SaleSortField, SaleSummary

router = APIRouter(
    prefix="/sales", tags=["sales"], responses={422: {"model": ProblemDetail}}
)
Session = Annotated[AsyncSession, Depends(get_session)]
ActorDependency = Annotated[Actor, Depends(get_current_actor)]
IdempotencyKey = Annotated[
    str,
    Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=100,
        description="Stable unique key for a retried sale command",
    ),
]


@router.post(
    "",
    response_model=SaleRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="registerSale",
    responses={404: {"model": ProblemDetail}, 409: {"model": ProblemDetail}},
)
async def register_sale(
    payload: SaleCreate,
    session: Session,
    actor: ActorDependency,
    idempotency_key: IdempotencyKey,
) -> SaleRead:
    require_any_role(actor, Role.FINANCE)
    return await service.register(
        session,
        payload=payload,
        idempotency_key=idempotency_key,
        created_by=actor.subject,
    )


@router.get("", response_model=SaleList, operation_id="listSales")
async def list_sales(
    session: Session,
    actor: ActorDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    product_id: uuid.UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort_by: SaleSortField = SaleSortField.SOLD_AT,
    sort_order: SortOrder = SortOrder.DESC,
) -> SaleList:
    require_any_role(actor, Role.FINANCE, Role.MANAGER)
    return await service.list_all(
        session,
        page=page,
        page_size=page_size,
        product_id=product_id,
        date_from=date_from,
        date_to=date_to,
        sort_by=sort_by,
        sort_order=sort_order,
    )


@router.get("/summary", response_model=SaleSummary, operation_id="getSalesSummary")
async def get_sales_summary(
    session: Session,
    actor: ActorDependency,
    product_id: uuid.UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> SaleSummary:
    require_any_role(actor, Role.FINANCE, Role.MANAGER)
    return await service.get_summary(
        session, product_id=product_id, date_from=date_from, date_to=date_to
    )
