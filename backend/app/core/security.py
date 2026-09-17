from dataclasses import dataclass
from enum import StrEnum
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_context import set_actor
from app.core.config import get_settings
from app.core.database import get_session
from app.core.errors import AuthorizationError


class Role(StrEnum):
    ADMIN = "admin"
    PRODUCTION = "production"
    WAREHOUSE = "warehouse"
    MANAGER = "manager"
    FINANCE = "finance"


@dataclass(frozen=True, slots=True)
class Actor:
    subject: str
    roles: frozenset[Role]


async def get_current_actor(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Actor:
    settings = get_settings()
    if settings.auth_disabled:
        await set_actor(session, "local-development")
        return Actor(subject="local-development", roles=frozenset({Role.ADMIN}))

    from app.modules.auth.service import actor_for_token

    actor = await actor_for_token(
        session, request.cookies.get(settings.session_cookie_name)
    )
    await set_actor(session, actor.subject)
    return actor


def require_any_role(actor: Actor, *allowed: Role) -> None:
    if Role.ADMIN in actor.roles or actor.roles.intersection(allowed):
        return
    raise AuthorizationError("The current role is not allowed to perform this action")
