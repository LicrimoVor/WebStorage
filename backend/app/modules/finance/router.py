import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ProblemDetail
from app.core.query import SortOrder
from app.core.security import Actor, Role, get_current_actor, require_any_role
from app.modules.finance import service
from app.modules.finance.schemas import (
    FinanceEntryList,
    FinanceSource,
    FinanceSummary,
    FinancialDirection,
    FinancialTransactionCreate,
    FinancialTransactionRead,
)

router = APIRouter(
    prefix="/finance",
    tags=["finance"],
    responses={422: {"model": ProblemDetail}},
)
Session = Annotated[AsyncSession, Depends(get_session)]
ActorDependency = Annotated[Actor, Depends(get_current_actor)]


@router.post(
    "/transactions",
    response_model=FinancialTransactionRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createFinancialTransaction",
)
async def create_financial_transaction(
    payload: FinancialTransactionCreate,
    session: Session,
    actor: ActorDependency,
) -> FinancialTransactionRead:
    require_any_role(actor, Role.FINANCE)
    return await service.create_manual_transaction(
        session, payload=payload, created_by=actor.subject
    )


@router.get("/entries", response_model=FinanceEntryList, operation_id="listFinanceEntries")
async def list_finance_entries(
    session: Session,
    actor: ActorDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    source: FinanceSource = FinanceSource.ALL,
    direction: FinancialDirection | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort_order: SortOrder = SortOrder.DESC,
    funding_source_id: uuid.UUID | None = None,
) -> FinanceEntryList:
    require_any_role(actor, Role.FINANCE, Role.MANAGER)
    return await service.list_entries(
        session,
        page=page,
        page_size=page_size,
        source=source,
        direction=direction,
        date_from=date_from,
        date_to=date_to,
        sort_order=sort_order,
        funding_source_id=funding_source_id,
    )


@router.get("/summary", response_model=FinanceSummary, operation_id="getFinanceSummary")
async def get_finance_summary(
    session: Session,
    actor: ActorDependency,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    funding_source_id: uuid.UUID | None = None,
) -> FinanceSummary:
    require_any_role(actor, Role.FINANCE, Role.MANAGER)
    return await service.get_summary(
        session, date_from=date_from, date_to=date_to, funding_source_id=funding_source_id
    )
