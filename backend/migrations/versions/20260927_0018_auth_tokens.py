"""Access and refresh token sessions."""

import sqlalchemy as sa
from alembic import op

revision = "20260927_0018"
down_revision = "20260927_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("auth_sessions", sa.Column("refresh_hash", sa.String(64), nullable=True))
    op.add_column(
        "auth_sessions", sa.Column("access_expires_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute("""
        DO $$ BEGIN
            EXECUTE replace(pg_get_functiondef('public.audit_row_change()'::regprocedure),
                $find$'token_hash',$find$, $replacement$'token_hash', 'refresh_hash',$replacement$);
        END $$;
    """)
    op.create_unique_constraint("uq_auth_sessions_refresh_hash", "auth_sessions", ["refresh_hash"])


def downgrade() -> None:
    op.drop_constraint("uq_auth_sessions_refresh_hash", "auth_sessions", type_="unique")
    op.drop_column("auth_sessions", "access_expires_at")
    op.drop_column("auth_sessions", "refresh_hash")
