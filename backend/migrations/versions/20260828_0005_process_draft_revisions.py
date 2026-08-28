"""Add optimistic revisions for technological process drafts.

Revision ID: 20260828_0005
Revises: 20260828_0004
Create Date: 2026-08-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260828_0005"
down_revision: str | None = "20260828_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "technological_process_versions",
        sa.Column("revision", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_technological_process_versions_revision_non_negative"),
        "technological_process_versions",
        "revision >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_technological_process_versions_revision_non_negative"),
        "technological_process_versions",
        type_="check",
    )
    op.drop_column("technological_process_versions", "revision")
