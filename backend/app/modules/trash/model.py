import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, String, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, UUIDPrimaryKeyMixin


class TrashEntry(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "trash_entries"
    __table_args__ = (
        Index(
            "ux_trash_entries_active",
            "entity_type",
            "entity_id",
            unique=True,
            postgresql_where=text("restored_at IS NULL"),
        ),
    )

    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[uuid.UUID]
    name: Mapped[str] = mapped_column(String(500))
    state: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    deleted_by: Mapped[str] = mapped_column(String(200))
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    restored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    restored_by: Mapped[str | None] = mapped_column(String(200), nullable=True)


def visible_entry(entity_id: Any, kind: str) -> Any:
    from sqlalchemy import exists, select

    return ~exists(
        select(TrashEntry.id).where(
            TrashEntry.entity_type == kind,
            TrashEntry.entity_id == entity_id,
            TrashEntry.restored_at.is_(None),
        )
    )


def visible_finance_entry(entity_id: Any) -> Any:
    return visible_entry(entity_id, "finance_entry")
