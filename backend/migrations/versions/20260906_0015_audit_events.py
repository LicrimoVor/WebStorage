"""Persistent transactional row audit and API events.

Revision ID: 20260906_0015
Revises: 20260830_0014
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260906_0015"
down_revision: str | None = "20260830_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audit_events",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.Column("actor", sa.String(200), nullable=False),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("entity", sa.String(200), nullable=False),
        sa.Column("entity_id", sa.Text()),
        sa.Column("request_id", sa.String(36)),
        sa.Column("method", sa.String(16)),
        sa.Column("status_code", sa.Integer()),
        sa.Column("before", postgresql.JSONB()),
        sa.Column("after", postgresql.JSONB()),
    )
    for column in ("created_at", "actor", "entity", "request_id"):
        op.create_index(f"ix_audit_events_{column}", "audit_events", [column])
    op.execute("""
        CREATE FUNCTION public.audit_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE old_data jsonb; new_data jsonb;
        BEGIN
            IF TG_OP <> 'INSERT' THEN
                old_data := to_jsonb(OLD) - ARRAY['password_hash', 'token_hash', 'password', 'token', 'content_base64'];
            END IF;
            IF TG_OP <> 'DELETE' THEN
                new_data := to_jsonb(NEW) - ARRAY['password_hash', 'token_hash', 'password', 'token', 'content_base64'];
            END IF;
            INSERT INTO public.audit_events (actor, action, entity, entity_id, request_id, before, after)
            VALUES (
                coalesce(nullif(current_setting('app.audit_actor', true), ''), 'system'),
                lower(TG_OP), TG_TABLE_NAME, coalesce(new_data->>'id', old_data->>'id'),
                nullif(current_setting('app.audit_request_id', true), ''), old_data, new_data
            );
            RETURN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ DECLARE target record;
        BEGIN
            FOR target IN SELECT tablename FROM pg_tables
                WHERE schemaname = 'public' AND tablename NOT IN ('audit_events', 'alembic_version')
            LOOP
                EXECUTE format('CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', target.tablename);
            END LOOP;
        END $$;
    """)
    op.execute("""
        CREATE FUNCTION public.reject_audit_modification() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Audit events are append-only'; END $$;
    """)
    op.execute("""
        CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON public.audit_events
        FOR EACH ROW EXECUTE FUNCTION public.reject_audit_modification();
    """)


def downgrade() -> None:
    op.execute("""
        DO $$ DECLARE target record;
        BEGIN
            FOR target IN SELECT tablename FROM pg_tables
                WHERE schemaname = 'public' AND tablename NOT IN ('audit_events', 'alembic_version')
            LOOP
                EXECUTE format('DROP TRIGGER IF EXISTS audit_row_change ON public.%I', target.tablename);
            END LOOP;
        END $$;
    """)
    op.drop_table("audit_events")
    op.execute("DROP FUNCTION public.audit_row_change()")
    op.execute("DROP FUNCTION public.reject_audit_modification()")
