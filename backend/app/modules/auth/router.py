from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_context import set_actor
from app.core.config import get_settings
from app.core.database import get_session
from app.core.errors import AuthenticationError, DomainValidationError, ProblemDetail
from app.core.security import Actor, bearer_token, get_current_actor
from app.modules.auth import service
from app.modules.auth.model import UserAccount
from app.modules.auth.schemas import (
    AuthProfileRead,
    AuthSessionRead,
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    TokenPairRead,
)

router = APIRouter(
    prefix="/auth",
    tags=["authentication"],
    responses={401: {"model": ProblemDetail}, 422: {"model": ProblemDetail}},
)
Session = Annotated[AsyncSession, Depends(get_session)]
ActorDependency = Annotated[Actor, Depends(get_current_actor)]


def token_response(created: service.CreatedSession) -> TokenPairRead:
    return TokenPairRead(
        username=created.username,
        roles=created.roles,
        expires_at=created.expires_at,
        access_token=created.token,
        refresh_token=created.refresh_token,
        refresh_expires_at=created.refresh_expires_at,
    )


@router.post("/login", response_model=TokenPairRead, operation_id="login")
async def login(payload: LoginRequest, session: Session) -> TokenPairRead:
    await set_actor(session, f"login-attempt:{payload.username}")
    created = await service.authenticate(
        session,
        username=payload.username,
        password=payload.password,
        session_ttl=timedelta(days=get_settings().refresh_token_ttl_days),
    )
    return token_response(created)


@router.post("/refresh", response_model=TokenPairRead, operation_id="refreshTokens")
async def refresh(payload: RefreshRequest, session: Session) -> TokenPairRead:
    return token_response(await service.refresh_session(session, payload.refresh_token))


@router.get("/session", response_model=AuthSessionRead, operation_id="getAuthSession")
async def get_auth_session(actor: ActorDependency) -> AuthSessionRead:
    return AuthSessionRead(username=actor.subject, roles=sorted(actor.roles), expires_at=None)


@router.get("/profile", response_model=AuthProfileRead, operation_id="getAuthProfile")
async def get_auth_profile(actor: ActorDependency, session: Session) -> AuthProfileRead:
    if get_settings().auth_disabled:
        return AuthProfileRead(
            username=actor.subject, roles=sorted(actor.roles), can_change_password=False
        )
    user = await session.scalar(select(UserAccount).where(UserAccount.username == actor.subject))
    if user is None:
        raise AuthenticationError("Authentication is required")
    return AuthProfileRead(
        username=user.username,
        roles=sorted(actor.roles),
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        can_change_password=True,
    )


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT, operation_id="changePassword")
async def change_password(
    payload: ChangePasswordRequest, request: Request, actor: ActorDependency, session: Session
) -> None:
    del actor
    settings = get_settings()
    if settings.auth_disabled:
        raise DomainValidationError("Вход по паролю отключён")
    await service.change_own_password(
        session,
        token=bearer_token(request),
        current_password=payload.current_password,
        new_password=payload.new_password,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="logout",
)
async def logout(
    request: Request,
    response: Response,
    session: Session,
    payload: RefreshRequest | None = None,
) -> None:
    await service.revoke_session(session, bearer_token(request))
    if payload is not None:
        await service.revoke_session(session, payload.refresh_token)
    # Remove the cookie left by earlier application versions.
    settings = get_settings()
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite="strict",
    )
