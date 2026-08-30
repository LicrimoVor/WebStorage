"""Add versioned operation instructions and public links.

Revision ID: 20260829_0012
Revises: 20260829_0011
Create Date: 2026-08-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260829_0012"
down_revision: str | None = "20260829_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "operation_instructions",
        sa.Column("operation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["operation_id"], ["operations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_operation_instructions_operation",
        "operation_instructions",
        ["operation_id"],
        unique=True,
    )
    op.create_table(
        "operation_instruction_versions",
        sa.Column("instruction_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), server_default="0", nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("content", sa.Text(), server_default="", nullable=False),
        sa.Column("created_by", sa.String(length=200), nullable=False),
        sa.Column("published_by", sa.String(length=200), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("revision >= 0", name=op.f("ck_operation_instruction_versions_revision_non_negative")),
        sa.CheckConstraint("status IN ('draft', 'published', 'archived')", name=op.f("ck_operation_instruction_versions_status_valid")),
        sa.CheckConstraint("version_number > 0", name=op.f("ck_operation_instruction_versions_version_number_positive")),
        sa.ForeignKeyConstraint(["instruction_id"], ["operation_instructions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_operation_instruction_versions_number",
        "operation_instruction_versions",
        ["instruction_id", "version_number"],
        unique=True,
    )
    op.create_index(
        "uq_operation_instruction_versions_draft",
        "operation_instruction_versions",
        ["instruction_id"],
        unique=True,
        postgresql_where=sa.text("status = 'draft'"),
    )
    op.create_index(
        "uq_operation_instruction_versions_published",
        "operation_instruction_versions",
        ["instruction_id"],
        unique=True,
        postgresql_where=sa.text("status = 'published'"),
    )
    op.create_table(
        "operation_instruction_assets",
        sa.Column("instruction_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("url", sa.String(length=1000), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.String(length=200), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["instruction_id"], ["operation_instructions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_operation_instruction_assets_instruction",
        "operation_instruction_assets",
        ["instruction_id"],
    )
    op.create_table(
        "operation_instruction_public_links",
        sa.Column("instruction_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(length=200), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["instruction_id"], ["operation_instructions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_operation_instruction_public_links_instruction",
        "operation_instruction_public_links",
        ["instruction_id"],
    )
    op.create_index(
        "uq_operation_instruction_public_links_hash",
        "operation_instruction_public_links",
        ["token_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "uq_operation_instruction_public_links_hash",
        table_name="operation_instruction_public_links",
    )
    op.drop_index(
        "ix_operation_instruction_public_links_instruction",
        table_name="operation_instruction_public_links",
    )
    op.drop_table("operation_instruction_public_links")
    op.drop_index(
        "ix_operation_instruction_assets_instruction",
        table_name="operation_instruction_assets",
    )
    op.drop_table("operation_instruction_assets")
    op.drop_index("uq_operation_instruction_versions_published", table_name="operation_instruction_versions")
    op.drop_index("uq_operation_instruction_versions_draft", table_name="operation_instruction_versions")
    op.drop_index("uq_operation_instruction_versions_number", table_name="operation_instruction_versions")
    op.drop_table("operation_instruction_versions")
    op.drop_index("uq_operation_instructions_operation", table_name="operation_instructions")
    op.drop_table("operation_instructions")
