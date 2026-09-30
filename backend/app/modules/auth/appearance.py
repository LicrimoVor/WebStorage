from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.core.config import get_settings
from app.core.errors import AuthenticationError, DomainValidationError
from app.modules.auth.model import UserAccount
from app.modules.auth.router import ActorDependency, Session

router = APIRouter(prefix="/auth", tags=["authentication"])


class Palette(BaseModel):
    model_config = ConfigDict(extra="forbid")
    accent: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    link: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    background: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    surface: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class Appearance(BaseModel):
    model_config = ConfigDict(extra="forbid")
    light: Palette | None = None
    dark: Palette | None = None


@router.get("/appearance", response_model=Appearance)
async def get_appearance(actor: ActorDependency, session: Session) -> Appearance:
    user = await session.scalar(select(UserAccount).where(UserAccount.username == actor.subject))
    if user is None:
        if get_settings().auth_disabled:
            return Appearance()
        raise AuthenticationError("Authentication is required")
    return Appearance.model_validate(user.appearance)


@router.put("/appearance", response_model=Appearance)
async def save_appearance(
    payload: Appearance, actor: ActorDependency, session: Session
) -> Appearance:
    user = await session.scalar(select(UserAccount).where(UserAccount.username == actor.subject))
    if user is None:
        raise DomainValidationError("Для сохранения цветов войдите под своей учётной записью")
    user.appearance = payload.model_dump(mode="json")
    await session.commit()
    return payload
