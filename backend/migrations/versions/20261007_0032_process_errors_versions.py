"""Persist invalid drafts and soft-delete process versions."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261007_0032"
down_revision = "20261005_0031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "technological_process_versions",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "technological_process_versions",
        sa.Column(
            "validation_errors",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.drop_constraint(
        op.f("ck_technological_process_versions_status_valid"),
        "technological_process_versions",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_technological_process_versions_status_valid"),
        "technological_process_versions",
        "status IN ('draft', 'error', 'active', 'archived')",
    )


def downgrade() -> None:
    op.execute("UPDATE technological_process_versions SET status = 'draft' WHERE status = 'error'")
    op.drop_constraint(
        op.f("ck_technological_process_versions_status_valid"),
        "technological_process_versions",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_technological_process_versions_status_valid"),
        "technological_process_versions",
        "status IN ('draft', 'active', 'archived')",
    )
    op.drop_column("technological_process_versions", "validation_errors")
    op.drop_column("technological_process_versions", "deleted_at")
