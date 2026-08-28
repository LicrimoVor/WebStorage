from dataclasses import dataclass
from enum import StrEnum

from fastapi import Header

from app.core.config import get_settings
from app.core.errors import AuthenticationError


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
    authorization: str | None = Header(default=None),
) -> Actor:
    settings = get_settings()
    if settings.auth_disabled:
        return Actor(subject="local-development", roles=frozenset({Role.ADMIN}))

    scheme, _, token = (authorization or "").partition(" ")
    expected = settings.development_token.get_secret_value()
    if scheme.lower() != "bearer" or not token or token != expected:
        raise AuthenticationError("A valid bearer token is required")
    return Actor(subject="configured-service-user", roles=frozenset({Role.ADMIN}))
