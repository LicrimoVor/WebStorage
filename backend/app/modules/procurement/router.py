from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import Actor, Role, get_current_actor, require_any_role
from app.modules.procurement.schemas import ProcurementList
from app.modules.procurement.service import list_procurement

router = APIRouter(prefix="/procurement", tags=["procurement"])


@router.get("", response_model=ProcurementList, operation_id="listProcurement")
async def get_procurement(
    session: Annotated[AsyncSession, Depends(get_session)],
    actor: Annotated[Actor, Depends(get_current_actor)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    search: Annotated[str | None, Query(max_length=200)] = None,
) -> ProcurementList:
    require_any_role(actor, Role.WAREHOUSE, Role.MANAGER, Role.FINANCE)
    return await list_procurement(session, page=page, page_size=page_size, search=search)
