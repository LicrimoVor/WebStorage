"""Create technological process versions and graph storage.

Revision ID: 20260828_0004
Revises: 20260828_0003
Create Date: 2026-08-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260828_0004"
down_revision: str | None = "20260828_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "technological_processes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("output_item_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("archived", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["output_item_id"],
            ["manufactured_items.id"],
            name="fk_technological_processes_output_item",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_technological_processes")),
    )
    op.create_index(
        "ix_technological_processes_archived",
        "technological_processes",
        ["archived"],
        unique=False,
    )
    op.create_index(
        "ix_technological_processes_name_lower",
        "technological_processes",
        [sa.literal_column("lower(name)")],
        unique=True,
    )
    op.create_index(
        "ux_technological_processes_output_item",
        "technological_processes",
        ["output_item_id"],
        unique=True,
        postgresql_where=sa.text("output_item_id IS NOT NULL"),
    )

    op.create_table(
        "technological_process_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("process_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default=sa.text("'draft'"),
            nullable=False,
        ),
        sa.Column(
            "schema_version",
            sa.Integer(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column("created_by", sa.String(length=200), nullable=False),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "schema_version > 0",
            name=op.f("ck_technological_process_versions_schema_version_positive"),
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'active', 'archived')",
            name=op.f("ck_technological_process_versions_status_valid"),
        ),
        sa.CheckConstraint(
            "version_number > 0",
            name=op.f("ck_technological_process_versions_version_number_positive"),
        ),
        sa.ForeignKeyConstraint(
            ["process_id"],
            ["technological_processes.id"],
            name="fk_process_versions_process",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_technological_process_versions")),
        sa.UniqueConstraint("process_id", "version_number", name="uq_process_versions_number"),
    )
    op.create_index(
        "ix_process_versions_process_created",
        "technological_process_versions",
        ["process_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ux_process_versions_one_active",
        "technological_process_versions",
        ["process_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )

    # Before this revision the column was an unvalidated placeholder and could
    # contain UUIDs that did not identify any persisted process version.
    op.execute(
        sa.text(
            "UPDATE manufactured_items SET active_process_id = NULL "
            "WHERE active_process_id IS NOT NULL"
        )
    )
    op.create_foreign_key(
        "fk_manufactured_items_active_process",
        "manufactured_items",
        "technological_process_versions",
        ["active_process_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.create_table(
        "technological_process_nodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("external_id", sa.String(length=100), nullable=False),
        sa.Column("node_type", sa.String(length=32), nullable=False),
        sa.Column("reference_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("label", sa.String(length=200), nullable=True),
        sa.Column("position_x", sa.Float(), nullable=False),
        sa.Column("position_y", sa.Float(), nullable=False),
        sa.CheckConstraint(
            "node_type IN ('material', 'manufactured_item', 'operation', 'output')",
            name=op.f("ck_technological_process_nodes_node_type_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["version_id"],
            ["technological_process_versions.id"],
            name="fk_process_nodes_version",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_technological_process_nodes")),
        sa.UniqueConstraint("version_id", "external_id", name="uq_process_nodes_external_id"),
    )
    op.create_index(
        "ix_process_nodes_reference",
        "technological_process_nodes",
        ["node_type", "reference_id"],
        unique=False,
    )
    op.create_index(
        "ix_process_nodes_version",
        "technological_process_nodes",
        ["version_id"],
        unique=False,
    )

    op.create_table(
        "technological_process_edges",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("external_id", sa.String(length=100), nullable=False),
        sa.Column("source_node_id", sa.String(length=100), nullable=False),
        sa.Column("target_node_id", sa.String(length=100), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=20, scale=6), nullable=True),
        sa.ForeignKeyConstraint(
            ["version_id"],
            ["technological_process_versions.id"],
            name="fk_process_edges_version",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_technological_process_edges")),
        sa.UniqueConstraint("version_id", "external_id", name="uq_process_edges_external_id"),
    )
    op.create_index(
        "ix_process_edges_version",
        "technological_process_edges",
        ["version_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_process_edges_version", table_name="technological_process_edges")
    op.drop_table("technological_process_edges")
    op.drop_index("ix_process_nodes_version", table_name="technological_process_nodes")
    op.drop_index("ix_process_nodes_reference", table_name="technological_process_nodes")
    op.drop_table("technological_process_nodes")
    op.execute(
        sa.text(
            "UPDATE manufactured_items SET active_process_id = NULL "
            "WHERE active_process_id IS NOT NULL"
        )
    )
    op.drop_constraint(
        "fk_manufactured_items_active_process",
        "manufactured_items",
        type_="foreignkey",
    )
    op.drop_index(
        "ux_process_versions_one_active",
        table_name="technological_process_versions",
    )
    op.drop_index(
        "ix_process_versions_process_created",
        table_name="technological_process_versions",
    )
    op.drop_table("technological_process_versions")
    op.drop_index(
        "ux_technological_processes_output_item",
        table_name="technological_processes",
    )
    op.drop_index(
        "ix_technological_processes_name_lower",
        table_name="technological_processes",
    )
    op.drop_index(
        "ix_technological_processes_archived",
        table_name="technological_processes",
    )
    op.drop_table("technological_processes")
