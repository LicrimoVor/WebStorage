import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import Actor, Role, get_current_actor, require_any_role
from app.modules.trash import service
from app.modules.trash.model import TrashEntry

router = APIRouter(prefix="/trash", tags=["trash"])
Session = Annotated[AsyncSession, Depends(get_session)]
CurrentActor = Annotated[Actor, Depends(get_current_actor)]


class TrashRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    name: str
    deleted_by: str
    deleted_at: datetime


class TrashList(BaseModel):
    items: list[TrashRead]
    total: int


@router.get("", response_model=TrashList)
async def list_trash(
    session: Session,
    actor: CurrentActor,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> TrashList:
    require_any_role(actor, Role.ADMIN)
    statement = select(TrashEntry).where(
        TrashEntry.restored_at.is_(None), TrashEntry.purged_at.is_(None)
    )
    total = await session.scalar(select(func.count()).select_from(statement.subquery()))
    entries = await session.scalars(
        statement.order_by(
            TrashEntry.deleted_at.desc(),
            TrashEntry.id,
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return TrashList(items=[TrashRead.model_validate(e) for e in entries], total=total or 0)


@router.delete("/{entity_type}/{entity_id}", status_code=204)
async def delete_entity(
    entity_type: str, entity_id: uuid.UUID, session: Session, actor: CurrentActor
) -> Response:
    require_any_role(actor, Role.ADMIN)
    await service.move_to_trash(session, entity_type, entity_id, actor.subject)
    await session.commit()
    return Response(status_code=204)


@router.post("/{entry_id}/restore", status_code=204)
async def restore_entry(entry_id: uuid.UUID, session: Session, actor: CurrentActor) -> Response:
    require_any_role(actor, Role.ADMIN)
    await service.restore(session, entry_id, actor.subject)
    return Response(status_code=204)


@router.delete("/{entry_id}", status_code=204)
async def purge_entry(entry_id: uuid.UUID, session: Session, actor: CurrentActor) -> Response:
    require_any_role(actor, Role.ADMIN)
    await service.purge(session, entry_id)
    return Response(status_code=204)
