"""Recoverable administrator trash."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261005_0030"
down_revision = "20261005_0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trash_entries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("state", postgresql.JSONB(), nullable=False),
        sa.Column("deleted_by", sa.String(200), nullable=False),
        sa.Column(
            "deleted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("restored_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("restored_by", sa.String(200), nullable=True),
    )
    op.create_index(
        "ux_trash_entries_active",
        "trash_entries",
        ["entity_type", "entity_id"],
        unique=True,
        postgresql_where=sa.text("restored_at IS NULL"),
    )
    # Include records previously archived/deleted by the application.
    for table, kind, name, condition, state in (
        ("materials", "material", "name", "archived", "jsonb_build_object('archived', false)"),
        (
            "manufactured_items",
            "manufactured_item",
            "name",
            "archived",
            "jsonb_build_object('archived', false)",
        ),
        ("operations", "operation", "name", "archived", "jsonb_build_object('archived', false)"),
        ("employees", "employee", "full_name", "NOT active", "jsonb_build_object('active', true)"),
        (
            "funding_sources",
            "funding_source",
            "name",
            "archived",
            "jsonb_build_object('archived', false)",
        ),
        (
            "technological_processes",
            "process",
            "name",
            "archived OR deleted_at IS NOT NULL",
            "jsonb_build_object('archived', false)",
        ),
        (
            "operation_instruction_assets",
            "instruction_asset",
            "filename",
            "deleted_at IS NOT NULL",
            "'{}'",
        ),
    ):
        op.execute(
            sa.text(
                f"INSERT INTO trash_entries (id, entity_type, entity_id, name, state, deleted_by) "
                f"SELECT gen_random_uuid(), '{kind}', id, {name}, "
                f"{state}::jsonb, 'migration' "
                f"FROM {table} WHERE {condition}"
            )
        )


def downgrade() -> None:
    op.drop_table("trash_entries")
