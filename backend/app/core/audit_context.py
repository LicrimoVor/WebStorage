from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any

from sqlalchemy import Connection, event, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, SessionTransaction


@dataclass
class AuditContext:
    request_id: str = ""
    actor: str = "system"


audit_context: ContextVar[AuditContext | None] = ContextVar("audit_context", default=None)
CONTEXT_SQL = text(
    "SELECT set_config('app.audit_actor', :actor, true), "
    "set_config('app.audit_request_id', :request_id, true)"
)


@event.listens_for(Session, "after_begin")
def set_transaction_context(
    session: Session, transaction: SessionTransaction, connection: Connection,
) -> None:
    if session.info.get("skip_audit_context"):
        return
    context = audit_context.get() or AuditContext()
    connection.execute(CONTEXT_SQL, {"actor": context.actor, "request_id": context.request_id})


async def set_actor(session: AsyncSession, actor: str) -> None:
    context = audit_context.get()
    if context is not None:
        context.actor = actor
        if not session.in_transaction():
            return  # after_begin will initialize the first transaction with this actor.
    parameters: dict[str, Any] = {
        "actor": actor, "request_id": context.request_id if context else "",
    }
    await session.execute(CONTEXT_SQL, parameters)
