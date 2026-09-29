"""Per-tab user permissions; null preserves legacy role permissions."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260929_0019"
down_revision = "20260927_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_accounts", sa.Column("permissions", postgresql.ARRAY(sa.String(32))))


def downgrade() -> None:
    op.drop_column("user_accounts", "permissions")
