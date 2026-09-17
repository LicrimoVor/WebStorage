from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_context import set_actor
from app.core.config import get_settings
from app.core.database import get_session
from app.core.errors import AuthenticationError, ProblemDetail
from app.core.security import Actor, get_current_actor
from app.modules.auth import service
from app.modules.auth.schemas import AuthSessionRead, LoginRequest

router = APIRouter(
    prefix="/auth",
    tags=["authentication"],
    responses={401: {"model": ProblemDetail}, 422: {"model": ProblemDetail}},
)
Session = Annotated[AsyncSession, Depends(get_session)]
ActorDependency = Annotated[Actor, Depends(get_current_actor)]


@router.post("/login", response_model=AuthSessionRead, operation_id="login")
async def login(
    payload: LoginRequest, response: Response, session: Session
) -> AuthSessionRead:
    settings = get_settings()
    await set_actor(session, f"login-attempt:{payload.username}")
    created = await service.authenticate(
        session,
        username=payload.username,
        password=payload.password,
        session_ttl=timedelta(hours=settings.session_ttl_hours),
    )
    response.set_cookie(
        key=settings.session_cookie_name,
        value=created.token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="strict",
        path="/",
    )
    return AuthSessionRead(
        username=created.username,
        roles=created.roles,
        expires_at=created.expires_at,
    )


@router.get("/session", response_model=AuthSessionRead, operation_id="getAuthSession")
async def get_auth_session(actor: ActorDependency) -> AuthSessionRead:
    return AuthSessionRead(username=actor.subject, roles=sorted(actor.roles), expires_at=None)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="logout",
)
async def logout(
    request: Request, response: Response, session: Session,
) -> None:
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        try:
            actor = await service.actor_for_token(session, token)
            await set_actor(session, actor.subject)
        except AuthenticationError:
            pass  # Logout also clears an already expired or revoked cookie.
    await service.revoke_session(session, token)
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite="strict",
    )
