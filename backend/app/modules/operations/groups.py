import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.errors import ConflictError, NotFoundError
from app.modules.operations.model import OperationGroup
from app.modules.operations.schemas import OperationGroupRead, OperationGroupWrite

router = APIRouter(prefix="/operation-groups", tags=["operations"])
Session = Annotated[AsyncSession, Depends(get_session)]


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
    group = OperationGroup(name=payload.name)
    session.add(group)
    return await save(session, group)


@router.patch("/{group_id}", response_model=OperationGroupRead)
async def update_group(
    group_id: uuid.UUID, payload: OperationGroupWrite, session: Session
) -> OperationGroup:
    group = await session.get(OperationGroup, group_id)
    if group is None:
        raise NotFoundError("Группа не найдена")
    group.name = payload.name
    return await save(session, group)


@router.delete("/{group_id}", status_code=204)
async def delete_group(group_id: uuid.UUID, session: Session) -> None:
    group = await session.get(OperationGroup, group_id)
    if group is None:
        raise NotFoundError("Группа не найдена")
    await session.delete(group)
    await session.commit()
