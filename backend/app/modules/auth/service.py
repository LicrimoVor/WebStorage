import asyncio
import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import Section, permissions_for
from app.core.audit_context import set_actor
from app.core.config import get_settings
from app.core.errors import AuthenticationError, ConflictError, DomainValidationError, NotFoundError
from app.core.security import Actor, Role
from app.modules.auth.model import AuthSession, UserAccount
from app.modules.auth.passwords import DUMMY_PASSWORD_HASH, hash_password, verify_password

MAX_FAILED_ATTEMPTS = 5
LOCK_DURATION = timedelta(minutes=15)


@dataclass(frozen=True, slots=True)
class CreatedSession:
    token: str
    refresh_token: str
    refresh_expires_at: datetime
    username: str
    roles: list[Role]
    expires_at: datetime
    permissions: list[Section]


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _roles(values: list[str]) -> list[Role]:
    return [Role(value) for value in values]


async def authenticate(
    session: AsyncSession,
    *,
    username: str,
    password: str,
    session_ttl: timedelta,
) -> CreatedSession:
    now = datetime.now(UTC)
    user = (
        await session.execute(
            select(UserAccount)
            .where(func.lower(UserAccount.username) == func.lower(username))
            .with_for_update()
        )
    ).scalar_one_or_none()

    if user is None:
        await asyncio.to_thread(verify_password, password, DUMMY_PASSWORD_HASH)
        raise AuthenticationError("Invalid username or password")

    if not user.active:
        await asyncio.to_thread(verify_password, password, user.password_hash)
        raise AuthenticationError("Invalid username or password")

    if user.locked_until is not None and user.locked_until > now:
        await asyncio.to_thread(verify_password, password, user.password_hash)
        raise AuthenticationError("Invalid username or password")

    valid, updated_hash = await asyncio.to_thread(verify_password, password, user.password_hash)
    if not valid:
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
            user.failed_login_attempts = 0
            user.locked_until = now + LOCK_DURATION
        await session.commit()
        raise AuthenticationError("Invalid username or password")

    await set_actor(session, user.username)
    if updated_hash is not None:
        user.password_hash = updated_hash
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    raw_token = secrets.token_urlsafe(32)
    expires_at = now + timedelta(minutes=get_settings().access_token_ttl_minutes)
    refresh_token = secrets.token_urlsafe(48)
    refresh_expires_at = now + session_ttl
    auth_session = AuthSession(
        user_id=user.id,
        token_hash=_token_hash(raw_token),
        expires_at=refresh_expires_at,
        refresh_hash=_token_hash(refresh_token),
        access_expires_at=expires_at,
    )
    session.add(auth_session)
    await session.execute(delete(AuthSession).where(AuthSession.expires_at <= now))
    await session.commit()
    return CreatedSession(
        token=raw_token,
        refresh_token=refresh_token,
        refresh_expires_at=refresh_expires_at,
        username=user.username,
        roles=_roles(user.roles),
        permissions=permissions_for(user.roles, user.permissions),
        expires_at=expires_at,
    )


async def actor_for_token(session: AsyncSession, token: str | None) -> Actor:
    if not token:
        raise AuthenticationError("Authentication is required")
    now = datetime.now(UTC)
    row = (
        await session.execute(
            select(AuthSession, UserAccount)
            .join(UserAccount, UserAccount.id == AuthSession.user_id)
            .where(AuthSession.token_hash == _token_hash(token))
        )
    ).one_or_none()
    if row is None:
        raise AuthenticationError("Authentication is required")
    auth_session, user = row
    if auth_session.expires_at <= now or not user.active:
        await session.delete(auth_session)
        await session.commit()
        raise AuthenticationError("Authentication is required")
    if auth_session.access_expires_at is None or auth_session.access_expires_at <= now:
        raise AuthenticationError("Access token expired")
    return Actor(
        subject=user.username, roles=frozenset(_roles(user.roles)),
        permissions=frozenset(permissions_for(user.roles, user.permissions)),
    )


async def refresh_session(session: AsyncSession, token: str) -> CreatedSession:
    row = (
        await session.execute(
            select(AuthSession, UserAccount)
            .join(UserAccount, UserAccount.id == AuthSession.user_id)
            .where(AuthSession.refresh_hash == _token_hash(token))
            .with_for_update(of=AuthSession)
        )
    ).one_or_none()
    now = datetime.now(UTC)
    if row is None:
        raise AuthenticationError("Invalid refresh token")
    auth_session, user = row
    if auth_session.expires_at <= now or not user.active:
        raise AuthenticationError("Refresh token expired")
    await set_actor(session, user.username)
    access = secrets.token_urlsafe(32)
    auth_session.token_hash = _token_hash(access)
    auth_session.access_expires_at = now + timedelta(
        minutes=get_settings().access_token_ttl_minutes
    )
    await session.commit()
    return CreatedSession(
        token=access,
        refresh_token=token,
        username=user.username,
        roles=_roles(user.roles),
        permissions=permissions_for(user.roles, user.permissions),
        expires_at=auth_session.access_expires_at,
        refresh_expires_at=auth_session.expires_at,
    )


async def revoke_session(session: AsyncSession, token: str | None) -> None:
    if token:
        await session.execute(
            delete(AuthSession).where(
                (AuthSession.token_hash == _token_hash(token))
                | (AuthSession.refresh_hash == _token_hash(token))
            )
        )
        await session.commit()


async def change_own_password(
    session: AsyncSession, *, token: str | None, current_password: str, new_password: str
) -> None:
    if not token:
        raise AuthenticationError("Authentication is required")
    now = datetime.now(UTC)
    user = await session.scalar(
        select(UserAccount)
        .join(AuthSession, AuthSession.user_id == UserAccount.id)
        .where(
            AuthSession.token_hash == _token_hash(token),
            AuthSession.expires_at > now,
            UserAccount.active.is_(True),
        )
        .with_for_update(of=UserAccount)
    )
    if user is None:
        raise AuthenticationError("Authentication is required")
    if user.locked_until is not None and user.locked_until > now:
        raise DomainValidationError("Слишком много попыток. Повторите через 15 минут.")
    valid, _ = await asyncio.to_thread(verify_password, current_password, user.password_hash)
    if not valid:
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
            user.failed_login_attempts = 0
            user.locked_until = now + LOCK_DURATION
        await session.commit()
        raise DomainValidationError("Текущий пароль указан неверно")
    if new_password == current_password:
        raise DomainValidationError("Новый пароль должен отличаться от текущего")
    if not new_password.strip():
        raise DomainValidationError("Новый пароль не должен состоять из пробелов")
    user.password_hash = await asyncio.to_thread(hash_password, new_password)
    user.failed_login_attempts = 0
    user.locked_until = None
    await session.execute(
        delete(AuthSession).where(
            AuthSession.user_id == user.id,
            AuthSession.token_hash != _token_hash(token),
        )
    )
    await session.commit()


async def create_user(
    session: AsyncSession,
    *,
    username: str,
    password: str,
    roles: list[Role],
    permissions: list[Section] | None = None,
    active: bool = True,
) -> UserAccount:
    existing = (
        await session.execute(
            select(UserAccount.id).where(func.lower(UserAccount.username) == func.lower(username))
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise ConflictError("A user with this username already exists")
    user = UserAccount(
        username=username,
        active=active,
        password_hash=await asyncio.to_thread(hash_password, password),
        roles=[role.value for role in roles],
        permissions=[value.value for value in permissions] if permissions is not None else None,
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ConflictError("Пользователь с таким логином уже существует") from error  # noqa: RUF001
    await session.refresh(user)
    return user


async def set_user_password(session: AsyncSession, *, username: str, password: str) -> None:
    user = (
        await session.execute(
            select(UserAccount)
            .where(func.lower(UserAccount.username) == func.lower(username))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if user is None:
        raise NotFoundError("User was not found")
    user.password_hash = await asyncio.to_thread(hash_password, password)
    user.failed_login_attempts = 0
    user.locked_until = None
    await session.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    await session.commit()


async def list_users(session: AsyncSession) -> list[UserAccount]:
    return list(
        (await session.execute(select(UserAccount).order_by(func.lower(UserAccount.username))))
        .scalars()
        .all()
    )


async def set_user_active(session: AsyncSession, *, username: str, active: bool) -> None:
    user = (
        await session.execute(
            select(UserAccount)
            .where(func.lower(UserAccount.username) == func.lower(username))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if user is None:
        raise NotFoundError("User was not found")
    user.active = active
    if not active:
        await session.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    await session.commit()
