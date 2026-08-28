import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin, UUIDPrimaryKeyMixin


class TechnologicalProcess(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "technological_processes"
    __table_args__ = (
        Index(
            "ix_technological_processes_name_lower",
            func.lower(text("name")),
            unique=True,
        ),
        Index(
            "ux_technological_processes_output_item",
            "output_item_id",
            unique=True,
            postgresql_where=text("output_item_id IS NOT NULL"),
        ),
        Index("ix_technological_processes_archived", "archived"),
    )

    id: Mapped[uuid.UUID]
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    output_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "manufactured_items.id",
            name="fk_technological_processes_output_item",
            ondelete="RESTRICT",
        ),
        nullable=True,
    )
    archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false"), default=False
    )


class TechnologicalProcessVersion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "technological_process_versions"
    __table_args__ = (
        CheckConstraint("version_number > 0", name="version_number_positive"),
        CheckConstraint("schema_version > 0", name="schema_version_positive"),
        CheckConstraint("revision >= 0", name="revision_non_negative"),
        CheckConstraint("status IN ('draft', 'active', 'archived')", name="status_valid"),
        UniqueConstraint("process_id", "version_number", name="uq_process_versions_number"),
        Index(
            "ux_process_versions_one_active",
            "process_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        Index("ix_process_versions_process_created", "process_id", "created_at"),
    )

    id: Mapped[uuid.UUID]
    process_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "technological_processes.id",
            name="fk_process_versions_process",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default=text("'draft'"), default="draft"
    )
    schema_version: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("1"), default=1
    )
    revision: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0"), default=0
    )
    created_by: Mapped[str] = mapped_column(String(200), nullable=False)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TechnologicalProcessNode(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "technological_process_nodes"
    __table_args__ = (
        CheckConstraint(
            "node_type IN ('material', 'manufactured_item', 'operation', 'output')",
            name="node_type_valid",
        ),
        UniqueConstraint("version_id", "external_id", name="uq_process_nodes_external_id"),
        Index("ix_process_nodes_version", "version_id"),
        Index("ix_process_nodes_reference", "node_type", "reference_id"),
    )

    id: Mapped[uuid.UUID]
    version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "technological_process_versions.id",
            name="fk_process_nodes_version",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    external_id: Mapped[str] = mapped_column(String(100), nullable=False)
    node_type: Mapped[str] = mapped_column(String(32), nullable=False)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    position_x: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    position_y: Mapped[float] = mapped_column(Float, nullable=False, default=0)


class TechnologicalProcessEdge(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "technological_process_edges"
    __table_args__ = (
        UniqueConstraint("version_id", "external_id", name="uq_process_edges_external_id"),
        Index("ix_process_edges_version", "version_id"),
    )

    id: Mapped[uuid.UUID]
    version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(
            "technological_process_versions.id",
            name="fk_process_edges_version",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    external_id: Mapped[str] = mapped_column(String(100), nullable=False)
    source_node_id: Mapped[str] = mapped_column(String(100), nullable=False)
    target_node_id: Mapped[str] = mapped_column(String(100), nullable=False)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(20, 6), nullable=True)
