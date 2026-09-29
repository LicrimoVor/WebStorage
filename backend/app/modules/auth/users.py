import asyncio
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import Section, permissions_for
from app.core.database import get_session
from app.core.errors import ConflictError, DomainValidationError, NotFoundError
from app.core.security import Actor, Role, get_current_actor, require_any_role
from app.modules.auth import service
from app.modules.auth.model import AuthSession, UserAccount
from app.modules.auth.passwords import hash_password

router = APIRouter(prefix="/users", tags=["users"])
Session = Annotated[AsyncSession, Depends(get_session)]
CurrentActor = Annotated[Actor, Depends(get_current_actor)]


class UserWrite(BaseModel):
    username: str = Field(min_length=3, max_length=100, pattern=r"^[\w.@+-]+$")
    is_admin: bool = False
    active: bool = True
    permissions: list[Section] = Field(default_factory=list)
    password: str | None = Field(default=None, min_length=12, max_length=128)

    @field_validator("password")
    @classmethod
    def password_not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Пароль не должен состоять из пробелов")
        return value


class UserRead(BaseModel):
    id: uuid.UUID
    username: str
    is_admin: bool
    active: bool
    permissions: list[Section]
    created_at: datetime
    last_login_at: datetime | None


def user_read(user: UserAccount) -> UserRead:
    return UserRead(
        id=user.id,
        username=user.username,
        is_admin="admin" in user.roles,
        active=user.active,
        permissions=permissions_for(user.roles, user.permissions),
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


@router.get("", response_model=list[UserRead], operation_id="listUsers")
async def list_users(session: Session, actor: CurrentActor) -> list[UserRead]:
    require_any_role(actor, Role.ADMIN)
    return [user_read(user) for user in await service.list_users(session)]


@router.post("", response_model=UserRead, status_code=201, operation_id="createUser")
async def create_user(payload: UserWrite, session: Session, actor: CurrentActor) -> UserRead:
    require_any_role(actor, Role.ADMIN)
    if payload.password is None:
        raise DomainValidationError("Укажите пароль для нового пользователя")
    user = await service.create_user(
        session,
        username=payload.username,
        password=payload.password,
        roles=[Role.ADMIN if payload.is_admin else Role.USER],
        permissions=payload.permissions,
        active=payload.active,
    )
    return user_read(user)


@router.put("/{user_id}", response_model=UserRead, operation_id="updateUser")
async def update_user(
    user_id: uuid.UUID,
    payload: UserWrite,
    session: Session,
    actor: CurrentActor,
) -> UserRead:
    require_any_role(actor, Role.ADMIN)
    # Serialize administrator changes so concurrent edits cannot remove the last admin.
    await session.execute(select(func.pg_advisory_xact_lock(2026092901)))
    user = await session.get(UserAccount, user_id, populate_existing=True)
    if user is None:
        raise NotFoundError("Пользователь не найден")
    if user.username == actor.subject and (not payload.is_admin or not payload.active):
        raise DomainValidationError("Нельзя отключить себя или снять у себя права администратора")  # noqa: RUF001
    if user.active and "admin" in user.roles and (not payload.is_admin or not payload.active):
        remaining = await session.scalar(
            select(func.count())
            .select_from(UserAccount)
            .where(
                UserAccount.id != user_id,
                UserAccount.active.is_(True),
                UserAccount.roles.contains(["admin"]),
            )
        )
        if not remaining:
            raise DomainValidationError("В системе должен оставаться активный администратор")  # noqa: RUF001
    revoke = payload.password is not None or not payload.active or user.username != payload.username
    user.username = payload.username
    user.roles = ["admin"] if payload.is_admin else ["user"]
    user.permissions = sorted(set(payload.permissions))
    user.active = payload.active
    if payload.password is not None:
        user.password_hash = await asyncio.to_thread(hash_password, payload.password)
        user.failed_login_attempts = 0
        user.locked_until = None
    if revoke:
        await session.execute(delete(AuthSession).where(AuthSession.user_id == user_id))
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("Пользователь с таким логином уже существует") from error  # noqa: RUF001
    await session.refresh(user)
    return user_read(user)
