from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import DomainValidationError
from app.core.security import Actor, Role, get_current_actor, require_any_role
from app.modules.audit.model import AuditEvent
from app.modules.audit.schemas import AuditEventList, AuditEventRead

router = APIRouter(prefix="/audit-events", tags=["audit"])


@router.get("", response_model=AuditEventList, operation_id="listAuditEvents")
async def list_events(
    session: Annotated[AsyncSession, Depends(get_session)],
    actor: Annotated[Actor, Depends(get_current_actor)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    through_id: Annotated[int | None, Query(ge=0)] = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    action: Literal["insert", "update", "delete", "request"] | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> AuditEventList:
    require_any_role(actor, Role.ADMIN)
    if any(value is not None and value.tzinfo is None for value in (date_from, date_to)):
        raise DomainValidationError("Audit dates must include a timezone")
    if date_from and date_to and date_from > date_to:
        raise DomainValidationError("date_from must not be after date_to")
    if through_id is None:
        through_id = int((await session.execute(
            select(func.coalesce(func.max(AuditEvent.id), 0))
        )).scalar_one())
    statement = select(AuditEvent).where(AuditEvent.id <= through_id)
    if search and search.strip():
        value = f"%{search.strip()}%"
        statement = statement.where(
            AuditEvent.actor.ilike(value) | AuditEvent.entity.ilike(value)
            | AuditEvent.entity_id.ilike(value) | AuditEvent.request_id.ilike(value)
        )
    if action:
        statement = statement.where(AuditEvent.action == action)
    if date_from:
        statement = statement.where(AuditEvent.created_at >= date_from)
    if date_to:
        statement = statement.where(AuditEvent.created_at <= date_to)
    total = int((await session.execute(
        select(func.count()).select_from(statement.subquery())
    )).scalar_one())
    rows = (await session.execute(
        statement.order_by(AuditEvent.id.desc()).offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    return AuditEventList(
        through_id=through_id,
        items=[AuditEventRead.model_validate(row) for row in rows], page=page,
        page_size=page_size, total=total, pages=(total + page_size - 1) // page_size,
    )
