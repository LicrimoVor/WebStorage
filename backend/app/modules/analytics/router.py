from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ProblemDetail
from app.core.security import Actor, Role, get_current_actor, require_any_role
from app.modules.analytics import service
from app.modules.analytics.schemas import AnalyticsBucket, AnalyticsDashboardRead

router = APIRouter(
    prefix="/analytics",
    tags=["analytics"],
    responses={422: {"model": ProblemDetail}},
)
Session = Annotated[AsyncSession, Depends(get_session)]
ActorDependency = Annotated[Actor, Depends(get_current_actor)]


@router.get(
    "/dashboard",
    response_model=AnalyticsDashboardRead,
    operation_id="getAnalyticsDashboard",
)
async def get_analytics_dashboard(
    session: Session,
    actor: ActorDependency,
    date_from: Annotated[datetime, Query()],
    date_to: Annotated[datetime, Query()],
    bucket: AnalyticsBucket = AnalyticsBucket.DAY,
) -> AnalyticsDashboardRead:
    require_any_role(actor, Role.MANAGER, Role.FINANCE)
    return await service.get_dashboard(
        session,
        date_from=date_from,
        date_to=date_to,
        bucket=bucket,
    )
