"""External process assignments and release of serialized stock."""

import sqlalchemy as sa
from alembic import op

revision = "20261015_0035"
down_revision = "20261014_0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("manufactured_items", sa.Column("is_accountable", sa.Boolean(), server_default="false", nullable=False))
    op.execute("UPDATE manufactured_items SET is_accountable = true WHERE is_product")
    op.alter_column("business_documents", "funding_source_id", nullable=True)
    op.alter_column("product_units", "production_record_id", nullable=True)
    op.add_column("external_offers", sa.Column("process_version_id", sa.UUID(), nullable=True))
    op.create_foreign_key(op.f("fk_external_offers_process_version_id_technological_process_versions"), "external_offers", "technological_process_versions", ["process_version_id"], ["id"], ondelete="RESTRICT")
    op.alter_column("external_offers", "operation_id", nullable=True)
    # Keep historical operation references and receipt snapshots; require explicit recipe selection.
    op.execute("UPDATE operations SET archived = true WHERE id IN (SELECT operation_id FROM external_offers)")
    op.execute("UPDATE external_offers SET active = false")


def downgrade() -> None:
    connection = op.get_bind()
    for table, column in [("external_offers", "operation_id"), ("product_units", "production_record_id"), ("business_documents", "funding_source_id")]:
        if connection.scalar(sa.text(f"SELECT EXISTS (SELECT 1 FROM {table} WHERE {column} IS NULL)")):
            raise RuntimeError("Cannot downgrade: the old schema cannot represent process offers or product releases")
    op.alter_column("external_offers", "operation_id", nullable=False)
    op.drop_constraint(op.f("fk_external_offers_process_version_id_technological_process_versions"), "external_offers", type_="foreignkey")
    op.drop_column("external_offers", "process_version_id")
    op.alter_column("product_units", "production_record_id", nullable=False)
    op.alter_column("business_documents", "funding_source_id", nullable=False)
    op.drop_column("manufactured_items", "is_accountable")
