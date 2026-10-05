import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ConflictError, DomainValidationError, NotFoundError
from app.core.security import Actor, Role, get_current_actor, require_any_role
from app.modules.operations.model import OperationGroup
from app.modules.operations.schemas import OperationGroupRead, OperationGroupWrite
from app.modules.trash.service import move_to_trash

router = APIRouter(prefix="/operation-groups", tags=["operations"])
Session = Annotated[AsyncSession, Depends(get_session)]
ActorDependency = Annotated[Actor, Depends(get_current_actor)]


async def lock_groups(session: AsyncSession) -> None:
    await session.execute(text("SELECT pg_advisory_xact_lock(2026092903)"))


async def validate_parent(
    session: AsyncSession, parent_id: uuid.UUID | None, group_id: uuid.UUID | None = None,
) -> None:
    if parent_id is not None:
        parent = await session.get(OperationGroup, parent_id)
        if parent is None or parent.parent_id is not None or parent_id == group_id:
            raise DomainValidationError("Выберите корневую группу: допустимы только два уровня")
        if group_id and await session.scalar(select(OperationGroup.id).where(
            OperationGroup.parent_id == group_id
        )):
            raise DomainValidationError("Сначала перенесите подгруппы этой группы")


@router.get("", response_model=list[OperationGroupRead])
async def list_groups(session: Session) -> list[OperationGroup]:
    return list(
        (
            await session.scalars(select(OperationGroup).order_by(func.lower(OperationGroup.name)))
        ).all()
    )


async def save(session: AsyncSession, group: OperationGroup) -> OperationGroup:
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("Это название группы уже используется") from error
    await session.refresh(group)
    return group


@router.post("", response_model=OperationGroupRead, status_code=201)
async def create_group(payload: OperationGroupWrite, session: Session) -> OperationGroup:
    await lock_groups(session)
    await validate_parent(session, payload.parent_id)
    group = OperationGroup(name=payload.name, parent_id=payload.parent_id)
    session.add(group)
    return await save(session, group)


@router.patch("/{group_id}", response_model=OperationGroupRead)
async def update_group(
    group_id: uuid.UUID, payload: OperationGroupWrite, session: Session
) -> OperationGroup:
    await lock_groups(session)
    group = await session.get(OperationGroup, group_id)
    if group is None:
        raise NotFoundError("Группа не найдена")
    if "parent_id" in payload.model_fields_set:
        await validate_parent(session, payload.parent_id, group.id)
        group.parent_id = payload.parent_id
    group.name = payload.name
    return await save(session, group)


@router.delete("/{group_id}", status_code=204)
async def delete_group(group_id: uuid.UUID, session: Session, actor: ActorDependency) -> None:
    require_any_role(actor, Role.ADMIN)
    await move_to_trash(session, "operation_group", group_id, actor.subject)
    await session.commit()
