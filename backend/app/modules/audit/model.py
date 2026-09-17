from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, Identity, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_events_created_at", "created_at"),
        Index("ix_audit_events_actor", "actor"),
        Index("ix_audit_events_entity", "entity"),
        Index("ix_audit_events_request_id", "request_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.clock_timestamp(), nullable=False,
    )
    actor: Mapped[str] = mapped_column(String(200), nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)
    entity: Mapped[str] = mapped_column(String(200), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(Text)
    request_id: Mapped[str | None] = mapped_column(String(36))
    method: Mapped[str | None] = mapped_column(String(16))
    status_code: Mapped[int | None] = mapped_column(Integer)
    before: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
