import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin


class OperationInstruction(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "operation_instructions"
    __table_args__ = (Index("uq_operation_instructions_operation", "operation_id", unique=True),)

    id: Mapped[uuid.UUID]
    operation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("operations.id", ondelete="CASCADE"), nullable=False
    )


class OperationInstructionVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "operation_instruction_versions"
    __table_args__ = (
        CheckConstraint("version_number > 0", name="version_number_positive"),
        CheckConstraint("revision >= 0", name="revision_non_negative"),
        CheckConstraint("status IN ('draft', 'published', 'archived')", name="status_valid"),
        Index(
            "uq_operation_instruction_versions_number",
            "instruction_id",
            "version_number",
            unique=True,
        ),
        Index(
            "uq_operation_instruction_versions_draft",
            "instruction_id",
            unique=True,
            postgresql_where=text("status = 'draft'"),
        ),
        Index(
            "uq_operation_instruction_versions_published",
            "instruction_id",
            unique=True,
            postgresql_where=text("status = 'published'"),
        ),
    )

    id: Mapped[uuid.UUID]
    instruction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("operation_instructions.id", ondelete="CASCADE"),
        nullable=False,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    created_by: Mapped[str] = mapped_column(String(200), nullable=False)
    published_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OperationInstructionAsset(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "operation_instruction_assets"
    __table_args__ = (Index("ix_operation_instruction_assets_instruction", "instruction_id"),)

    id: Mapped[uuid.UUID]
    instruction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("operation_instructions.id", ondelete="CASCADE"),
        nullable=False,
    )
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by: Mapped[str] = mapped_column(String(200), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OperationInstructionPublicLink(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "operation_instruction_public_links"
    __table_args__ = (
        Index("uq_operation_instruction_public_links_hash", "token_hash", unique=True),
        Index("ix_operation_instruction_public_links_instruction", "instruction_id"),
    )

    id: Mapped[uuid.UUID]
    instruction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("operation_instructions.id", ondelete="CASCADE"),
        nullable=False,
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str] = mapped_column(String(200), nullable=False)
