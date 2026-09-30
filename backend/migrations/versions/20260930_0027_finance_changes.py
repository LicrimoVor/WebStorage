"""Financial entry edit history and repair document link."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "20260930_0027"
down_revision = "20260930_0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("financial_transactions", sa.Column("document_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_financial_transactions_document_id_business_documents",
        "financial_transactions",
        "business_documents",
        ["document_id"],
        ["id"],
    )
    op.create_table(
        "finance_changes",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("entry_id", sa.UUID(), nullable=False),
        sa.Column("before", JSONB(), nullable=False),
        sa.Column("after", JSONB(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(200), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_finance_changes_entry_id", "finance_changes", ["entry_id"])
    # Earlier repairs wrote the charge and document in the same transaction,
    # without a foreign key. Link only uniquely identifiable pairs.
    op.execute("""
        WITH candidates AS (
            SELECT t.id AS transaction_id, d.id AS document_id,
                   count(*) OVER (PARTITION BY t.id) AS transaction_matches,
                   count(*) OVER (PARTITION BY d.id) AS document_matches
            FROM financial_transactions t
            JOIN business_documents d ON d.kind = 'repair'
                AND t.category = 'Ремонт'
                AND t.created_at = d.created_at
                AND t.created_by = d.created_by
                AND t.funding_source_id = d.funding_source_id
                AND t.amount = (d.data->>'service_cost')::numeric
                AND t.occurred_at = (d.data->>'occurred_at')::timestamptz
                AND coalesce(t.comment, '') = coalesce(d.data->>'comment', '')
        )
        UPDATE financial_transactions t SET document_id = c.document_id
        FROM candidates c WHERE t.id = c.transaction_id
            AND c.transaction_matches = 1 AND c.document_matches = 1
    """)


def downgrade() -> None:
    op.drop_table("finance_changes")
    op.drop_constraint(
        "fk_financial_transactions_document_id_business_documents",
        "financial_transactions",
        type_="foreignkey",
    )
    op.drop_column("financial_transactions", "document_id")
