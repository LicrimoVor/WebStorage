import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin


class UserAccount(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_accounts"
    __table_args__ = (
        Index("ix_user_accounts_username_lower", func.lower(text("username")), unique=True),
        Index("ix_user_accounts_active", "active"),
    )

    id: Mapped[uuid.UUID]
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    roles: Mapped[list[str]] = mapped_column(
        ARRAY(String(32)),
        nullable=False,
        default=lambda: ["admin"],
        server_default=text("ARRAY['admin']::varchar[]"),
    )
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    failed_login_attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuthSession(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "auth_sessions"
    __table_args__ = (
        Index("ux_auth_sessions_token_hash", "token_hash", unique=True),
        Index("ix_auth_sessions_user", "user_id"),
        Index("ix_auth_sessions_expires_at", "expires_at"),
    )

    id: Mapped[uuid.UUID]
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
