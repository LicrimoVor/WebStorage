import logging
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.audit_context import AuditContext, audit_context
from app.core.database import async_session_factory
from app.modules.audit.model import AuditEvent

logger = logging.getLogger(__name__)


class AuditMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith("/api/"):
            await self.app(scope, receive, send)
            return
        context = AuditContext(request_id=str(uuid.uuid4()), actor="anonymous")
        token = audit_context.set(context)
        status = 500

        async def send_with_status(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_with_status)
        finally:
            try:
                # Route templates omit public-link tokens and untrusted URL/query content.
                route = getattr(scope.get("route"), "path", "unmatched")
                async with async_session_factory() as session:
                    session.info["skip_audit_context"] = True
                    session.add(AuditEvent(
                        actor=context.actor, action="request", entity=route,
                        request_id=context.request_id, method=scope["method"], status_code=status,
                    ))
                    await session.commit()
            except Exception:
                # Row-change events remain transactional even if request logging is unavailable.
                logger.exception("Could not persist API audit event %s", context.request_id)
            finally:
                audit_context.reset(token)
